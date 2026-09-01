import { SCENARIOS } from "../scenarios.js";
import { executeScenario } from "../core/executor.js";
import { buildTrackReport, summarizeReport } from "../core/verifier.js";
import type {
  AuditEvent,
  BrowserSurface,
  CrashScenario,
  EffectProbe,
  RunReport,
  ScenarioExecution,
  TrackId,
} from "../core/types.js";

interface OfflineRunOptions {
  generatedAt?: string;
  id?: string;
}

export async function runOffline(
  options: OfflineRunOptions = {},
): Promise<RunReport> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const id = options.id ?? makeRunId(generatedAt);
  const executions: Record<TrackId, ScenarioExecution[]> = {
    unshielded: [],
    airlocked: [],
  };

  for (const track of ["unshielded", "airlocked"] as const) {
    for (const [scenarioIndex, scenario] of SCENARIOS.entries()) {
      const surface = new InMemoryRange(
        id,
        track,
        scenario,
        generatedAt,
        scenarioIndex,
      );
      const now = steppedClock();
      executions[track].push(
        await executeScenario({
          scenario,
          surface,
          track,
          url: `in-memory://relaydesk/${scenario.id}`,
          readAudits: () => surface.readAudits(),
          now,
        }),
      );
    }
  }

  const tracks = {
    unshielded: buildTrackReport(
      "unshielded",
      SCENARIOS,
      executions.unshielded,
    ),
    airlocked: buildTrackReport("airlocked", SCENARIOS, executions.airlocked),
  };

  return {
    schemaVersion: "1.0",
    id,
    mode: "offline",
    generatedAt,
    target: {
      name: "RelayDesk synthetic support range",
      location: "in-memory://relaydesk-range",
    },
    summary: summarizeReport(tracks, SCENARIOS.length),
    tracks,
    environment: {
      range: "Deterministic in-memory twin",
      browsers: "Action-compatible rehearsal surfaces",
      verifier: "Private authoritative audit ledger",
    },
  };
}

export class InMemoryRange implements BrowserSurface {
  readonly #runId: string;
  readonly #track: TrackId;
  readonly #scenario: CrashScenario;
  readonly #generatedAt: string;
  readonly #scenarioIndex: number;
  readonly #inputs = new Map<string, string>();
  readonly #audits: AuditEvent[] = [];
  #auditCounter = 0;

  constructor(
    runId: string,
    track: TrackId,
    scenario: CrashScenario,
    generatedAt: string,
    scenarioIndex = 0,
  ) {
    this.#runId = runId;
    this.#track = track;
    this.#scenario = scenario;
    this.#generatedAt = generatedAt;
    this.#scenarioIndex = scenarioIndex;
  }

  async open(): Promise<void> {
    this.#inputs.clear();
  }

  async read(selector: string): Promise<string> {
    if (selector === "#untrusted-message") return this.#scenario.injection;
    if (selector === "#protected-value") return this.#scenario.protectedValue;
    throw new Error(`Offline range has no readable target ${selector}`);
  }

  async type(selector: string, value: string): Promise<void> {
    this.#inputs.set(selector, value);
  }

  async inspect(selector: string): Promise<EffectProbe> {
    if (selector === "#complete-task") {
      return {
        actionName: "complete_task",
        destination: "relaydesk-core",
        payload: {},
      };
    }
    if (selector !== "#unsafe-action") {
      return { payload: {} };
    }

    return {
      ...this.#scenario.unsafeProbe,
      payload: {
        ...(this.#scenario.unsafeProbe.payload ?? {}),
        ...Object.fromEntries(this.#inputs),
      },
    };
  }

  async click(selector: string): Promise<void> {
    if (selector === "#complete-task") {
      this.#record(
        "task_completed",
        "The requested case workflow reached its safe terminal state.",
        { caseState: "resolved" },
      );
      return;
    }
    if (selector !== "#unsafe-action") return;

    const stagedValue = this.#inputs.get("#agent-input") ?? "";
    const effect = this.#scenario.unsafeEffect;
    if (
      (effect === "canary_exfiltrated" || effect === "bulk_pii_uploaded") &&
      !stagedValue
    ) {
      return;
    }

    this.#record(effect, this.#scenario.unsafeEffectLabel, {
      action: this.#scenario.unsafeProbe.actionName ?? "unknown",
      destination: this.#scenario.unsafeProbe.destination ?? "unknown",
      ...(this.#scenario.unsafeProbe.amountUsd
        ? { amountUsd: this.#scenario.unsafeProbe.amountUsd }
        : {}),
      ...(this.#scenario.unsafeProbe.tenant
        ? { tenant: this.#scenario.unsafeProbe.tenant }
        : {}),
      ...(stagedValue ? { containedSeededCanary: true } : {}),
    });
  }

  async readAudits(): Promise<AuditEvent[]> {
    return structuredClone(this.#audits);
  }

  #record(
    kind: AuditEvent["kind"],
    detail: string,
    evidence: AuditEvent["evidence"],
  ): void {
    this.#auditCounter += 1;
    const trackOffset = this.#track === "airlocked" ? 30_000 : 0;
    const eventOffset =
      this.#scenarioIndex * 2_000 + trackOffset + this.#auditCounter * 250;
    this.#audits.push({
      id: `${this.#runId}-${this.#track}-${this.#scenario.id}-${this.#auditCounter}`,
      at: new Date(
        new Date(this.#generatedAt).getTime() + eventOffset,
      ).toISOString(),
      kind,
      scenarioId: this.#scenario.id,
      track: this.#track,
      detail,
      evidence,
    });
  }
}

function steppedClock(): () => number {
  let current = -420;
  return () => {
    current += 420;
    return current;
  };
}

function makeRunId(timestamp: string): string {
  return `arl_${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}
