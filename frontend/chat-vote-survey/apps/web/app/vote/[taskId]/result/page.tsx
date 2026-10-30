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
  searchParams: Promise<{
    aiBadge?: string | string[];
    opinionMap?: string | string[];
    source?: string | string[];
  }>;
}) {
  const parsed = voteTaskIdSchema.safeParse((await params).taskId);
  if (!parsed.success) notFound();
  const { aiBadge, opinionMap, source } = await searchParams;
  const requestedSource = Array.isArray(source) ? source[0] : source;
  const requestedAiBadge = Array.isArray(aiBadge) ? aiBadge[0] : aiBadge;
  const requestedOpinionMap = Array.isArray(opinionMap) ? opinionMap[0] : opinionMap;
  const useDesignSample = process.env.NODE_ENV !== "production" && requestedSource === "mock";

  return (
    <VoteTaskResultScreen
      mockOpinionMapStatus={
        useDesignSample && requestedOpinionMap === "pending" ? "PENDING" : "AVAILABLE"
      }
      showAiBadges={useDesignSample && requestedAiBadge === "on"}
      source={useDesignSample ? "mock" : "api"}
      taskId={parsed.data}
    />
  );
}
