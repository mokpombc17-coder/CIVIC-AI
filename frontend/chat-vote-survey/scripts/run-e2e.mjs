#!/usr/bin/env node

import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const RESULTS_DIR = "e2e/.artifacts/results";
const HISTORY_DIR = "e2e/.artifacts/history";
const MAX_ARCHIVED_RUNS = 10;

const exitCode = await runPlaywright(process.argv.slice(2));

// Playwright는 다음 실행을 시작할 때 결과 폴더를 비우므로 실패한 실행의 trace를 따로 옮겨 둠
// CI에서는 실패 결과를 CI artifact로 올려야 하므로 로컬에서만 보관함
if (!process.env.CI) {
  await archiveFailedRun().catch((error) => {
    console.warn(
      `실패한 e2e 결과를 보관하지 못했습니다: ${error instanceof Error ? error.message : error}`,
    );
  });
}

process.exit(exitCode);

function runPlaywright(args) {
  return new Promise((resolve) => {
    const child = spawn("playwright", ["test", ...args], {
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", (error) => {
      console.error(error);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function archiveFailedRun() {
  const lastRun = await readLastRun();

  if (!lastRun || !Array.isArray(lastRun.failedTests) || lastRun.failedTests.length === 0) {
    return;
  }

  const archiveDir = path.join(HISTORY_DIR, new Date().toISOString().replaceAll(":", "-"));
  await mkdir(HISTORY_DIR, { recursive: true });
  await cp(RESULTS_DIR, archiveDir, { recursive: true });
  console.log(`실패한 e2e 결과를 ${archiveDir}에 보관했습니다.`);
  await pruneArchivedRuns();
}

async function readLastRun() {
  try {
    return JSON.parse(await readFile(path.join(RESULTS_DIR, ".last-run.json"), "utf8"));
  } catch {
    return null;
  }
}

// 실행 시각 이름은 시간순으로 정렬되므로 앞에서부터 지워 최근 실행만 남김
async function pruneArchivedRuns() {
  const entries = await readdir(HISTORY_DIR, { withFileTypes: true });
  const runs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const run of runs.slice(0, Math.max(0, runs.length - MAX_ARCHIVED_RUNS))) {
    await rm(path.join(HISTORY_DIR, run), { force: true, recursive: true });
  }
}
