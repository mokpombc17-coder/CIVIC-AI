#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const webOrigin = "https://localhost:3111";
const apiOrigin = "http://127.0.0.1:4793";
const driverOrigin = "http://127.0.0.1:4446";
const citationVersionId = "30000000-0000-4000-8000-000000000003";
const root = process.cwd();
const evidenceRoot = path.resolve(root, "../../artifacts/release-evidence/browser");
const resultPath = path.join(evidenceRoot, "safari-result.json");
const screenshotPath = path.join(evidenceRoot, "safari-wireflow.png");
mkdirSync(evidenceRoot, { recursive: true });

const mock = createServer((request, response) => {
  const url = new URL(request.url ?? "/", apiOrigin);
  const cookie = request.headers.cookie ?? "";
  if (url.pathname === "/api/v1/auth/me") {
    if (cookie.includes("civic_ai_access_token=participant.payload.signature")) {
      return json(response, {
        user_id: "00000000-0000-4000-8000-000000000001",
        role: "PARTICIPANT",
        permissions: [],
        account_state: "ACTIVE",
        must_change_password: false,
      });
    }
    response.writeHead(401).end();
    return;
  }
  if (url.pathname === "/api/v1/auth/csrf") return json(response, { csrf_token: "safari-csrf" });
  if (url.pathname === "/api/v1/account/profile") {
    return json(response, {
      user_id: "00000000-0000-4000-8000-000000000001",
      email: "citizen@example.com",
      role: "PARTICIPANT",
      account_state: "ACTIVE",
      preferred_language: "ko",
      rag_answer_detail: "balanced",
      two_factor_enabled: true,
      response_version: 3,
    });
  }
  if (url.pathname === "/internal/v1/rag/queries" && request.method === "POST") {
    return json(response, { job_id: "safari-query", status: "PENDING" });
  }
  if (url.pathname === "/internal/v1/rag/queries/safari-query") {
    return json(response, {
      job_id: "safari-query",
      status: "SUCCEEDED",
      submitted_question: "복지정책 문서의 핵심 내용을 알려줘.",
      answer: `지원 대상과 신청 기준을 확인할 수 있습니다. [${citationVersionId}#3]`,
      citations: [
        {
          document_version_id: citationVersionId,
          page_number: 3,
          source_object_sha256: "a".repeat(64),
          title: "2026 복지정책 기본계획",
        },
      ],
    });
  }
  if (
    url.pathname.startsWith(
      `/internal/v1/rag/sources/${citationVersionId}/pages/3/document/pages/`,
    ) &&
    url.pathname.endsWith(".png")
  ) {
    response.writeHead(200, { "content-type": "image/png" });
    response.end(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nLkAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    return;
  }
  response.writeHead(404).end();
});

await new Promise((resolve, reject) => {
  mock.once("error", reject);
  mock.listen(4793, "127.0.0.1", resolve);
});

const web = spawn(
  "pnpm",
  [
    "--filter",
    "@app/web",
    "exec",
    "next",
    "dev",
    "--experimental-https",
    "--hostname",
    "localhost",
    "--port",
    "3111",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      CIVIC_BROWSER_ORIGIN: webOrigin,
      CIVIC_E2E_RAG_UPSTREAM: apiOrigin,
      MAIN_AUTH_INTERNAL_URL: apiOrigin,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const driver = spawn("safaridriver", ["-p", "4446"], { stdio: ["ignore", "pipe", "pipe"] });
let sessionId;

try {
  await waitForWeb();
  await waitForDriver();
  const created = await webdriver("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "Safari", acceptInsecureCerts: true } },
  });
  if (created.value?.error) {
    record("BLOCKED", created.value.message ?? "Safari WebDriver session was not created.", {
      version: safariVersion(),
    });
    process.exitCode = 2;
  } else {
    sessionId = created.value.sessionId ?? created.sessionId;
    const version = created.value.capabilities?.browserVersion ?? safariVersion();
    await command("POST", "/url", { url: `${webOrigin}/login` });
    await waitElement('[data-wireflow-screen="AUTH-001"]');
    await command("POST", "/cookie", {
      cookie: {
        name: "civic_ai_access_token",
        value: "participant.payload.signature",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    });
    await command("POST", "/url", { url: `${webOrigin}/home` });
    await waitElement('[data-wireflow-screen="U-HOME-001"]');
    await command("POST", "/url", { url: `${webOrigin}/rag` });
    const reset = await waitElement(".civic-rag-session-bar button.civic-secondary-action");
    await elementCommand(reset, "POST", "/click", {});
    await waitElement(".civic-form-message");
    const input = await waitElement('textarea[placeholder="문서에 대해 질문하세요…"]');
    await elementCommand(input, "POST", "/value", { text: "복지정책 문서의 핵심 내용을 알려줘." });
    const submit = await waitElement('button[type="submit"]');
    await elementCommand(submit, "POST", "/click", {});
    const citation = await waitElement('button[aria-label^="출처 "]');
    await elementCommand(citation, "POST", "/click", {});
    await waitElement('[data-wireflow-screen="U-RAG-001"]');
    await waitElement('[role="dialog"][aria-label="참조 문서"]');
    const currentUrl = await command("GET", "/url");
    if (new URL(currentUrl.value).pathname !== "/rag") {
      throw new Error("Inline citation unexpectedly changed the RAG route.");
    }
    const screenshot = await command("GET", "/screenshot");
    writeFileSync(screenshotPath, Buffer.from(screenshot.value, "base64"), { mode: 0o644 });
    record("PASS", "Installed Safari completed login, home and RAG source GUI smoke.", {
      version,
      screenshot: path.relative(path.resolve(root, "../.."), screenshotPath),
      screenshot_checksum: `sha256:${createHash("sha256").update(readFileSync(screenshotPath)).digest("hex")}`,
    });
  }
} catch (error) {
  record("FAIL", error instanceof Error ? error.message : String(error), {
    version: safariVersion(),
  });
  process.exitCode = 1;
} finally {
  if (sessionId) await command("DELETE", "").catch(() => undefined);
  driver.kill("SIGTERM");
  web.kill("SIGTERM");
  await new Promise((resolve) => mock.close(resolve));
}

async function waitForWeb() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await new Promise((resolve) => {
      const probe = spawn("curl", ["-ksS", "-o", "/dev/null", "-w", "%{http_code}", webOrigin]);
      let output = "";
      probe.stdout.on("data", (chunk) => (output += chunk));
      probe.once("close", () => resolve(output === "200"));
    });
    if (ready) return;
    await delay(250);
  }
  throw new Error("Next.js Safari smoke server did not become ready");
}

async function waitForDriver() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${driverOrigin}/status`);
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("safaridriver did not become ready");
}

async function waitElement(selector) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await command("POST", "/element", { using: "css selector", value: selector });
    if (!result.value?.error) return result.value["element-6066-11e4-a52e-4f735466cecf"];
    await delay(250);
  }
  throw new Error(`Safari element did not appear: ${selector}`);
}

function command(method, suffix, body) {
  return webdriver(method, `/session/${sessionId}${suffix}`, body);
}

function elementCommand(elementId, method, suffix, body) {
  return command(method, `/element/${elementId}${suffix}`, body);
}

async function webdriver(method, pathname, body) {
  const response = await fetch(`${driverOrigin}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.json();
}

function record(status, notes, extra) {
  const body = {
    schema_version: 1,
    browser: "Safari",
    ...extra,
    executed_at: new Date().toISOString(),
    status,
    viewport: "394x852",
    notes,
  };
  writeFileSync(resultPath, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o644 });
}

function safariVersion() {
  try {
    return process.env.SAFARI_VERSION ?? "26.0.1";
  } catch {
    return "unknown";
  }
}

function json(response, body) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
