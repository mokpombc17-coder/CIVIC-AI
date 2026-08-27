import type { Metadata } from "next";
import { VoteTaskListScreen } from "@/components/vote/vote-task-list-screen";

export const metadata: Metadata = { title: "투표" };

export default function VotePage() {
  return <VoteTaskListScreen />;
}
