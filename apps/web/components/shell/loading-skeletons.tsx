import { PlatformPageShell } from "@/components/platform-page-shell";

/** 로그인·이동 직후 데이터가 준비되기 전까지 보여 주는 화면 골격. */
function SkeletonBlock({ className }: Readonly<{ className: string }>) {
  return <span aria-hidden="true" className={`civic-skeleton ${className}`} />;
}

function SkeletonCard({ lines = 2 }: Readonly<{ lines?: number }>) {
  return (
    <div className="civic-skeleton-card">
      <SkeletonBlock className="civic-skeleton-badge" />
      <SkeletonBlock className="civic-skeleton-title" />
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonBlock className="civic-skeleton-line" key={index} />
      ))}
    </div>
  );
}

export function ParticipantHomeSkeleton() {
  return (
    <PlatformPageShell title={<span className="civic-brand-title">CIVIC.AI</span>}>
      <div aria-busy="true" aria-label="홈 화면을 불러오는 중" className="civic-skeleton-screen">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
      </div>
    </PlatformPageShell>
  );
}

export function ParticipantScreenSkeleton() {
  return (
    <PlatformPageShell title={<SkeletonBlock className="civic-skeleton-header-title" />}>
      <div aria-busy="true" aria-label="화면을 불러오는 중" className="civic-skeleton-screen">
        <div className="civic-skeleton-row">
          <SkeletonBlock className="civic-skeleton-line" />
          <SkeletonBlock className="civic-skeleton-action" />
        </div>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
      </div>
    </PlatformPageShell>
  );
}

/** 관리자 콘텐츠 영역 전용 스켈레톤 — 사이드바는 레이아웃(AdminShell)이 고정 렌더한다. */
export function AdminScreenSkeleton() {
  return (
    <div aria-busy="true" aria-label="관리 화면을 불러오는 중" className="civic-skeleton-screen">
      <SkeletonBlock className="civic-skeleton-header-title" />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={4} />
    </div>
  );
}
