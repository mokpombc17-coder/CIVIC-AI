import type { Metadata } from "next";
import { VoteTaskListScreen } from "@/components/vote/vote-task-list-screen";
import { parseVoteTaskListTab } from "@/lib/vote/vote-task-list-navigation";

export const metadata: Metadata = { title: "투표" };

type VotePageProps = Readonly<{
  searchParams: Promise<Readonly<{ tab?: string | readonly string[] | undefined }>>;
}>;

export default async function VotePage({ searchParams }: VotePageProps) {
  const { tab } = await searchParams;

  return <VoteTaskListScreen initialTab={parseVoteTaskListTab(tab)} />;
}
