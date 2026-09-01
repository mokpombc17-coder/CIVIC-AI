#!/usr/bin/env node

import {
  fail,
  findHostServer,
  parseArgs,
  readLines,
  replaceManaged,
  replaceNamedMap,
  writeConfig,
} from "./nginx-managed.mjs";

const options = parseArgs(process.argv.slice(2), ["--assets"]);
if (!options.assets) fail("missing --assets");
const lines = await readLines(options.base);
const assetLines = await readLines(options.assets);
const assets = [...new Set(assetLines.map((line) => line.trim()).filter(Boolean))].sort();
if (assets.length === 0) fail("asset manifest is empty");
for (const asset of assets) {
  if (
    !asset.startsWith("/") ||
    asset === "/" ||
    /[\s*{}?#;]/u.test(asset) ||
    asset.includes("..") ||
    asset.includes("//")
  )
    fail(`unsafe asset path: ${asset}`);
}
if (!assets.some((asset) => asset.startsWith("/_next/static/"))) {
  fail("asset manifest has no exact Next static paths");
}

const images = assets.filter((asset) => /\.(?:avif|gif|jpe?g|png|svg|webp)$/iu.test(asset));
const ownerMap = lines.some((line) =>
  /^\s*map\s+\$arg_url\s+\$civic_next_image_owner\s*\{/u.test(line),
);
const imageMapName = ownerMap ? "civic_next_image_owner" : "civic_next_image_port";
const imageDefault = ownerMap ? "main" : "3000";
const imageFront = ownerMap ? "front" : "3001";
const mapBlock = [
  "# BEGIN CIVIC FRONT 3001 IMAGE MAP MANAGED",
  `map $arg_url $${imageMapName} {`,
  `    default ${imageDefault};`,
  ...images.flatMap((asset) => [
    `    ${asset} ${imageFront};`,
    `    ~*^${encodeURIComponent(asset)}$ ${imageFront};`,
  ]),
  "}",
  "# END CIVIC FRONT 3001 IMAGE MAP MANAGED",
];

const mapBegin = "# BEGIN CIVIC FRONT 3001 IMAGE MAP MANAGED";
const mapEnd = "# END CIVIC FRONT 3001 IMAGE MAP MANAGED";
const mapBeginIndex = lines.findIndex((line) => line.trim() === mapBegin);
const mapEndIndex = lines.findIndex((line) => line.trim() === mapEnd);
if (mapBeginIndex >= 0 || mapEndIndex >= 0) {
  replaceManaged(lines, mapBegin, mapEnd, mapBlock, 0);
} else {
  replaceNamedMap(lines, imageMapName, mapBlock);
}

const server = findHostServer(lines, options.host);
const frontVariable = lines.some((line) => /^\s*set\s+\$civic_front_upstream\s+/u.test(line));
const frontProxy = frontVariable
  ? "proxy_pass $civic_front_upstream$request_uri;"
  : "proxy_pass http://127.0.0.1:3001;";
const begin = "# BEGIN CIVIC FRONT 3001 MANAGED";
const end = "# END CIVIC FRONT 3001 MANAGED";
const block = [
  `    ${begin}`,
  "    location = /chat {",
  `        ${frontProxy}`,
  "    }",
  "    location ^~ /chat/ {",
  `        ${frontProxy}`,
  "    }",
  "    location = /vote {",
  `        ${frontProxy}`,
  "    }",
  "    location ^~ /vote/ {",
  `        ${frontProxy}`,
  "    }",
  "    location = /survey {",
  `        ${frontProxy}`,
  "    }",
  "    location ^~ /survey/ {",
  `        ${frontProxy}`,
  "    }",
  ...assets.flatMap((asset) => [`    location = ${asset} {`, `        ${frontProxy}`, "    }"]),
  "    location = /_next/image {",
  ...(ownerMap
    ? [
        "        client_max_body_size 12m;",
        "        set $civic_proxy_cookie $civic_next_image_cookie;",
        "        set $civic_response_profile $civic_next_image_profile;",
        "        proxy_pass $civic_next_image_upstream$request_uri;",
      ]
    : ["        proxy_pass http://127.0.0.1:$civic_next_image_port;"]),
  "    }",
  `    ${end}`,
];
replaceManaged(lines, begin, end, block, server.end);
await writeConfig(options.output, lines);
