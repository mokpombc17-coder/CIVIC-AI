import { environmentManager, QueryClient } from "@tanstack/react-query";

export const CHAT_QUERY_STALE_TIME_MS = 10_000;

export function createChatQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: CHAT_QUERY_STALE_TIME_MS,
        retry: 1,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

let browserChatQueryClient: QueryClient | undefined;

export function getChatQueryClient(): QueryClient {
  if (environmentManager.isServer()) {
    return createChatQueryClient();
  }

  browserChatQueryClient ??= createChatQueryClient();
  return browserChatQueryClient;
}
