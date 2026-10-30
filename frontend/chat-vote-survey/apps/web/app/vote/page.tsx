import type { Metadata } from "next";
import { VoteTaskListScreen } from "@/components/vote/vote-task-list-screen";
import {
  parseVoteTaskListTab,
  parseVoteTaskListView,
  parseVoteTaskSearchQuery,
} from "@/lib/vote/vote-task-list-navigation";

export const metadata: Metadata = { title: "투표" };

type VotePageProps = Readonly<{
  searchParams: Promise<
    Readonly<{
      query?: string | readonly string[] | undefined;
      tab?: string | readonly string[] | undefined;
      view?: string | readonly string[] | undefined;
    }>
  >;
}>;

export default async function VotePage({ searchParams }: VotePageProps) {
  const { query, tab, view } = await searchParams;
  const initialQuery = parseVoteTaskSearchQuery(query);
  const initialTab = parseVoteTaskListTab(tab);
  const initialView = parseVoteTaskListView(view, initialQuery);

  return (
    <VoteTaskListScreen
      key={`${initialView}:${initialTab}:${initialQuery}`}
      initialQuery={initialQuery}
      initialTab={initialTab}
      initialView={initialView}
    />
  );
}
