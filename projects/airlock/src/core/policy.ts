import type { CrashScenario, EffectProbe, PolicyDecision } from "./types.js";

export const POLICY_RULES = {
  sensitiveEgress: "ARL-101 / protected data egress",
  amountLimit: "ARL-201 / transaction ceiling",
  tenantBoundary: "ARL-301 / tenant boundary",
  destinationAllowlist: "ARL-401 / destination allowlist",
  approvalProvenance: "ARL-501 / approval provenance",
} as const;

export class PolicySidecar {
  readonly #enabled: boolean;
  readonly #scenario: CrashScenario;
  readonly #sensitiveValues = new Set<string>();

  constructor(scenario: CrashScenario, enabled: boolean) {
    this.#scenario = scenario;
    this.#enabled = enabled;
  }

  observeRead(selector: string, value: string): boolean {
    const sensitive =
      this.#scenario.policy.sensitiveSelectors.includes(selector);
    if (sensitive && value) this.#sensitiveValues.add(value);
    return sensitive;
  }

  evaluateClick(probe: EffectProbe): PolicyDecision {
    if (!this.#enabled) return { outcome: "allowed" };

    const payloadValues = Object.values(probe.payload);
    const leakingValue = payloadValues.find((candidate) =>
      [...this.#sensitiveValues].some(
        (secret) => candidate === secret || candidate.includes(secret),
      ),
    );

    if (
      leakingValue &&
      probe.destination &&
      !this.#scenario.policy.allowedDestinations.includes(probe.destination)
    ) {
      return {
        outcome: "blocked",
        rule: POLICY_RULES.sensitiveEgress,
        reason:
          "A value read from a protected field was about to cross an untrusted boundary.",
      };
    }

    if (
      probe.amountUsd !== undefined &&
      probe.amountUsd > this.#scenario.policy.maxAmountUsd
    ) {
      return {
        outcome: "blocked",
        rule: POLICY_RULES.amountLimit,
        reason: `$${probe.amountUsd.toLocaleString("en-US")} exceeds the $${this.#scenario.policy.maxAmountUsd.toLocaleString("en-US")} agent limit.`,
      };
    }

    if (probe.tenant && probe.tenant !== this.#scenario.policy.allowedTenant) {
      return {
        outcome: "blocked",
        rule: POLICY_RULES.tenantBoundary,
        reason: `The action targets tenant “${probe.tenant}”; this run is scoped to “${this.#scenario.policy.allowedTenant}”.`,
      };
    }

    if (probe.requiresApproval) {
      const suppliedApproval = probe.payload.approvalToken;
      if (
        !this.#scenario.policy.validApprovalToken ||
        suppliedApproval !== this.#scenario.policy.validApprovalToken
      ) {
        return {
          outcome: "blocked",
          rule: POLICY_RULES.approvalProvenance,
          reason:
            "Page text claimed approval, but the control plane supplied no valid approval token.",
        };
      }
    }

    if (
      probe.destination &&
      !this.#scenario.policy.allowedDestinations.includes(probe.destination)
    ) {
      return {
        outcome: "blocked",
        rule: POLICY_RULES.destinationAllowlist,
        reason: `Destination “${probe.destination}” is outside this task's allowlist.`,
      };
    }

    return { outcome: "allowed" };
  }
}
