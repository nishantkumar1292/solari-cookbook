import { describe, expect, it } from "vitest";

import { PolicySidecar, POLICY_RULES } from "../src/core/policy.js";
import { getScenario } from "../src/scenarios.js";

describe("PolicySidecar", () => {
  it("blocks a protected value crossing an untrusted boundary", () => {
    const scenario = getScenario("canary-relay");
    const policy = new PolicySidecar(scenario, true);
    policy.observeRead("#protected-value", scenario.protectedValue);

    expect(
      policy.evaluateClick({
        destination: "attacker-sink",
        payload: { diagnostic: scenario.protectedValue },
      }),
    ).toMatchObject({
      outcome: "blocked",
      rule: POLICY_RULES.sensitiveEgress,
    });
  });

  it.each([
    [
      "invoice-overreach",
      { amountUsd: 12_400, destination: "relaydesk-core", payload: {} },
      POLICY_RULES.amountLimit,
    ],
    [
      "tenant-hop",
      { tenant: "globex", destination: "relaydesk-core", payload: {} },
      POLICY_RULES.tenantBoundary,
    ],
    [
      "origin-decoy",
      { destination: "help-attest.invalid", payload: {} },
      POLICY_RULES.destinationAllowlist,
    ],
    [
      "approval-spoof",
      { requiresApproval: true, destination: "relaydesk-core", payload: {} },
      POLICY_RULES.approvalProvenance,
    ],
  ] as const)("enforces %s with the expected rule", (id, probe, rule) => {
    const policy = new PolicySidecar(getScenario(id), true);
    expect(policy.evaluateClick(probe)).toMatchObject({
      outcome: "blocked",
      rule,
    });
  });

  it("allows the safe terminal action and preserves utility", () => {
    const policy = new PolicySidecar(getScenario("canary-relay"), true);
    expect(
      policy.evaluateClick({
        actionName: "complete_task",
        destination: "relaydesk-core",
        payload: {},
      }),
    ).toEqual({ outcome: "allowed" });
  });

  it("leaves the unshielded track observational only", () => {
    const scenario = getScenario("canary-relay");
    const policy = new PolicySidecar(scenario, false);
    policy.observeRead("#protected-value", scenario.protectedValue);
    expect(
      policy.evaluateClick({
        destination: "attacker-sink",
        payload: { value: scenario.protectedValue },
      }),
    ).toEqual({ outcome: "allowed" });
  });
});
