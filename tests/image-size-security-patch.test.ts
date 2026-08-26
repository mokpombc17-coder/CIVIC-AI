import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const imageSizeEntry = path.join(
  process.cwd(),
  "node_modules/.pnpm/node_modules/image-size/dist/index.js",
);

function runMalformedImage(bufferExpression: string) {
  return spawnSync(
    process.execPath,
    [
      "-e",
      `const { imageSize } = require(${JSON.stringify(imageSizeEntry)});
const input = ${bufferExpression};
try { imageSize(input); process.exit(2); } catch { process.exit(0); }`,
    ],
    { encoding: "utf8", timeout: 1_000 },
  );
}

describe("image-size malformed container hardening", () => {
  it("rejects a zero-length ICNS entry without looping", () => {
    const result = runMalformedImage(`Uint8Array.from([
      0x69, 0x63, 0x6e, 0x73, 0x00, 0x00, 0x00, 0x10,
      0x69, 0x63, 0x30, 0x37, 0x00, 0x00, 0x00, 0x00
    ])`);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });

  it("rejects a zero-length JPEG XL partial-stream box without looping", () => {
    const result = runMalformedImage(`Uint8Array.from([
      0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
      0x00, 0x00, 0x00, 0x0c, 0x66, 0x74, 0x79, 0x70, 0x6a, 0x78, 0x6c, 0x20,
      0x00, 0x00, 0x00, 0x00, 0x6a, 0x78, 0x6c, 0x70
    ])`);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });
});
