import { OpinionGatheringHero } from "@/components/screens/opinion-gathering-hero";
import { ScreenFrame, screenFrameHeading } from "@/components/screens/screen-frame";
import { HomeBrandTitle } from "@/components/shell/home-brand-title";
import { ParticipantShell } from "@/components/shell/participant-shell";
import { WireflowBadge } from "@/components/wireflow/wireflow-primitives";
import { getScreenByRoute } from "@/lib/screens/registry";

export function ParticipantHomeSkeleton() {
  const screen = getScreenByRoute("/home");
  if (!screen) throw new TypeError("U-HOME-001 screen is missing");

  return (
    <ParticipantShell
      activeRoute="/home"
      headerTitle={<HomeBrandTitle />}
      title={screenFrameHeading(screen).title}
    >
      <ScreenFrame screen={screen}>
        <HomeLoadingSurface />
      </ScreenFrame>
    </ParticipantShell>
  );
}

export function HomeLoadingSurface() {
  const actions = [
    [
      "AI",
      "어떤 점부터 짚어볼까요?",
      "AI가 주제 자료에서 관련 내용을 찾아 답변해 드려요.",
      "질문하기",
    ],
    [
      "토론방",
      "같은 주제, 저마다의 생각",
      "다른 참여자의 생각을 듣고,\n내 생각도 나눠보세요.",
      "토론하기",
    ],
    [
      "투표",
      "내 의견으로 채워가는 논의",
      "이유까지 담아 생각을 표현해 보세요.\nAI가 이유 작성을 도와드려요.",
      "투표하기",
    ],
  ] as const;

  return (
    <div
      aria-busy="true"
      aria-label="홈 화면을 불러오는 중"
      className="civic-loading-static-surface"
    >
      <OpinionGatheringHero animate={false} />
      <section className="wf-card wf-home-welcome">
        <WireflowBadge>참여 안내</WireflowBadge>
        <h2>배우고, 토론하고, 함께 결정합니다.</h2>
        <p>
          CIVIC.AI와 함께 자료 속 근거를 찾아보고, 다른 참여자와 이야기 나눈 다음, 나의 의견을
          투표로 남겨보세요.
        </p>
      </section>
      <div className="wf-participant-home" data-wireflow-layout="participant-home">
        {actions.map(([badge, title, description, action]) => (
          <section className="wf-card wf-action-card" key={title}>
            <div className="wf-action-copy">
              <WireflowBadge>{badge}</WireflowBadge>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <div className="wf-action-control">
              <span aria-hidden="true" className="wf-button wf-button-primary">
                {action}
              </span>
            </div>
          </section>
        ))}
      </div>
      <span aria-live="polite" className="sr-only" role="status">
        화면 내용을 불러오고 있습니다.
      </span>
    </div>
  );
}
