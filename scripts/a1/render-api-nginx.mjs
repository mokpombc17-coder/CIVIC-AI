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
if (!["chat", "vote"].includes(options.service)) fail("service must be chat or vote");
const lines = await readLines(options.base);
const server = findHostServer(lines, options.host);
const variableTarget = (name, port) =>
  lines.some((line) => new RegExp(`^\\s*set\\s+\\$civic_${name}_upstream\\s+`, "u").test(line))
    ? `proxy_pass $civic_${name}_upstream$request_uri;`
    : `proxy_pass http://127.0.0.1:${port};`;
const chatProxy = variableTarget("chat", 8083);
const voteProxy = variableTarget("vote", 8082);

const serviceConfig = {
  chat: {
    begin: "# BEGIN CIVIC CHAT 8083 MANAGED",
    end: "# END CIVIC CHAT 8083 MANAGED",
    block: [
      "    # BEGIN CIVIC CHAT 8083 MANAGED",
      '    location ~ "^/api/v1/(?:rooms(?:/.*)?|room-categories(?:/.*)?|me/rooms|me/room-inbox|me/room-creation-requests(?:/.*)?|admin/rooms(?:/.*)?|admin/room-categories(?:/.*)?|admin/room-creation-requests(?:/.*)?|research/rooms(?:/.*)?)$" {',
      `        ${chatProxy}`,
      "    }",
      "    location = /ws {",
      "        proxy_set_header Upgrade $http_upgrade;",
      "        proxy_set_header Connection $connection_upgrade;",
      "        proxy_read_timeout 3600s;",
      "        proxy_send_timeout 3600s;",
      `        ${chatProxy}`,
      "    }",
      "    # END CIVIC CHAT 8083 MANAGED",
    ],
  },
  vote: {
    begin: "# BEGIN CIVIC VOTE 8082 MANAGED",
    end: "# END CIVIC VOTE 8082 MANAGED",
    block: [
      "    # BEGIN CIVIC VOTE 8082 MANAGED",
      '    location ~ "^/api/v1/(?:me/tasks(?:/.*)?|me/submissions(?:/.*)?|me/persona-status|me/surveys/current|me/survey-responses(?:/.*)?|me/service-eligibility|admin/tasks(?:/.*)?|admin/survey-rounds(?:/.*)?|admin/survey-content-versions(?:/.*)?|operations/persona/generations(?:/.*)?|operations/survey/outbox-events(?:/.*)?)$" {',
      `        ${voteProxy}`,
      "    }",
      "    # END CIVIC VOTE 8082 MANAGED",
    ],
  },
}[options.service];

replaceManaged(lines, serviceConfig.begin, serviceConfig.end, serviceConfig.block, server.end);
await writeConfig(options.output, lines);
