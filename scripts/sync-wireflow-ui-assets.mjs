#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format } from "prettier";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const atlasRoot = process.env.CIVIC_WIREFLOW_ATLAS_ROOT ?? "/Users/junseok/Desktop/CIVIC AI";
const detailModulePath = path.join(atlasRoot, "src/screen-detail-data.js");
const captureRoot = path.join(atlasRoot, "tmp/pdfs/production-screen-captures");
const blueprintPath = path.join(repositoryRoot, "apps/web/lib/wireflow/atlas-ui.v2.generated.json");
const manifestPath = path.join(repositoryRoot, "e2e/visual-baselines/manifest.v2.json");
const baselineRoot = path.join(repositoryRoot, "e2e/visual-baselines/latest");
const checkOnly = process.argv.includes("--check");

const activeScreenIds = Object.freeze([
  ...screenRange("AUTH", 10),
  ...screenRange("COMMON", 4),
  "U-HOME-001",
  ...screenRange("U-ACCOUNT", 4),
  "A-HOME-001",
  ...screenRange("A-USER", 5),
  ...screenRange("U-RAG", 3),
  ...screenRange("A-RAG", 6),
]);

if (!existsSync(detailModulePath) || !existsSync(captureRoot)) {
  throw new Error(`latest Wire Flow Atlas source is unavailable: ${atlasRoot}`);
}

const detailModule = await import(`${pathToFileURL(detailModulePath).href}?sync=${Date.now()}`);
const detailsById = new Map(detailModule.screenDetails.map((detail) => [detail.id, detail]));
const screens = activeScreenIds.map((id) => normalizeScreen(detailsById.get(id), id));
const blueprint = await format(JSON.stringify({ version: 2, screens }), { parser: "json" });
const manifestEntries = activeScreenIds.map((id) => captureEntry(id));
const manifest = await format(
  JSON.stringify(
    {
      version: 2,
      capturedAt: "2026-08-12T23:31:00+09:00",
      sourceRoot: captureRoot,
      entries: manifestEntries,
    },
    null,
  ),
  { parser: "json" },
);

if (checkOnly) {
  assertExactFile(blueprintPath, blueprint);
  assertExactFile(manifestPath, manifest);
  for (const entry of manifestEntries) {
    const source = readFileSync(entry.source);
    const target = readFileSync(path.join(baselineRoot, entry.file));
    if (!source.equals(target)) {
      throw new Error(`canonical capture drifted: ${entry.id}`);
    }
  }
  process.stdout.write("latest Wire Flow UI assets are current\n");
  process.exit(0);
}

mkdirSync(path.dirname(blueprintPath), { recursive: true });
mkdirSync(baselineRoot, { recursive: true });
rmSync(baselineRoot, { recursive: true, force: true });
mkdirSync(baselineRoot, { recursive: true });

writeFileSync(blueprintPath, blueprint, { mode: 0o644 });
for (const entry of manifestEntries) {
  copyFileSync(entry.source, path.join(baselineRoot, entry.file));
}
writeFileSync(manifestPath, manifest, { mode: 0o644 });
process.stdout.write(`froze ${activeScreenIds.length} latest Wire Flow product screens\n`);

function normalizeScreen(screen, expectedId) {
  if (!screen || screen.id !== expectedId) {
    throw new Error(`missing active Wire Flow screen: ${expectedId}`);
  }
  return jsonValue({
    id: screen.id,
    layout: screen.layout,
    header: screen.header,
    blocks: screen.blocks,
    primaryState: screen.primaryState,
    exceptionState: screen.exceptionState,
  });
}

function jsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function captureEntry(id) {
  const source = path.join(captureRoot, `${id}.png`);
  const contents = readFileSync(source);
  const [width, height] = pngDimensions(contents);
  const isMobile = width === 788 && height === 1706;
  const isDesktop = width === 2880 && height === 1802;
  if (!isMobile && !isDesktop) {
    throw new Error(`unexpected canonical capture size for ${id}: ${width}x${height}`);
  }
  return {
    id,
    file: `${id}.png`,
    source,
    sha256: createHash("sha256").update(contents).digest("hex"),
    width,
    height,
    viewportWidth: isDesktop ? 1440 : 394,
    viewportHeight: isDesktop ? 901 : 853,
  };
}

function pngDimensions(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("canonical capture must be a PNG");
  }
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

function assertExactFile(file, expected) {
  if (!existsSync(file) || readFileSync(file, "utf8") !== expected) {
    throw new Error(`generated Wire Flow asset is stale: ${path.relative(repositoryRoot, file)}`);
  }
}

function screenRange(prefix, count) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`,
  );
}
