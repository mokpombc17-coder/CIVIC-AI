import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const blueprintPath = path.join(repositoryRoot, "apps/web/lib/wireflow/atlas-ui.v2.generated.json");
const manifestPath = path.join(repositoryRoot, "e2e/visual-baselines/manifest.v2.json");
const baselineRoot = path.join(repositoryRoot, "e2e/visual-baselines/latest");

const activeScreenIds = Object.freeze([
  ...range("AUTH", 10),
  ...range("COMMON", 4),
  "U-HOME-001",
  ...range("U-ACCOUNT", 4),
  "A-HOME-001",
  ...range("A-USER", 5),
  ...range("U-RAG", 3),
  ...range("A-RAG", 6),
]);

type AtlasBlueprint = Readonly<{
  version: number;
  screens: readonly Readonly<{
    id: string;
    layout: string;
    blocks: readonly unknown[];
    primaryState: Readonly<{ kind: string }>;
    exceptionState: Readonly<{ kind: string }>;
  }>[];
}>;

type VisualManifest = Readonly<{
  version: number;
  capturedAt: string;
  sourceRoot: string;
  entries: readonly Readonly<{
    id: string;
    file: string;
    source: string;
    sha256: string;
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
  }>[];
}>;

describe("latest Wire Flow UI assets", () => {
  it("ships the Pretendard GOV faces used by the Figma Wire Flow", () => {
    const fontRoot = path.join(repositoryRoot, "apps/web/public/assets/fonts");
    const expectedDigests = {
      "PretendardGOV-Bold.subset.woff2":
        "d09a0a9684b5a833681d2a3768a0e8a9163f3bfb04cf4fc0c36ab9dcec10eda9",
      "PretendardGOV-Medium.subset.woff2":
        "6a3b52d655e71ace7c3602087240b3b415f044f5cf95c1b1b97b85dfaf0c650b",
      "PretendardGOV-Regular.subset.woff2":
        "21c9e3b875c6ca0a6dc5bee45c37f95358bfff4a7ee00f0d12b9c1cfab4cfe88",
    } as const;

    for (const [file, digest] of Object.entries(expectedDigests)) {
      expect(
        createHash("sha256")
          .update(readFileSync(path.join(fontRoot, file)))
          .digest("hex"),
      ).toBe(digest);
    }
  });

  it("freezes the exact 34 active Main/Auth and RAG screens", () => {
    const blueprint = readJson<AtlasBlueprint>(blueprintPath);
    const ids = blueprint.screens.map((screen) => screen.id);

    expect(blueprint.version).toBe(2);
    expect(ids).toHaveLength(34);
    expect(ids).toEqual(activeScreenIds);
    expect(
      ids.filter(
        (id) =>
          id.startsWith("A-") ||
          id.startsWith("U-") ||
          id.startsWith("AUTH-") ||
          id.startsWith("COMMON-"),
      ),
    ).toHaveLength(34);
    expect(ids.some((id) => /CHAT|VOTE|DECISION|SIM/.test(id))).toBe(false);

    for (const screen of blueprint.screens) {
      expect(screen.layout).not.toHaveLength(0);
      expect(screen.blocks.length).toBeGreaterThan(0);
      expect(screen.primaryState.kind).not.toHaveLength(0);
      expect(screen.exceptionState.kind).not.toHaveLength(0);
      expect(screen).not.toHaveProperty("deviceFrame");
      expect(screen).not.toHaveProperty("reviewChrome");
    }
  });

  it("binds every screen to one canonical capture with exact provenance", () => {
    const manifest = readJson<VisualManifest>(manifestPath);

    expect(manifest.version).toBe(2);
    expect(Number.isNaN(Date.parse(manifest.capturedAt))).toBe(false);
    expect(manifest.sourceRoot).toBe(
      "/Users/junseok/Desktop/CIVIC AI/tmp/pdfs/production-screen-captures",
    );
    expect(manifest.sourceRoot).not.toMatch(/ui-audit-2026-07-(24|25)/);
    expect(manifest.entries.map((entry) => entry.id)).toEqual(activeScreenIds);

    for (const entry of manifest.entries) {
      const baseline = readFileSync(path.join(baselineRoot, entry.file));
      const [width, height] = pngDimensions(baseline);
      const isDesktop = width === 2880 && height === 1802;

      expect(entry.file).toBe(`${entry.id}.png`);
      expect(entry.source).toBe(`${manifest.sourceRoot}/${entry.id}.png`);
      expect(entry.sha256).toBe(createHash("sha256").update(baseline).digest("hex"));
      expect([entry.width, entry.height]).toEqual([width, height]);
      expect([
        [788, 1706],
        [2880, 1802],
      ]).toContainEqual([width, height]);
      expect([entry.viewportWidth, entry.viewportHeight]).toEqual(
        isDesktop ? [1440, 901] : [394, 853],
      );
    }

    expect(manifest.entries.filter((entry) => entry.width === 788)).toHaveLength(21);
    expect(manifest.entries.filter((entry) => entry.width === 2880)).toHaveLength(13);
  });
});

function range(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`,
  );
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function pngDimensions(buffer: Buffer): readonly [number, number] {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error("canonical baseline must be a PNG");
  }
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
