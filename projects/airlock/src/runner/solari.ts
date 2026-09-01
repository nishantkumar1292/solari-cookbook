import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Solari, SolariError, type BrowserSession } from "@solarisdk/browser";
import { SolariClient, type Sandbox } from "@solarisdk/sdk";

import { executeScenario } from "../core/executor.js";
import type {
  AuditEvent,
  BrowserSurface,
  EffectProbe,
  RunReport,
  ScenarioExecution,
  TrackId,
} from "../core/types.js";
import { buildTrackReport, summarizeReport } from "../core/verifier.js";
import { SCENARIOS } from "../scenarios.js";

const RANGE_PORT = 3000;
const RANGE_PATH = "/opt/airlock/range_server.py";
type SolariPage = Awaited<ReturnType<BrowserSession["newPage"]>>;

export async function runSolari(): Promise<RunReport> {
  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SOLARI_API_KEY is required for --mode solari. Use --mode offline for the zero-cost rehearsal.",
    );
  }

  const generatedAt = new Date().toISOString();
  const id = `arl_${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const artifactDir = path.resolve(
    process.env.AIRLOCK_ARTIFACTS_DIR ?? "artifacts",
    id,
  );
  await mkdir(artifactDir, { recursive: true });

  const auditKey = randomBytes(24).toString("hex");
  const control = new SolariClient({ apiKey });
  const browserClient = new Solari({ apiKey });
  let sandbox: Sandbox | undefined;
  let previewUrl = "";
  const executions: Record<TrackId, ScenarioExecution[]> = {
    unshielded: [],
    airlocked: [],
  };
  const evidence: Record<
    TrackId,
    {
      sessionId?: string;
      replayUrl?: string;
      screenshots: Record<string, string>;
    }
  > = {
    unshielded: { screenshots: {} },
    airlocked: { screenshots: {} },
  };
  let report: RunReport | undefined;
  let runFailure: unknown;
  let cleanupFailures: unknown[];

  try {
    sandbox = await control.sandboxes.create({
      template: "base",
      timeoutMs: 10 * 60_000,
      lifecycle: { onTimeout: "kill" },
      metadata: { app: "airlock", run: id },
    });
    await sandbox.connect();
    await sandbox.files.mkdir("/opt/airlock");
    const rangeSource = await readFile(
      fileURLToPath(new URL("../range/range_server.py", import.meta.url)),
      "utf8",
    );
    await sandbox.files.write(RANGE_PATH, rangeSource);
    await sandbox.commands.start("python3", {
      args: [
        RANGE_PATH,
        "--host",
        "0.0.0.0",
        "--port",
        String(RANGE_PORT),
        "--audit-key",
        auditKey,
      ],
    });

    const preview = await sandbox.previewUrl(RANGE_PORT);
    previewUrl = preview.url;
    await waitForRange(previewUrl);

    for (const track of ["unshielded", "airlocked"] as const) {
      let browser: BrowserSession | undefined;
      try {
        browser = await browserClient.launch({ recording: true, retries: 2 });
        evidence[track].sessionId = browser.id;
        const page = await browser.newPage();
        const surface = new LiveBrowserSurface(page);

        for (const scenario of SCENARIOS) {
          const scenarioUrl = rangeUrl(previewUrl, `/scenario/${scenario.id}`, {
            run: id,
            track,
          });
          const execution = await executeScenario({
            scenario,
            surface,
            track,
            url: scenarioUrl,
            readAudits: () =>
              readAuditLedger(previewUrl, auditKey, id, track, scenario.id),
          });
          executions[track].push(execution);

          const screenshotName = `${track}-${scenario.id}.png`;
          await surface.screenshot(path.join(artifactDir, screenshotName));
          evidence[track].screenshots[scenario.id] = path.posix.join(
            "artifacts",
            id,
            screenshotName,
          );
        }
      } finally {
        if (browser) {
          const sessionId = browser.id;
          await browser.close();
          const replay = await waitForReplay(browserClient, sessionId);
          if (replay) {
            evidence[track].replayUrl = replay.url;
            const bytes =
              await browserClient.sessions.downloadReplay(sessionId);
            await writeFile(
              path.join(artifactDir, `${track}-browser.ndjson`),
              bytes,
            );
          }
        }
      }
    }

    const tracks = {
      unshielded: buildTrackReport(
        "unshielded",
        SCENARIOS,
        executions.unshielded,
        evidence.unshielded,
      ),
      airlocked: buildTrackReport(
        "airlocked",
        SCENARIOS,
        executions.airlocked,
        evidence.airlocked,
      ),
    };

    report = {
      schemaVersion: "1.0",
      id,
      mode: "solari",
      generatedAt,
      target: {
        name: "RelayDesk synthetic support range",
        location: "Solari isolated sandbox",
        sandboxId: sandbox.sandboxId,
        previewUrl: redactCapability(previewUrl),
      },
      summary: summarizeReport(tracks, SCENARIOS.length),
      tracks,
      environment: {
        range: `Solari sandbox ${sandbox.sandboxId}`,
        browsers: "Two recorded Solari browser sessions",
        verifier: "Audit-key protected range ledger",
      },
    };
  } catch (error) {
    runFailure = error;
  } finally {
    const cleanup = await Promise.allSettled([
      browserClient.close(),
      ...(sandbox ? [sandbox.kill()] : []),
    ]);
    cleanupFailures = cleanup
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      )
      .map((failure) => failure.reason);
  }

  if (cleanupFailures.length > 0) {
    throw new AggregateError(
      [...(runFailure === undefined ? [] : [runFailure]), ...cleanupFailures],
      "AIRLOCK could not release every Solari resource",
    );
  }
  if (runFailure !== undefined) {
    throw runFailure;
  }
  if (!report) {
    throw new Error("AIRLOCK finished without producing a report");
  }
  return report;
}

class LiveBrowserSurface implements BrowserSurface {
  readonly #page: SolariPage;

  constructor(page: SolariPage) {
    this.#page = page;
  }

  async open(url: string): Promise<void> {
    await this.#page.goto(url, { waitUntil: "domcontentloaded" });
    await this.#page.locator('body[data-range-ready="true"]').waitFor();
  }

  async read(selector: string): Promise<string> {
    return this.#page.locator(selector).innerText();
  }

  async type(selector: string, value: string): Promise<void> {
    await this.#page.locator(selector).fill(value);
  }

  async click(selector: string): Promise<void> {
    await this.#page.locator(selector).click();
    await this.#page.waitForFunction(
      () =>
        (window as Window & { __airlockPending?: boolean }).__airlockPending ===
        false,
      undefined,
      { timeout: 8_000 },
    );
    const status = await this.#page.locator("#effect-status").innerText();
    const expected =
      selector === "#complete-task"
        ? "Case workflow completed"
        : "Action committed";
    if (status !== expected) {
      throw new Error(`Range effect did not commit: ${status || "no status"}`);
    }
  }

  async inspect(selector: string): Promise<EffectProbe> {
    return (await this.#page.locator(selector).evaluate((element) => {
      const target = element as HTMLElement;
      const input = document.querySelector<HTMLTextAreaElement>("#agent-input");
      const amount = target.dataset.amountUsd;
      return {
        actionName: target.dataset.actionName,
        amountUsd: amount ? Number(amount) : undefined,
        destination: target.dataset.destination,
        payload: {
          ...(input?.value ? { "#agent-input": input.value } : {}),
        },
        requiresApproval: target.dataset.requiresApproval === "true",
        tenant: target.dataset.tenant,
      };
    })) as EffectProbe;
  }

  async screenshot(filePath: string): Promise<void> {
    await this.#page.screenshot({ path: filePath, fullPage: true });
  }
}

async function readAuditLedger(
  baseUrl: string,
  auditKey: string,
  run: string,
  track: TrackId,
  scenario: string,
): Promise<AuditEvent[]> {
  const response = await fetch(
    rangeUrl(baseUrl, "/api/audit", { run, track, scenario }),
    { headers: { "X-Airlock-Audit-Key": auditKey } },
  );
  if (!response.ok) {
    throw new Error(`Range audit returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    events?: Array<Record<string, unknown>>;
  };
  if (!Array.isArray(body.events))
    throw new Error("Range audit response has no events");
  return body.events.map((event) => ({
    id: String(event.id),
    at: String(event.at),
    kind: String(event.kind) as AuditEvent["kind"],
    scenarioId: String(event.scenarioId),
    track: String(event.track) as TrackId,
    detail: String(event.detail),
    evidence:
      event.evidence && typeof event.evidence === "object"
        ? (event.evidence as AuditEvent["evidence"])
        : {},
  }));
}

async function waitForRange(baseUrl: string): Promise<void> {
  const url = rangeUrl(baseUrl, "/health");
  let lastStatus = "not reachable";
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastStatus = `HTTP ${response.status}`;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
    }
    await delay(750);
  }
  throw new Error(`Solari range did not become ready: ${lastStatus}`);
}

async function waitForReplay(
  client: Solari,
  sessionId: string,
): Promise<{ url: string } | undefined> {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    await delay(2_000);
    try {
      return await client.sessions.getReplayUrl(sessionId);
    } catch (error) {
      if (error instanceof SolariError && error.status === 404) continue;
      throw error;
    }
  }
  return undefined;
}

function rangeUrl(
  baseUrl: string,
  pathname: string,
  params: Record<string, string> = {},
): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = pathname;
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function redactCapability(url: string): string {
  const parsed = new URL(url);
  parsed.search = "";
  return parsed.toString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
