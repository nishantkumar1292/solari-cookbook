import { PolicySidecar } from "./policy.js";
import type {
  AuditEvent,
  BrowserSurface,
  CrashScenario,
  ScenarioExecution,
  TraceEvent,
  TrackId,
} from "./types.js";

interface ExecuteOptions {
  scenario: CrashScenario;
  surface: BrowserSurface;
  track: TrackId;
  url: string;
  readAudits: () => Promise<AuditEvent[]>;
  now?: () => number;
}

interface MemoryCell {
  sensitive: boolean;
  value: string;
}

export async function executeScenario({
  scenario,
  surface,
  track,
  url,
  readAudits,
  now = () => performance.now(),
}: ExecuteOptions): Promise<ScenarioExecution> {
  const started = now();
  const memory = new Map<string, MemoryCell>();
  const trace: TraceEvent[] = [];
  const sidecar = new PolicySidecar(scenario, track === "airlocked");

  await surface.open(url);

  for (const [index, action] of scenario.tape.entries()) {
    const atMs = Math.max(0, Math.round(now() - started));
    const base = {
      id: `${track}-${scenario.id}-${index + 1}`,
      actionId: action.id,
      atMs,
      kind: action.kind,
      description: action.description,
      selector: action.selector,
    } as const;

    if (action.kind === "read") {
      const value = await surface.read(action.selector);
      const sensitive = sidecar.observeRead(action.selector, value);
      memory.set(action.storeAs, { value, sensitive });
      trace.push({
        ...base,
        outcome: "allowed",
        valuePreview: sensitive
          ? "[protected value registered]"
          : preview(value),
      });
      continue;
    }

    if (action.kind === "type") {
      const cell =
        "memory" in action.value
          ? memory.get(action.value.memory)
          : { value: action.value.literal, sensitive: false };
      if (!cell) {
        throw new Error(
          `Action ${action.id} reads missing memory key ${"memory" in action.value ? action.value.memory : "<literal>"}`,
        );
      }
      await surface.type(action.selector, cell.value);
      trace.push({
        ...base,
        outcome: "allowed",
        valuePreview: cell.sensitive
          ? "[protected value staged]"
          : preview(cell.value),
      });
      continue;
    }

    const probe = await surface.inspect(action.selector);
    const decision = sidecar.evaluateClick(probe);
    if (decision.outcome === "allowed") await surface.click(action.selector);
    trace.push({
      ...base,
      outcome: decision.outcome,
      policyRule: decision.rule,
      policyReason: decision.reason,
    });
  }

  return {
    scenarioId: scenario.id,
    track,
    trace,
    audits: await readAudits(),
    durationMs: Math.max(1, Math.round(now() - started)),
  };
}

function preview(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 72 ? `${compact.slice(0, 69)}…` : compact;
}
