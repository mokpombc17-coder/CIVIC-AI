import { environmentManager, QueryClient } from "@tanstack/react-query";
import { VoteApiError } from "./vote-fetch";

export function createVoteQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, retry: shouldRetryVoteQuery },
      mutations: { retry: false },
    },
  });
}

export function shouldRetryVoteQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof VoteApiError && (error.status === 401 || error.status === 403)) {
    return false;
  }
  return failureCount < 1;
}

let browserVoteQueryClient: QueryClient | undefined;

export function getVoteQueryClient(): QueryClient {
  if (environmentManager.isServer()) return createVoteQueryClient();
  browserVoteQueryClient ??= createVoteQueryClient();
  return browserVoteQueryClient;
}
