import type { Metadata } from "next";
import { PlatformPageShell } from "@/components/platform-page-shell";
import { VoteTaskListScreen } from "@/components/vote/vote-task-list-screen";

export const metadata: Metadata = { title: "투표" };

export default function VotePage() {
  return (
    <PlatformPageShell title="투표">
      <VoteTaskListScreen />
    </PlatformPageShell>
  );
}
