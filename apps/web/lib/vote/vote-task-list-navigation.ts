export const VOTE_TASK_LIST_TABS = ["active", "completed"] as const;

export type VoteTaskListTab = (typeof VOTE_TASK_LIST_TABS)[number];
export type VoteTaskListView = "list" | "search";

export function parseVoteTaskListTab(
  value: string | readonly string[] | undefined,
): VoteTaskListTab {
  const requestedTab = Array.isArray(value) ? value[0] : value;

  return requestedTab === "completed" ? "completed" : "active";
}

export function getVoteTaskListHref(tab: VoteTaskListTab, query = ""): "/vote" | `/vote?${string}` {
  const normalizedQuery = parseVoteTaskSearchQuery(query);
  const params = new URLSearchParams();
  if (tab === "completed") params.set("tab", "completed");
  if (normalizedQuery) {
    params.set("query", normalizedQuery);
    params.set("view", "list");
  }

  const search = params.toString();
  return search ? `/vote?${search}` : "/vote";
}

export function parseVoteTaskSearchQuery(value: string | readonly string[] | undefined): string {
  const requestedQuery = Array.isArray(value) ? value[0] : value;
  const query = requestedQuery?.trim() ?? "";

  return Array.from(query).length <= 200 ? query : "";
}

export function getVoteTaskSearchHref(tab: VoteTaskListTab, query: string): `/vote?${string}` {
  const normalizedQuery = parseVoteTaskSearchQuery(query);
  const params = new URLSearchParams();
  if (tab === "completed") params.set("tab", "completed");
  params.set("query", normalizedQuery);
  return `/vote?${params}`;
}

export function parseVoteTaskListView(
  value: string | readonly string[] | undefined,
  query: string,
): VoteTaskListView {
  if (!query) return "list";

  const requestedView = Array.isArray(value) ? value[0] : value;
  return requestedView === "list" ? "list" : "search";
}
