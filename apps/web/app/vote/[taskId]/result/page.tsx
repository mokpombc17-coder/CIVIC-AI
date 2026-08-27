import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VoteTaskResultScreen } from "@/components/vote/vote-task-result-screen";
import { voteTaskIdSchema } from "@/lib/vote/vote-task-contracts";

export const metadata: Metadata = { title: "투표 결과" };

export default async function VoteTaskResultPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const parsed = voteTaskIdSchema.safeParse((await params).taskId);
  if (!parsed.success) notFound();
  return <VoteTaskResultScreen taskId={parsed.data} />;
}
