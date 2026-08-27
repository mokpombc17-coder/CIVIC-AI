import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VoteTaskScreen } from "@/components/vote/vote-task-screen";
import { voteTaskIdSchema } from "@/lib/vote/vote-task-contracts";

export const metadata: Metadata = { title: "투표 참여" };

export default async function VoteTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const parsed = voteTaskIdSchema.safeParse((await params).taskId);
  if (!parsed.success) notFound();
  return <VoteTaskScreen taskId={parsed.data} />;
}
