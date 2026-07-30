const DEFAULT_CHAT_SERVER_URL = "http://localhost:8082";

export const CHAT_API_PREFIX = "/api/v1";
export const CHAT_WEBSOCKET_PATH = "/ws";

export type ChatServerConfig = {
  serverOrigin: string;
  apiBaseUrl: string;
  webSocketUrl: string;
};

type CreateChatServerConfigOptions = {
  serverUrl?: string;
  webOrigin?: string;
};

type ChatRuntime = {
  location?: {
    origin?: unknown;
  };
};

export function createChatServerConfig({
  serverUrl = DEFAULT_CHAT_SERVER_URL,
  webOrigin,
}: CreateChatServerConfigOptions = {}): ChatServerConfig {
  const server = parseServerUrl(serverUrl);

  if (webOrigin) {
    assertConsistentLocalHostname(server, new URL(webOrigin));
  }

  const apiBaseUrl = new URL(`${CHAT_API_PREFIX.slice(1)}/`, server);
  const webSocketUrl = new URL(CHAT_WEBSOCKET_PATH, server);
  webSocketUrl.protocol = server.protocol === "https:" ? "wss:" : "ws:";

  return {
    serverOrigin: server.origin,
    apiBaseUrl: removeTrailingSlash(apiBaseUrl.toString()),
    webSocketUrl: webSocketUrl.toString(),
  };
}

const runtimeWebOrigin = readChatRuntimeWebOrigin();
const chatServerConfig = createChatServerConfig({
  serverUrl: process.env.NEXT_PUBLIC_CHAT_API_URL ?? DEFAULT_CHAT_SERVER_URL,
  ...(runtimeWebOrigin ? { webOrigin: runtimeWebOrigin } : {}),
});

export const CHAT_SERVER_ORIGIN = chatServerConfig.serverOrigin;
export const CHAT_API_BASE_URL = chatServerConfig.apiBaseUrl;
export const CHAT_WEBSOCKET_URL = chatServerConfig.webSocketUrl;

export function readChatRuntimeWebOrigin(runtime: ChatRuntime = globalThis): string | undefined {
  const origin = runtime.location?.origin;

  return typeof origin === "string" && origin.length > 0 ? origin : undefined;
}

function parseServerUrl(serverUrl: string): URL {
  const url = new URL(serverUrl);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Chat Resource Server URL은 http 또는 https URL이어야 합니다.");
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new TypeError("Chat Resource Server URL에는 origin만 설정해야 합니다.");
  }

  return url;
}

function assertConsistentLocalHostname(server: URL, web: URL): void {
  const localHostnames = new Set(["localhost", "127.0.0.1"]);
  const bothUseLocalHostnames =
    localHostnames.has(server.hostname) && localHostnames.has(web.hostname);

  if (bothUseLocalHostnames && server.hostname !== web.hostname) {
    throw new TypeError(
      "로컬 웹과 Chat Resource Server는 localhost 또는 127.0.0.1 중 하나로 통일해야 합니다.",
    );
  }
}

function removeTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
