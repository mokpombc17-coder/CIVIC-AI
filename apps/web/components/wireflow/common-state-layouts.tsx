import type { Route } from "next";
import Link from "next/link";

export function WireflowCommonState({
  action,
  body,
  href,
  title,
}: Readonly<{ action: string; body: string; href: Route; title: string }>) {
  return (
    <section className="wf-common-state">
      <strong>{title}</strong>
      <p>{body}</p>
      <Link className="wf-button wf-button-primary" href={href}>
        {action}
      </Link>
    </section>
  );
}

/** COMMON-002: 다른 요청이 먼저 상태를 바꿔 화면과 서버 상태가 어긋난 경우. */
export function WireflowConflictState({
  latestHref,
  listHref,
}: Readonly<{ latestHref: Route; listHref: Route }>) {
  return (
    <section className="wf-conflict-state">
      <div className="wf-status-card">
        <span>화면에 보인 상태</span>
        <strong>이전 상태</strong>
      </div>
      <div className="wf-status-card">
        <span>최신 상태</span>
        <strong>다른 요청으로 변경됨</strong>
      </div>
      <div className="wf-state-actions">
        <Link className="wf-button wf-button-primary" href={latestHref}>
          최신 상태 보기
        </Link>
        <Link className="wf-button wf-button-secondary" href={listHref}>
          과업 목록으로
        </Link>
      </div>
    </section>
  );
}

/** COMMON-003: 서버 처리 결과를 확인하는 동안의 진행 안내. */
export function WireflowProgressState({
  homeHref,
  retryHref,
}: Readonly<{ homeHref: Route; retryHref: Route }>) {
  const steps = [
    { label: "요청 접수", state: "done", status: "완료" },
    { label: "처리 실행", state: "done", status: "완료" },
    { label: "결과 확인", state: "active", status: "조회 중" },
  ] as const;
  return (
    <section className="wf-progress-state">
      <div className="wf-card wf-progress-card">
        <header className="wf-progress-heading">
          <strong>처리 진행 상태</strong>
        </header>
        <div aria-hidden="true" className="wf-progress-track">
          <span className="wf-progress-fill" />
        </div>
        <ol className="wf-progress-steps">
          {steps.map((step) => (
            <li data-state={step.state} key={step.label}>
              <span aria-hidden="true" className="wf-progress-step-icon" />
              <b>{step.label}</b>
              <span className="wf-progress-step-status">{step.status}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="wf-state-actions">
        <Link className="wf-button wf-button-primary" href={retryHref}>
          처리 결과 재조회
        </Link>
        <Link className="wf-button wf-button-secondary" href={homeHref}>
          홈으로
        </Link>
      </div>
    </section>
  );
}

/** COMMON-004: 일시적인 서비스 오류. 입력 유지 안내와 복구 동선을 제공한다. */
export function WireflowOutageState({
  homeHref,
  retryHref,
}: Readonly<{ homeHref: Route; retryHref: Route }>) {
  return (
    <section className="wf-outage-state">
      <div className="wf-warning-card" role="status">
        <span aria-hidden="true" className="wf-warning-icon">
          ⚠
        </span>
        <strong>입력한 내용은 유지됩니다</strong>
        <p>잠시 후 다시 시도해 주세요.</p>
        <div className="wf-state-actions">
          <Link className="wf-button wf-button-primary" href={retryHref}>
            다시 시도
          </Link>
          <Link className="wf-button wf-button-secondary" href={homeHref}>
            홈으로 이동
          </Link>
        </div>
      </div>
    </section>
  );
}
