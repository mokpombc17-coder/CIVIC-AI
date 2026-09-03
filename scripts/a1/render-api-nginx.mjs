#!/usr/bin/env node

import {
  fail,
  findHostServer,
  parseArgs,
  readLines,
  replaceManaged,
  writeConfig,
} from "./nginx-managed.mjs";

const options = parseArgs(process.argv.slice(2), ["--service"]);
if (options.service !== "vote") fail("service must be vote");
const lines = await readLines(options.base);
const server = findHostServer(lines, options.host);
const variableTarget = (name, port) =>
  lines.some((line) => new RegExp(`^\\s*set\\s+\\$civic_${name}_upstream\\s+`, "u").test(line))
    ? `proxy_pass $civic_${name}_upstream$request_uri;`
    : `proxy_pass http://127.0.0.1:${port};`;
const voteProxy = variableTarget("vote", 8082);

const serviceConfig = {
  begin: "# BEGIN CIVIC VOTE 8082 MANAGED",
  end: "# END CIVIC VOTE 8082 MANAGED",
  block: [
    "    # BEGIN CIVIC VOTE 8082 MANAGED",
    '    location ~ "^/api/v1/(?:me/tasks(?:/.*)?|me/submissions(?:/.*)?|me/persona-status|me/surveys/current|me/survey-responses(?:/.*)?|me/service-eligibility|admin/tasks(?:/.*)?|admin/survey-rounds(?:/.*)?|admin/survey-content-versions(?:/.*)?|operations/persona/generations(?:/.*)?|operations/survey/outbox-events(?:/.*)?)$" {',
    `        ${voteProxy}`,
    "    }",
    "    # END CIVIC VOTE 8082 MANAGED",
  ],
};

replaceManaged(lines, serviceConfig.begin, serviceConfig.end, serviceConfig.block, server.end);
await writeConfig(options.output, lines);
