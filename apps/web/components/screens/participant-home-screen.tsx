import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ParticipantHomeLayout } from "@/components/wireflow/participant-layouts";
import { WireflowBadge } from "@/components/wireflow/wireflow-primitives";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { OpinionGatheringHero } from "./opinion-gathering-hero";
import { ScreenFrame } from "./screen-frame";

export function ParticipantHomeScreen({
  screen,
  requiresLoginForProtectedLinks = false,
  homeActions,
}: Readonly<{
  screen: ScreenDefinition;
  requiresLoginForProtectedLinks?: boolean;
  homeActions?: ReactNode;
}>) {
  if (screen.id !== "U-HOME-001") {
    throw new TypeError(`ParticipantHomeScreen cannot render ${screen.id}.`);
  }

  return (
    <ScreenFrame screen={screen}>
      <OpinionGatheringHero />
      <section className="wf-card wf-home-welcome">
        <WireflowBadge>참여 안내</WireflowBadge>
        <h2>배우고, 토론하고, 함께 결정합니다.</h2>
        <p>
          CIVIC.AI와 함께 자료 속 근거를 찾아보고, 다른 참여자와 이야기 나눈 다음, 나의 의견을
          투표로 남겨보세요.
        </p>
      </section>
      {homeActions ?? (
        <ParticipantHomeActions requiresLoginForProtectedLinks={requiresLoginForProtectedLinks} />
      )}
    </ScreenFrame>
  );
}

export function ParticipantHomeActions({
  requiresLoginForProtectedLinks = false,
}: Readonly<{ requiresLoginForProtectedLinks?: boolean }>) {
  const protectedHref = (path: string) =>
    (requiresLoginForProtectedLinks
      ? `/login?returnTo=${encodeURIComponent(path)}`
      : path) as Route;

  return (
    <ParticipantHomeLayout
      actions={[
        {
          action: (
            <Link
              className="wf-button wf-button-primary"
              href={protectedHref("/rag")}
              prefetch={false}
            >
              질문하기
            </Link>
          ),
          badge: "AI",
          description: "AI가 주제 자료에서 관련 내용을 찾아\n답변해 드려요.",
          title: "어떤 점부터 짚어볼까요?",
        },
        {
          action: (
            <Link
              className="wf-button wf-button-primary"
              href={protectedHref("/chat")}
              prefetch={false}
            >
              토론하기
            </Link>
          ),
          badge: "토론방",
          description: "관심 있는 주제를 골라 함께\n이야기해 보세요.",
          title: "같은 주제로 나누는 생각들",
        },
        {
          action: (
            <Link
              className="wf-button wf-button-primary"
              href={protectedHref("/vote")}
              prefetch={false}
            >
              투표하기
            </Link>
          ),
          badge: "투표",
          description: "이유까지 담아 생각을 표현해 보세요.\nAI가 이유 작성을 도와드려요.",
          title: "내 의견을 더하는 투표",
        },
      ]}
    />
  );
}
