import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ParticipantHomeLayout } from "@/components/wireflow/participant-layouts";
import { WireflowBadge } from "@/components/wireflow/wireflow-primitives";
import { HOME_OPINION_TOPICS } from "@/lib/home-opinion-topics";
import { HOME_SEARCH_DESCRIPTION } from "@/lib/home-search";
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
      <div className="civic-home-hero-topics" data-home-hero-topics="">
        {HOME_OPINION_TOPICS.map((topic, index) => (
          <div
            key={topic.id}
            className="civic-home-hero-topic"
            data-home-hero-topic={topic.id}
            data-home-hero-topic-active={index === 0 ? "true" : "false"}
            aria-hidden={index !== 0}
            hidden={index !== 0}
          >
            <OpinionGatheringHero debugReplay items={topic.items} question={topic.question} />
          </div>
        ))}
      </div>
      <section className="wf-card wf-home-welcome">
        <WireflowBadge>참여 안내</WireflowBadge>
        <h2>배우고, 토론하고, 함께 결정합니다.</h2>
        <p>{HOME_SEARCH_DESCRIPTION}</p>
      </section>
      {homeActions ?? (
        <ParticipantHomeActions requiresLoginForProtectedLinks={requiresLoginForProtectedLinks} />
      )}
      <footer aria-label="개발 지원" className="civic-home-support">
        <span>개발지원 :</span>
        <Image
          alt="한국언론진흥재단"
          className="civic-home-support-logo"
          decoding="async"
          height={68}
          loading="lazy"
          src="/assets/home/support-logo.png"
          width={238}
        />
      </footer>
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
          title: "논의에 보태는 내 의견",
        },
      ]}
    />
  );
}
