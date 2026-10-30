"use client";

import {
  searchTaskPageSchema,
  searchTaskParamsSchema,
  type SearchTaskPage,
  type SearchTaskParams,
} from "./vote-task-search-contracts";
import { voteFetch, type VoteFetch } from "./vote-fetch";

export type VoteTaskSearchApi = Readonly<{
  searchTasks(params: SearchTaskParams, signal?: AbortSignal): Promise<SearchTaskPage>;
}>;

export function createVoteTaskSearchApi(request: VoteFetch = voteFetch): VoteTaskSearchApi {
  return {
    async searchTasks(params, signal) {
      const { query: searchQuery, cursor, size } = searchTaskParamsSchema.parse(params);
      const query = new URLSearchParams({ query: searchQuery, size: String(size) });
      if (cursor) query.set("cursor", cursor);

      return searchTaskPageSchema.parse(
        await request(`/me/tasks/search?${query}`, signal ? { signal } : {}),
      );
    },
  };
}

export const voteTaskSearchApi = createVoteTaskSearchApi();
