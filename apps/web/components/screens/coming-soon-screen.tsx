import type { Route } from "next";
import Link from "next/link";
import type { ScreenDefinition } from "@/lib/screens/registry";

type ComingSoonScreenProps = Readonly<{
  screen: ScreenDefinition;
}>;

const ownerLabels = {
  CHAT: "채팅",
  DECISION: "과업·투표",
  SIMULATION: "시뮬레이션",
} as const;

export function ComingSoonScreen({ screen }: ComingSoonScreenProps) {
  if (screen.status !== "PLACEHOLDER") {
    throw new TypeError(`ComingSoonScreen cannot render ${screen.id}.`);
  }

  const backHref = (screen.audience === "ADMIN" ? "/admin" : "/home") as Route;
  const ownerLabel = ownerLabels[screen.owner as keyof typeof ownerLabels];

  return (
    <section
      aria-labelledby="coming-soon-title"
      className="civic-coming-soon"
      data-wireflow-screen={screen.id}
    >
      <div aria-hidden="true" className="civic-coming-soon-index">
        <span>{screen.id.split("-").at(-1)}</span>
      </div>
      <div className="civic-coming-soon-copy">
        <div className="civic-coming-soon-meta">
          <p className="civic-kicker">
            {ownerLabel} · {screen.id}
          </p>
          <p className="civic-coming-soon-status" role="status">
            준비 중
          </p>
        </div>
        {screen.audience === "ADMIN" ? (
          <h1 id="coming-soon-title">{screen.canonical_title}</h1>
        ) : (
          <h2 id="coming-soon-title">{screen.canonical_title}</h2>
        )}
        <p className="civic-coming-soon-lead">
          이 화면은 현재 단계에서 기능을 연결하지 않았습니다. 계정과 문서 데이터는 조회하거나
          변경하지 않으며, 정식 기능이 준비되면 같은 주소에서 제공됩니다.
        </p>
        <div className="civic-boundary-note">
          <strong>현재 제공 범위</strong>
          <p>
            화면 위치와 접근 권한만 확인할 수 있습니다. 임시 통계나 가상 처리 결과는 표시하지
            않습니다.
          </p>
        </div>
        <Link className="civic-back-link" href={backHref}>
          {screen.audience === "ADMIN" ? "관리 업무 선택으로" : "참여자 홈으로"}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
