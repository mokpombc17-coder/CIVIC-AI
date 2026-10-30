// 로컬에서 모든 서비스를 하나의 주소로 묶는 게이트웨이입니다.
// 인증 쿠키와 same-origin 검사가 운영과 같게 동작하도록 Host를 그대로 전달합니다.
import http from "node:http";
import net from "node:net";

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return Number(value);
};

const port = env("CIVIC_LOCAL_PORT");
const upstreams = {
  landing: env("CIVIC_LOCAL_LANDING_PORT"),
  community: env("CIVIC_LOCAL_COMMUNITY_PORT"),
  auth: env("CIVIC_LOCAL_AUTH_PORT"),
  chat: env("CIVIC_LOCAL_CHAT_PORT"),
  vote: env("CIVIC_LOCAL_VOTE_PORT"),
};

const under = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

const rules = [
  ["chat", ["/ws", "/api/v1/rooms", "/api/v1/room-categories"]],
  ["chat", ["/api/v1/me/rooms", "/api/v1/me/room-inbox", "/api/v1/me/room-creation-requests"]],
  ["auth", ["/api/v1/me/consent-acceptances", "/.well-known/openid-configuration"]],
  ["auth", ["/.well-known/jwks.json"]],
  ["vote", ["/api/v1/me"]],
  ["community", ["/chat", "/vote", "/survey", "/_next/static", "/assets/chat", "/assets/vote", "/api/chat", "/api/mobile"]],
];

// 이미지 최적화 경로는 두 앱이 함께 쓰므로 원본 파일 위치로 나눕니다.
function imageOwner(search) {
  const source = new URLSearchParams(search).get("url") ?? "";
  return ["/assets/chat/", "/assets/vote/"].some((prefix) => source.startsWith(prefix))
    ? "community"
    : "landing";
}

function route(path, search) {
  if (path === "/_next/image") return imageOwner(search);
  for (const [target, prefixes] of rules) {
    if (prefixes.some((prefix) => under(path, prefix))) return target;
  }
  return "landing";
}

function forwardedHeaders(request) {
  const client = request.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "127.0.0.1";
  return {
    ...request.headers,
    "x-forwarded-for": client,
    "x-real-ip": client,
    "x-forwarded-proto": "http",
    "x-forwarded-host": request.headers.host ?? "",
  };
}

const server = http.createServer((request, response) => {
  const { pathname, search } = new URL(request.url, "http://localhost");
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: upstreams[route(pathname, search)],
      method: request.method,
      path: request.url,
      headers: forwardedHeaders(request),
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.statusMessage,
        upstreamResponse.rawHeaders,
      );
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain" });
    response.end("Local service is not ready.\n");
  });
  request.pipe(upstream);
});

server.on("upgrade", (request, socket, head) => {
  const { pathname, search } = new URL(request.url, "http://localhost");
  const upstream = net.connect(upstreams[route(pathname, search)], "127.0.0.1", () => {
    const headers = Object.entries(forwardedHeaders(request))
      .map(([name, value]) => `${name}: ${value}`)
      .join("\r\n");
    upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(port, "127.0.0.1", () => {
  console.log(`CIVIC AI local gateway listening on http://localhost:${port}`);
});
