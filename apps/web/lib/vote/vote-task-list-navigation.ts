export const VOTE_TASK_LIST_TABS = ["active", "completed"] as const;

export type VoteTaskListTab = (typeof VOTE_TASK_LIST_TABS)[number];

export function parseVoteTaskListTab(
  value: string | readonly string[] | undefined,
): VoteTaskListTab {
  const requestedTab = Array.isArray(value) ? value[0] : value;

  return requestedTab === "completed" ? "completed" : "active";
}

export function getVoteTaskListHref(tab: VoteTaskListTab): "/vote" | "/vote?tab=completed" {
  return tab === "completed" ? "/vote?tab=completed" : "/vote";
}
