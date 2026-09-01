export type TrackId = "unshielded" | "airlocked";

export type AuditKind =
  | "task_completed"
  | "canary_exfiltrated"
  | "high_value_approved"
  | "cross_tenant_exported"
  | "off_origin_contacted"
  | "unsigned_action_committed"
  | "bulk_pii_uploaded";

export type PolicyOutcome = "allowed" | "blocked";

export interface ReadAction {
  id: string;
  kind: "read";
  selector: string;
  storeAs: string;
  description: string;
}

export interface TypeAction {
  id: string;
  kind: "type";
  selector: string;
  value: { literal: string } | { memory: string };
  description: string;
}

export interface ClickAction {
  id: string;
  kind: "click";
  selector: string;
  description: string;
}

export type AgentAction = ReadAction | TypeAction | ClickAction;

export interface EffectProbe {
  actionName?: string;
  amountUsd?: number;
  destination?: string;
  payload: Record<string, string>;
  requiresApproval?: boolean;
  tenant?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  kind: AuditKind;
  scenarioId: string;
  track: TrackId;
  detail: string;
  evidence: Record<string, string | number | boolean>;
}

export interface TraceEvent {
  id: string;
  actionId: string;
  atMs: number;
  kind: AgentAction["kind"];
  description: string;
  selector: string;
  outcome: PolicyOutcome;
  valuePreview?: string;
  policyRule?: string;
  policyReason?: string;
}

export interface PolicyDecision {
  outcome: PolicyOutcome;
  rule?: string;
  reason?: string;
}

export interface ScenarioPolicy {
  allowedDestinations: string[];
  allowedTenant: string;
  maxAmountUsd: number;
  sensitiveSelectors: string[];
  validApprovalToken?: string;
}

export interface CrashScenario {
  id: string;
  ordinal: string;
  title: string;
  shortTitle: string;
  channel: string;
  severity: "critical" | "high";
  userTask: string;
  injection: string;
  unsafeEffect: AuditKind;
  unsafeEffectLabel: string;
  successEffect: AuditKind;
  policy: ScenarioPolicy;
  tape: AgentAction[];
  protectedValue: string;
  unsafeProbe: Omit<EffectProbe, "payload"> & {
    payload?: Record<string, string>;
  };
}

export interface BrowserSurface {
  open(url: string): Promise<void>;
  read(selector: string): Promise<string>;
  type(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  inspect(selector: string): Promise<EffectProbe>;
  screenshot?(path: string): Promise<void>;
}

export interface ScenarioExecution {
  scenarioId: string;
  track: TrackId;
  trace: TraceEvent[];
  audits: AuditEvent[];
  durationMs: number;
}

export interface ScenarioVerdict {
  scenarioId: string;
  taskPassed: boolean;
  safetyPassed: boolean;
  verdict: "safe" | "compromised" | "incomplete";
  unsafeEffect?: AuditEvent;
  successEffect?: AuditEvent;
}

export interface TrackReport {
  id: TrackId;
  label: string;
  policyEnabled: boolean;
  sessionId?: string;
  replayUrl?: string;
  screenshots: Record<string, string>;
  executions: ScenarioExecution[];
  verdicts: ScenarioVerdict[];
  safetyScore: number;
  taskScore: number;
}

export interface RunReport {
  schemaVersion: "1.0";
  id: string;
  mode: "offline" | "solari";
  generatedAt: string;
  target: {
    name: string;
    location: string;
    sandboxId?: string;
    previewUrl?: string;
  };
  summary: {
    scenarios: number;
    blockedEffects: number;
    unshieldedSafetyScore: number;
    airlockedSafetyScore: number;
    utilityPreserved: boolean;
  };
  tracks: Record<TrackId, TrackReport>;
  environment: {
    range: string;
    browsers: string;
    verifier: string;
  };
}
