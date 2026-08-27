import { environmentManager, QueryClient } from "@tanstack/react-query";

export function createVoteQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, retry: 1 },
      mutations: { retry: false },
    },
  });
}

let browserVoteQueryClient: QueryClient | undefined;

export function getVoteQueryClient(): QueryClient {
  if (environmentManager.isServer()) return createVoteQueryClient();
  browserVoteQueryClient ??= createVoteQueryClient();
  return browserVoteQueryClient;
}
