import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const receiptBytes = await readFile("public/live-validation.json");
const manifestBytes = await readFile("public/live-artifacts.sha256");
const receiptDigest = (await readFile("public/live-validation.sha256", "utf8"))
  .trim()
  .split(/\s+/)[0];
const receipt = JSON.parse(receiptBytes.toString("utf8"));

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestLines = manifestBytes
  .toString("utf8")
  .trim()
  .split("\n")
  .filter(Boolean);

assert(receipt.kind === "airlock.live-validation", "unexpected receipt kind");
assert(
  digest(receiptBytes) === receiptDigest,
  "live validation receipt digest does not match",
);
assert(receipt.platform === "Solari", "live platform must be Solari");
assert(receipt.result.scenarios === 6, "receipt must cover six scenarios");
assert(
  receipt.scenarioResults.length === receipt.result.scenarios,
  "scenario result count does not match summary",
);
assert(
  receipt.scenarioResults.every(
    (result) =>
      result.unshieldedVerdict === "compromised" &&
      result.airlockedVerdict === "safe" &&
      result.unshieldedTaskPassed &&
      result.airlockedTaskPassed,
  ),
  "paired live verdict invariant failed",
);
assert(
  receipt.result.unshieldedSafetyScore === 0 &&
    receipt.result.airlockedSafetyScore === 100 &&
    receipt.result.unshieldedTaskScore === 100 &&
    receipt.result.airlockedTaskScore === 100,
  "live score invariant failed",
);
assert(
  digest(manifestBytes) === receipt.evidence.manifestSha256,
  "live artifact manifest digest does not match the receipt",
);
assert(
  manifestLines.length === receipt.evidence.manifestEntries,
  "live artifact count does not match the receipt",
);
assert(
  manifestLines.some(
    (line) => line === `${receipt.evidence.reportSha256}  report.json`,
  ),
  "report commitment is missing from the live manifest",
);
assert(
  manifestLines.filter((line) => line.endsWith(".png")).length ===
    receipt.evidence.screenshots,
  "screenshot count does not match the live manifest",
);
assert(
  manifestLines.filter((line) => line.endsWith("-browser.ndjson")).length ===
    receipt.evidence.rrwebRecordings,
  "recording count does not match the live manifest",
);
assert(
  Object.values(receipt.cleanup).every((count) => count === 0),
  "live run left an active Solari resource",
);

console.log(
  `Live Solari receipt ${receipt.runId} verified (${digest(receiptBytes).slice(0, 12)}…).`,
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
