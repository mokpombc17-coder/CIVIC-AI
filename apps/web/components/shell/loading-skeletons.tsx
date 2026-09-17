"use client";

import type { Route } from "next";
import { usePathname } from "next/navigation";
import { PlatformPageShell } from "@/components/platform-page-shell";
import { PlatformNavigation } from "@/components/platform-shell";
import { ComingSoonScreen } from "@/components/screens/coming-soon-screen";
import { ScreenFrame, screenFrameHeading } from "@/components/screens/screen-frame";
import { HomeBrandTitle } from "@/components/shell/home-brand-title";
import { HomeLoadingSurface } from "@/components/shell/participant-home-skeleton";
import { RagNewQuestionHeaderAction } from "@/components/rag/rag-new-question-header-action";
import { RagIntroBanner } from "@/components/rag/rag-intro-banner";
import { ConsoleSearchControl } from "@/components/admin/console/console-ui";
import { getScreenByRoute, type ScreenDefinition } from "@/lib/screens/registry";

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

export function ParticipantScreenSkeleton() {
  return <ParticipantLoadingView pathname={usePathname()} />;
}

export function ParticipantLoadingView({ pathname }: Readonly<{ pathname: string }>) {
  const screen = participantScreen(pathname);
  const header = participantHeader(screen, pathname);
  const backAction = header.backHref
    ? {
        ariaLabel: "이전 화면으로 돌아가기",
        href: header.backHref,
      }
    : header.backDisabled
      ? { ariaLabel: "이전 화면으로 돌아가기", disabled: true as const }
      : undefined;
  const authRoute = screen.id.startsWith("AUTH-");
  const content = <ParticipantLoadingContent screen={screen} />;

  return (
    <PlatformPageShell
      {...(backAction ? { backAction } : {})}
      {...(screen.id === "AUTH-001"
        ? { className: "civic-login-shell" }
        : screen.id === "AUTH-002"
          ? { className: "civic-signup-account-shell" }
          : {})}
      bottomNavigation={authRoute ? null : <PlatformNavigation currentPathname={pathname} />}
      {...(authRoute ? {} : { contentClassName: "civic-platform-participant-content" })}
      {...(screen.id === "U-RAG-001"
        ? { headerActions: <RagNewQuestionHeaderAction disabled /> }
        : {})}
      title={screen.id === "U-HOME-001" ? <HomeBrandTitle /> : header.title}
    >
      {authRoute ? (
        content
      ) : (
        <>
          <a className="civic-skip-link" href="#civic-loading-content">
            본문 바로가기
          </a>
          <div
            className="civic-platform-participant-body"
            data-participant-surface="true"
            id="civic-loading-content"
          >
            {content}
          </div>
        </>
      )}
    </PlatformPageShell>
  );
}

function ParticipantLoadingContent({ screen }: Readonly<{ screen: ScreenDefinition }>) {
  if (screen.id.startsWith("AUTH-")) return <AuthLoadingScreen screen={screen} />;
  if (screen.status === "PLACEHOLDER") return <ComingSoonScreen screen={screen} />;

  return (
    <ScreenFrame screen={screen}>
      {screen.id === "U-HOME-001" ? <HomeLoadingSurface /> : null}
      {screen.id === "U-RAG-001" ? <RagConversationLoadingSurface /> : null}
      {screen.id === "U-RAG-002" || screen.id === "U-RAG-003" ? <RagSourceLoadingSurface /> : null}
      {screen.id === "U-ACCOUNT-001" ? <AccountHubLoadingSurface /> : null}
      {screen.id.startsWith("U-ACCOUNT-") && screen.id !== "U-ACCOUNT-001" ? (
        <AccountDetailLoadingSurface screenId={screen.id} />
      ) : null}
      {screen.id.startsWith("U-CHAT-") || screen.id.startsWith("U-VOTE-") ? (
        <ParticipantListLoadingSurface />
      ) : null}
      {screen.id.startsWith("COMMON-") ? <ParticipantStateLoadingSurface /> : null}
    </ScreenFrame>
  );
}

function RagConversationLoadingSurface() {
  return (
    <section
      aria-busy="true"
      aria-label="AI 대화를 불러오는 중"
      className="civic-rag-conversation civic-loading-static-surface"
      data-wireflow-layout="rag-conversation"
    >
      <RagIntroBanner />
      <div aria-hidden="true" className="civic-rag-messages civic-loading-rag-messages">
        <SkeletonBlock className="civic-skeleton-chat-question" />
        <SkeletonBlock className="civic-skeleton-chat-answer" />
        <SkeletonBlock className="civic-skeleton-chat-question" />
        <SkeletonBlock className="civic-skeleton-chat-answer" />
      </div>
      <div className="civic-rag-composer">
        <label className="sr-only" htmlFor="loading-rag-question">
          메시지 입력
        </label>
        <textarea
          disabled
          id="loading-rag-question"
          placeholder="궁금한 내용을 입력해 주세요"
          rows={2}
        />
        <button aria-label="질문 전송" disabled type="button">
          전송
        </button>
      </div>
      <LoadingAnnouncement />
    </section>
  );
}

function RagSourceLoadingSurface() {
  return (
    <div
      aria-busy="true"
      aria-label="참조 문서를 불러오는 중"
      className="civic-loading-source-viewer"
    >
      <header className="civic-pdf-toolbar">
        <strong>참조 문서</strong>
        <span>페이지 확인 중</span>
      </header>
      <SkeletonBlock className="civic-skeleton-document-page" />
      <LoadingAnnouncement />
    </div>
  );
}

function AccountHubLoadingSurface() {
  return (
    <div aria-busy="true" aria-label="계정 화면을 불러오는 중" className="civic-account-loading">
      <span aria-hidden="true" className="civic-account-loading-spinner" />
      <LoadingAnnouncement />
    </div>
  );
}

function AccountDetailLoadingSurface({ screenId }: Readonly<{ screenId: string }>) {
  if (screenId === "U-ACCOUNT-003") {
    return (
      <div
        aria-busy="true"
        aria-label="Vote 설문을 불러오는 중"
        className="wf-account-survey"
        data-wireflow-layout="account-survey"
      >
        <section aria-live="polite" className="wf-account-notice wf-vote-survey-status is-loading">
          <div>
            <h2>설문 확인 중</h2>
            <p>Vote 서버에서 현재 설문을 불러오는 중입니다…</p>
          </div>
        </section>
        <LoadingAnnouncement />
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      aria-label="계정 정보를 불러오는 중"
      className="wf-account-management civic-loading-static-surface"
      data-wireflow-layout="account-management"
    >
      <section className="wf-account-section">
        <h2>보안</h2>
        <div className="wf-account-security-list">
          <article className="wf-account-security-card">
            <div>
              <h3>비밀번호 변경</h3>
              <p>비밀번호 변경 시 모든 기기에서 로그아웃됩니다.</p>
            </div>
            <button className="wf-button wf-button-secondary" disabled type="button">
              변경하기
            </button>
          </article>
          <article className="wf-account-security-card">
            <div>
              <h3>로그인 2차 인증</h3>
              <p>로그인 시 이메일로 받은 6자리 인증번호를 추가로 확인합니다.</p>
            </div>
            <button className="wf-button wf-button-secondary" disabled type="button">
              확인 중
            </button>
          </article>
        </div>
      </section>
      <AccountSessionActionsLoading />
      <LoadingAnnouncement />
    </div>
  );
}

function AccountSessionActionsLoading() {
  return (
    <div className="wf-account-session-actions">
      <div className="wf-account-logout">
        <span aria-hidden="true" className="civic-loading-logout-button">
          로그아웃
        </span>
      </div>
      <button
        className="wf-button wf-button-danger wf-account-deactivate-button"
        disabled
        type="button"
      >
        계정 비활성화
      </button>
    </div>
  );
}

function ParticipantListLoadingSurface() {
  return (
    <div
      aria-busy="true"
      aria-label="목록을 불러오는 중"
      className="civic-skeleton-screen civic-loading-participant-list"
    >
      <StaticSearch label="목록 검색" placeholder="검색어를 입력하세요…" />
      <SkeletonCard lines={2} />
      <SkeletonCard lines={2} />
      <LoadingAnnouncement />
    </div>
  );
}

function ParticipantStateLoadingSurface() {
  return (
    <div aria-busy="true" aria-label="상태를 확인하는 중" className="civic-skeleton-screen">
      <SkeletonCard lines={3} />
      <LoadingAnnouncement />
    </div>
  );
}

function AuthLoadingScreen({ screen }: Readonly<{ screen: ScreenDefinition }>) {
  const fields = authLoadingFields(screen.id);
  return (
    <ScreenFrame platformHeading="HIDDEN" screen={screen}>
      <div
        aria-busy="true"
        aria-label={`${screenFrameHeading(screen).title} 화면을 불러오는 중`}
        className="civic-auth-grid civic-loading-static-surface"
        data-wireflow-layout={screen.id === "AUTH-001" ? "auth-login" : "auth-flow"}
      >
        <div className="wf-auth-form civic-loading-auth-form">
          <header className="wf-card-heading">
            <h2>{authCardTitle(screen.id)}</h2>
          </header>
          {fields.map(([label, placeholder]) => (
            <label className="civic-field" key={label}>
              <span>{label}</span>
              <input disabled placeholder={placeholder} />
            </label>
          ))}
          {fields.length === 0 ? <SkeletonBlock className="civic-skeleton-auth-copy" /> : null}
          <button className="wf-button wf-button-primary" disabled type="button">
            {authAction(screen.id)}
          </button>
        </div>
        <LoadingAnnouncement />
      </div>
    </ScreenFrame>
  );
}

/** 관리자 콘텐츠 영역 전용 스켈레톤 — 사이드바는 레이아웃(AdminShell)이 고정 렌더한다. */
export function AdminScreenSkeleton() {
  return <AdminLoadingView pathname={usePathname()} />;
}

export function AdminLoadingView({ pathname }: Readonly<{ pathname: string }>) {
  const screen = adminScreen(pathname);
  if (screen.status === "PLACEHOLDER") return <ComingSoonScreen screen={screen} />;
  const backHref = adminBackHref(screen.id);
  const listKind = adminListKind(screen.id);
  return (
    <ScreenFrame
      {...(backHref ? { backHref } : {})}
      screen={screen}
      title={adminLoadingTitle(screen)}
    >
      {screen.id === "A-RAG-001" || screen.id === "A-RAG-002" || screen.id === "A-RAG-003" ? (
        <AdminRagWorkspaceLoadingSurface />
      ) : listKind ? (
        <AdminTableLoadingSurface kind={listKind} />
      ) : screen.id === "A-HOME-001" ? (
        <AdminHomeLoadingSurface />
      ) : (
        <AdminDetailLoadingSurface />
      )}
    </ScreenFrame>
  );
}

type AdminListKind = "USERS" | "TASKS" | "SIMULATIONS" | "CHAT";

function AdminTableLoadingSurface({ kind }: Readonly<{ kind: AdminListKind }>) {
  const presentation = adminListPresentation(kind);
  return (
    <div
      aria-busy="true"
      aria-label={`${presentation.label}을 불러오는 중`}
      className="civic-admin-workbench civic-domain-console civic-loading-static-surface"
    >
      {kind === "USERS" ? (
        <form className="console-toolbar">
          <ConsoleSearchControl
            ariaLabel="이메일 검색"
            disabled
            placeholder="이메일 주소를 검색해 주세요."
          />
          <StaticFilters labels={["전체", "활성", "비활성", "관리자"]} />
        </form>
      ) : (
        <div className="civic-domain-toolbar civic-loading-domain-toolbar">
          <StaticSearch label={presentation.searchLabel} placeholder={presentation.placeholder} />
          {presentation.filters.length > 0 ? <StaticFilters labels={presentation.filters} /> : null}
        </div>
      )}
      <SkeletonTable headers={presentation.headers} rows={4} />
      <LoadingAnnouncement />
    </div>
  );
}

function AdminRagWorkspaceLoadingSurface() {
  return (
    <div
      aria-busy="true"
      aria-label="문서 관리 화면을 불러오는 중"
      className="civic-rag-admin-layout civic-loading-rag-admin civic-loading-static-surface"
      data-wireflow-layout="rag-workspace"
    >
      <aside className="civic-folder-tree">
        <div className="civic-folder-tree-heading">
          <h2>폴더</h2>
        </div>
        <div aria-label="폴더 작업" className="civic-folder-tree-actions" role="toolbar">
          <span className="civic-secondary-action">폴더 추가</span>
        </div>
        <ul aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index}>
              <span className="civic-folder-expander-placeholder" />
              <SkeletonBlock className="civic-skeleton-folder-row" />
            </li>
          ))}
        </ul>
      </aside>
      <section className="civic-rag-admin-workspace">
        <div className="civic-loading-workspace-heading">
          <strong>문서</strong>
          <span>등록된 문서를 확인합니다.</span>
        </div>
        <div className="civic-document-ledger">
          <div className="civic-ledger-summary">
            <strong>문서를 불러오는 중입니다.</strong>
            <span>처리 상태와 검색에서 제외했는지 확인하고 있습니다.</span>
          </div>
          <form className="wf-document-filters">
            <ConsoleSearchControl
              ariaLabel="문서명 검색"
              disabled
              placeholder="문서명을 검색해 주세요."
            />
            <label>
              <span>처리 상태</span>
              <select disabled defaultValue="ALL">
                <option value="ALL">전체</option>
              </select>
            </label>
            <label>
              <span>페이지당</span>
              <select disabled defaultValue="25">
                <option value="25">25개</option>
              </select>
            </label>
            <details className="wf-filter-advanced">
              <summary>상세 필터</summary>
            </details>
          </form>
          <SkeletonTable
            headers={["", "문서명", "등록자", "등록일", "페이지", "처리 상태", "버전", "작업"]}
            rows={5}
          />
        </div>
        <LoadingAnnouncement />
      </section>
    </div>
  );
}

function AdminHomeLoadingSurface() {
  const metrics = [
    ["토론방 승인 대기", null],
    ["문서 처리 실패", null],
    ["진행 중 과업", "현재 진행 중"],
    ["시뮬레이션 사용 잔액", null],
  ] as const;
  return (
    <div
      aria-busy="true"
      aria-label="관리 현황을 불러오는 중"
      className="civic-admin-home"
      data-wireflow-layout="admin-home"
    >
      <ul aria-label="관리 현황" className="civic-admin-metrics">
        {metrics.map(([label, description]) => (
          <li className="wf-admin-metric" key={label}>
            <small>{label}</small>
            <SkeletonBlock className="civic-skeleton-metric-value" />
            {description ? <span>{description}</span> : null}
          </li>
        ))}
      </ul>
      <section className="civic-current-operations">
        <header>
          <strong>현재 진행 중인 작업</strong>
        </header>
        <div className="civic-loading-operation-rows">
          <SkeletonBlock className="civic-skeleton-operation-row" />
          <SkeletonBlock className="civic-skeleton-operation-row" />
        </div>
      </section>
      <LoadingAnnouncement />
    </div>
  );
}

function AdminDetailLoadingSurface() {
  return (
    <div
      aria-busy="true"
      aria-label="관리 상세 정보를 불러오는 중"
      className="civic-admin-workbench civic-skeleton-screen"
    >
      <SkeletonCard lines={3} />
      <SkeletonCard lines={4} />
      <LoadingAnnouncement />
    </div>
  );
}

function StaticSearch({ label, placeholder }: Readonly<{ label: string; placeholder: string }>) {
  return <ConsoleSearchControl ariaLabel={label} disabled placeholder={placeholder} />;
}

function StaticFilters({ labels }: Readonly<{ labels: readonly string[] }>) {
  return (
    <div aria-label="목록 필터" className="wf-admin-filters" role="group">
      {labels.map((label, index) => (
        <button aria-pressed={index === 0} disabled key={label} type="button">
          {label}
        </button>
      ))}
    </div>
  );
}

function SkeletonTable({ headers, rows }: Readonly<{ headers: readonly string[]; rows: number }>) {
  return (
    <div aria-hidden="true" className="civic-table-scroll civic-loading-table">
      <table className="civic-admin-table">
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {headers.map((header, column) => (
                <td key={`${header}-${column}`}>
                  <SkeletonBlock
                    className={
                      column === 0 ? "civic-skeleton-table-primary" : "civic-skeleton-table-cell"
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingAnnouncement() {
  return (
    <span aria-live="polite" className="sr-only" role="status">
      화면 내용을 불러오고 있습니다.
    </span>
  );
}

function participantScreen(pathname: string): ScreenDefinition {
  const screen = getScreenByRoute(pathname);
  if (screen && screen.audience !== "ADMIN") return screen;
  return fallbackScreen("U-HOME-001", "/home", "홈", "PARTICIPANT", "MAIN_AUTH");
}

function adminScreen(pathname: string): ScreenDefinition {
  const screen = getScreenByRoute(pathname);
  if (screen?.audience === "ADMIN") return screen;
  return fallbackScreen("A-HOME-001", "/admin", "관리 업무 선택", "ADMIN", "MAIN_AUTH");
}

function fallbackScreen(
  id: string,
  route: string,
  title: string,
  audience: ScreenDefinition["audience"],
  owner: ScreenDefinition["owner"],
): ScreenDefinition {
  return {
    audience,
    canonical_title: title,
    id,
    owner,
    route,
    source_heading: title,
    status: "FUNCTIONAL",
  };
}

function participantHeader(
  screen: ScreenDefinition,
  pathname: string,
): Readonly<{ backDisabled?: boolean; backHref?: string; title: string }> {
  if (screen.id.startsWith("AUTH-")) return authHeader(screen.id);
  const heading = screenFrameHeading(screen);
  const normalized = pathname.replace(/^\/account(?=\/|$)/u, "/mypage");
  const sectionRoot = normalized.startsWith("/rag")
    ? "/rag"
    : normalized.startsWith("/chat")
      ? "/chat"
      : normalized.startsWith("/vote")
        ? "/vote"
        : normalized.startsWith("/mypage")
          ? "/mypage"
          : undefined;
  const backHref =
    heading.backHref ?? (sectionRoot && normalized !== sectionRoot ? sectionRoot : undefined);
  return {
    ...(backHref
      ? { backHref }
      : sectionRoot && normalized === sectionRoot
        ? { backDisabled: true }
        : {}),
    title: heading.title,
  };
}

function authHeader(id: string): Readonly<{ backHref?: string; title: string }> {
  if (id === "AUTH-001") return { title: "로그인" };
  if (id === "AUTH-002" || id === "AUTH-003" || id === "AUTH-004") {
    return { backHref: id === "AUTH-002" ? "/login" : "/signup/account", title: "회원가입" };
  }
  if (id === "AUTH-005" || id === "AUTH-006") {
    return {
      backHref: "/signup/account",
      title: "이메일 인증",
    };
  }
  if (id === "AUTH-007" || id === "AUTH-008") {
    return {
      backHref: id === "AUTH-007" ? "/login" : "/password-reset",
      title: "비밀번호 재설정",
    };
  }
  return { backHref: "/login", title: "계정 재활성화" };
}

function authLoadingFields(id: string): readonly (readonly [string, string])[] {
  if (id === "AUTH-001") {
    return [
      ["이메일", "name@example.com"],
      ["비밀번호", "비밀번호 입력…"],
    ];
  }
  if (id === "AUTH-002") {
    return [
      ["이메일", "name@example.com"],
      ["비밀번호", ""],
      ["비밀번호 확인", ""],
    ];
  }
  if (id === "AUTH-005" || id === "AUTH-007" || id === "AUTH-010") {
    return [["6자리 인증 코드", "0 0 0 0 0 0"]];
  }
  if (id === "AUTH-008") {
    return [
      ["6자리 인증 코드", "0 0 0 0 0 0"],
      ["새 비밀번호", ""],
      ["새 비밀번호 확인", ""],
    ];
  }
  if (id === "AUTH-009") {
    return [
      ["이메일", "등록 이메일 입력"],
      ["비밀번호 확인", ""],
    ];
  }
  return [];
}

function authCardTitle(id: string): string {
  if (id === "AUTH-001") return "다시 오신 것을 환영합니다";
  if (id === "AUTH-002") return "계정 정보를 입력해 주세요";
  if (id === "AUTH-005" || id === "AUTH-006") return "이메일을 확인해 주세요";
  if (id === "AUTH-007" || id === "AUTH-008") return "비밀번호를 재설정합니다";
  if (id === "AUTH-009" || id === "AUTH-010") return "계정을 다시 활성화합니다";
  return "가입 정보를 확인해 주세요";
}

function authAction(id: string): string {
  return (
    {
      "AUTH-001": "로그인",
      "AUTH-002": "인증 코드 받기",
      "AUTH-003": "다음으로",
      "AUTH-004": "약관에 동의하고 가입하기",
      "AUTH-005": "인증하기",
      "AUTH-006": "가입 이메일 인증",
      "AUTH-007": "인증하기",
      "AUTH-008": "비밀번호 변경",
      "AUTH-009": "인증 코드 받기",
      "AUTH-010": "계정 재활성화",
    }[id] ?? "계속"
  );
}

function adminListKind(id: string): AdminListKind | null {
  if (id === "A-USER-001") return "USERS";
  if (id === "A-TASK-001") return "TASKS";
  if (id === "A-SIM-001") return "SIMULATIONS";
  if (["A-CHAT-001", "A-CHAT-004", "A-CHAT-007", "A-CHAT-008", "A-CHAT-009"].includes(id)) {
    return "CHAT";
  }
  return null;
}

function adminListPresentation(kind: AdminListKind): Readonly<{
  filters: readonly string[];
  headers: readonly string[];
  label: string;
  placeholder: string;
  searchLabel: string;
}> {
  if (kind === "USERS") {
    return {
      filters: ["전체", "활성", "비활성", "관리자"],
      headers: ["이메일", "계정 상태", "관리자 역할", "운영 권한", "최근 활동", "작업"],
      label: "사용자 목록",
      placeholder: "이메일 주소 입력…",
      searchLabel: "이메일 검색",
    };
  }
  if (kind === "TASKS") {
    return {
      filters: ["전체", "초안", "예약", "진행 중", "마감"],
      headers: ["과업 제목", "상태", "시작", "마감", "종료 유형", "최근 변경", "작업"],
      label: "과업 목록",
      placeholder: "과업 제목 입력…",
      searchLabel: "과업 제목 검색",
    };
  }
  if (kind === "SIMULATIONS") {
    return {
      filters: [],
      headers: ["과업 제목", "시뮬레이션 진행 상태", "최근 변경"],
      label: "시뮬레이션 과업 목록",
      placeholder: "과업 제목 입력…",
      searchLabel: "시뮬레이션할 과업 찾기",
    };
  }
  return {
    filters: ["전체", "대기", "승인", "반려"],
    headers: ["토론방 이름", "신청자", "요청 시각", "상태", "작업"],
    label: "토론방 운영 목록",
    placeholder: "검색어 입력…",
    searchLabel: "토론방 검색",
  };
}

function adminBackHref(id: string): Route | undefined {
  if (id.startsWith("A-USER-") && id !== "A-USER-001") return "/admin/users" as Route;
  if (id.startsWith("A-RAG-") && !["A-RAG-001", "A-RAG-002", "A-RAG-003"].includes(id)) {
    return "/admin/rag" as Route;
  }
  if (
    id.startsWith("A-CHAT-") &&
    !["A-CHAT-001", "A-CHAT-004", "A-CHAT-007", "A-CHAT-008", "A-CHAT-009"].includes(id)
  ) {
    return "/admin/chat" as Route;
  }
  if (id.startsWith("A-TASK-") && id !== "A-TASK-001") return "/admin/tasks" as Route;
  if (id.startsWith("A-SIM-") && id !== "A-SIM-001") return "/admin/simulations" as Route;
  return undefined;
}

function adminLoadingTitle(screen: ScreenDefinition): string {
  if (screen.id === "A-CHAT-004") return "토론방 생성 요청";
  if (screen.id === "A-CHAT-005" || screen.id === "A-CHAT-006") {
    return "토론방 생성 요청 검토";
  }
  return screenFrameHeading(screen).title;
}
