import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VoteTaskResultScreen } from "@/components/vote/vote-task-result-screen";
import { voteTaskIdSchema } from "@/lib/vote/vote-task-contracts";

export const metadata: Metadata = { title: "투표 결과" };

export default async function VoteTaskResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<{ source?: string | string[] }>;
}) {
  const parsed = voteTaskIdSchema.safeParse((await params).taskId);
  if (!parsed.success) notFound();
  const requestedSource = (await searchParams).source;
  const useDesignSample =
    process.env.NODE_ENV !== "production" &&
    (Array.isArray(requestedSource) ? requestedSource[0] : requestedSource) === "mock";

  return <VoteTaskResultScreen source={useDesignSample ? "mock" : "api"} taskId={parsed.data} />;
}
