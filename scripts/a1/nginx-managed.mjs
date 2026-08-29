import { readFile, writeFile } from "node:fs/promises";

export function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

export function parseArgs(argv, extra = []) {
  const allowed = new Set(["--base", "--host", "--output", ...extra]);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || value === undefined) fail("invalid renderer arguments");
    values[key.slice(2)] = value;
  }
  for (const required of ["base", "host", "output"]) {
    if (!values[required]) fail(`missing --${required}`);
  }
  return values;
}

export async function readLines(path) {
  return (await readFile(path, "utf8")).replace(/\r\n/gu, "\n").split("\n");
}

export function findHostServer(lines, host) {
  const ranges = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*server\s*\{\s*$/u.test(lines[index])) continue;
    let depth = 0;
    let end = index;
    for (; end < lines.length; end += 1) {
      depth += (lines[end].match(/\{/gu) ?? []).length;
      depth -= (lines[end].match(/\}/gu) ?? []).length;
      if (depth === 0) break;
    }
    if (end >= lines.length) fail("unterminated Nginx server block");
    const serverLines = lines.slice(index, end + 1);
    const names = serverLines.flatMap(
      (line) => line.match(/^\s*server_name\s+([^;]+);/u)?.[1].split(/\s+/u) ?? [],
    );
    const isTls = serverLines.some((line) => /^\s*listen\s+[^;]*\bssl\b[^;]*;/u.test(line));
    if (isTls && names.includes(host)) ranges.push({ start: index, end });
    index = end;
  }
  if (ranges.length !== 1) fail(`expected exactly one TLS server block for ${host}`);
  return ranges[0];
}

export function replaceManaged(lines, begin, end, replacement, fallbackIndex) {
  const begins = lines.flatMap((line, index) => (line.trim() === begin ? [index] : []));
  const ends = lines.flatMap((line, index) => (line.trim() === end ? [index] : []));
  if (begins.length === 0 && ends.length === 0) {
    lines.splice(fallbackIndex, 0, ...replacement);
    return;
  }
  if (begins.length !== 1 || ends.length !== 1 || begins[0] >= ends[0]) {
    fail(`invalid managed Nginx block: ${begin}`);
  }
  lines.splice(begins[0], ends[0] - begins[0] + 1, ...replacement);
}

export function replaceNamedMap(lines, name, replacement) {
  const pattern = new RegExp(`^\\s*map\\s+\\$arg_url\\s+\\$${name}\\s*\\{\\s*$`, "u");
  const starts = lines.flatMap((line, index) => (pattern.test(line) ? [index] : []));
  if (starts.length > 1) fail(`multiple Nginx maps named ${name}`);
  if (starts.length === 0) {
    const firstServer = lines.findIndex((line) => /^\s*server\s*\{/u.test(line));
    if (firstServer < 0) fail("Nginx config has no server block");
    lines.splice(firstServer, 0, ...replacement, "");
    return;
  }
  const start = starts[0];
  let depth = 0;
  let end = start;
  for (; end < lines.length; end += 1) {
    depth += (lines[end].match(/\{/gu) ?? []).length;
    depth -= (lines[end].match(/\}/gu) ?? []).length;
    if (depth === 0) break;
  }
  if (end >= lines.length) fail(`unterminated Nginx map ${name}`);
  lines.splice(start, end - start + 1, ...replacement);
}

export async function writeConfig(path, lines) {
  await writeFile(path, `${lines.join("\n").replace(/\n+$/u, "")}\n`, { mode: 0o600 });
}
