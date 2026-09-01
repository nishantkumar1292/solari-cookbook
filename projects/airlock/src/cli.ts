#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process, { loadEnvFile } from "node:process";

import { runOffline } from "./runner/offline.js";
import { runSolari } from "./runner/solari.js";

async function main(): Promise<void> {
  const [, , command = "run", ...args] = process.argv;
  if (command !== "run") {
    throw new Error(
      `Unknown command “${command}”. Use: airlock run --mode offline|solari`,
    );
  }

  const mode = readFlag(args, "--mode") ?? "offline";
  if (mode !== "offline" && mode !== "solari") {
    throw new Error(`Unknown mode “${mode}”. Expected offline or solari.`);
  }
  if (mode === "solari" && existsSync(".env")) loadEnvFile(".env");

  const report =
    mode === "solari"
      ? await runSolari()
      : await runOffline(
          args.includes("--fresh")
            ? {}
            : {
                id: "arl_20260901044905",
                generatedAt: "2026-09-01T04:49:05.000Z",
              },
        );
  const publicDir = path.resolve("public");
  const artifactRoot = path.resolve(
    process.env.AIRLOCK_ARTIFACTS_DIR ?? "artifacts",
  );
  const runDir = path.join(artifactRoot, report.id);
  await Promise.all([
    mkdir(publicDir, { recursive: true }),
    mkdir(runDir, { recursive: true }),
  ]);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const publicDigest = createHash("sha256").update(json).digest("hex");
  await Promise.all([
    writeFile(path.join(publicDir, "demo-run.json"), json, "utf8"),
    writeFile(
      path.join(publicDir, "demo-run.sha256"),
      `${publicDigest}  public/demo-run.json\n`,
      "utf8",
    ),
    writeFile(path.join(runDir, "report.json"), json, "utf8"),
  ]);
  await writeManifest(runDir);

  const left = report.tracks.unshielded;
  const right = report.tracks.airlocked;
  console.log(`AIRLOCK run ${report.id}`);
  console.log(`  range       ${report.environment.range}`);
  console.log(
    `  unshielded  safety ${left.safetyScore}% · task ${left.taskScore}%`,
  );
  console.log(
    `  airlocked   safety ${right.safetyScore}% · task ${right.taskScore}%`,
  );
  console.log(`  evidence    ${path.join(runDir, "report.json")}`);
  console.log("  dashboard   npm run dev");
}

async function writeManifest(runDir: string): Promise<void> {
  const names = (await readdir(runDir))
    .filter((name) => name !== "MANIFEST.sha256")
    .sort();
  const lines = await Promise.all(
    names.map(async (name) => {
      const bytes = await readFile(path.join(runDir, name));
      const digest = createHash("sha256").update(bytes).digest("hex");
      return `${digest}  ${name}`;
    }),
  );
  await writeFile(
    path.join(runDir, "MANIFEST.sha256"),
    `${lines.join("\n")}\n`,
    "utf8",
  );
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AIRLOCK failed: ${message}`);
  process.exitCode = 1;
});
