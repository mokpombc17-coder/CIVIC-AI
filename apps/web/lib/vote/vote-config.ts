const DEFAULT_VOTE_SERVER_URL = "http://localhost:8083";

export const VOTE_API_PREFIX = "/api/v1";

export type VoteServerConfig = Readonly<{
  serverOrigin: string;
  apiBaseUrl: string;
}>;

export function createVoteServerConfig(
  serverUrl = process.env.NEXT_PUBLIC_VOTE_API_URL ?? DEFAULT_VOTE_SERVER_URL,
): VoteServerConfig {
  const server = new URL(serverUrl);

  if (server.protocol !== "http:" && server.protocol !== "https:") {
    throw new TypeError("Vote Resource Server URL은 http 또는 https URL이어야 합니다.");
  }

  if (
    server.username ||
    server.password ||
    server.pathname !== "/" ||
    server.search ||
    server.hash
  ) {
    throw new TypeError("Vote Resource Server URL에는 origin만 설정해야 합니다.");
  }

  const apiBaseUrl = new URL(`${VOTE_API_PREFIX.slice(1)}/`, server).toString();

  return {
    serverOrigin: server.origin,
    apiBaseUrl: apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl,
  };
}

const voteServerConfig = createVoteServerConfig();

export const VOTE_SERVER_ORIGIN = voteServerConfig.serverOrigin;
export const VOTE_API_BASE_URL = voteServerConfig.apiBaseUrl;
