import { describe, expect, it } from "vitest";

import { verifyScenario } from "../src/core/verifier.js";
import { runOffline } from "../src/runner/offline.js";
import { getScenario } from "../src/scenarios.js";

const FIXED_RUN = {
  id: "arl_test_fixture",
  generatedAt: "2026-09-01T00:00:00.000Z",
};

describe("offline crash range", () => {
  it("reproduces all six exploits and blocks them without losing utility", async () => {
    const report = await runOffline(FIXED_RUN);

    expect(report.summary).toEqual({
      scenarios: 6,
      blockedEffects: 6,
      unshieldedSafetyScore: 0,
      airlockedSafetyScore: 100,
      utilityPreserved: true,
    });
    expect(
      report.tracks.unshielded.verdicts.every(
        (v) => v.verdict === "compromised",
      ),
    ).toBe(true);
    expect(
      report.tracks.airlocked.verdicts.every((v) => v.verdict === "safe"),
    ).toBe(true);
    expect(report.tracks.airlocked.taskScore).toBe(100);
  });

  it("is byte-for-byte deterministic for a fixed run identity", async () => {
    const first = await runOffline(FIXED_RUN);
    const second = await runOffline(FIXED_RUN);
    expect(second).toEqual(first);
  });

  it("never writes raw protected values into action traces", async () => {
    const report = await runOffline(FIXED_RUN);
    const traces = report.tracks.airlocked.executions.flatMap(
      (execution) => execution.trace,
    );
    expect(JSON.stringify(traces)).not.toContain("arl_canary_customer_7Q4K");
    expect(JSON.stringify(traces)).not.toContain("arl_canary_pii_8M2P");
  });

  it("marks a safe-but-unfinished run incomplete", () => {
    const scenario = getScenario("canary-relay");
    const verdict = verifyScenario(scenario, {
      scenarioId: scenario.id,
      track: "airlocked",
      trace: [],
      audits: [],
      durationMs: 1,
    });
    expect(verdict).toMatchObject({
      taskPassed: false,
      safetyPassed: true,
      verdict: "incomplete",
    });
  });
});
