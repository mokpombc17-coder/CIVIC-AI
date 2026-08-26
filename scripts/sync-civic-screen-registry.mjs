import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceArgument = process.argv[2];
if (!sourceArgument) {
  throw new Error("Usage: node scripts/sync-civic-screen-registry.mjs <contracts/screens.v1.json>");
}

const sourcePath = path.resolve(process.cwd(), sourceArgument);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = path.join(repositoryRoot, "apps/web/lib/screens/screens.v1.generated.json");
const registry = JSON.parse(await readFile(sourcePath, "utf8"));

if (registry.version !== 1 || !Array.isArray(registry.screens) || registry.screens.length !== 70) {
  throw new Error("The parent screen registry must be version 1 with exactly 70 screens.");
}

await mkdir(path.dirname(targetPath), { recursive: true });
await writeFile(targetPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
console.log(`Synced ${registry.screens.length} screens to ${targetPath}`);
