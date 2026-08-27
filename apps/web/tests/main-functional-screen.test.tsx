import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MainFunctionalScreen } from "@/components/screens/main-functional-screen";
import {
  AuditList,
  createLatestAdminUserRequestGate,
  createMutationLock,
  auditSubjectHref,
  adminRoleMutationPath,
  filterAdminUsers,
  loadRequestedAdminUser,
  loadRoleConflictUser,
  loadChatRequestSummary,
  loadRagJobSummary,
  loadTaskDeadlineSummary,
  requestAdminUsers,
  requestAdminAudit,
  roleFormKey,
  updateAdminLoadMessage,
  userBackHref,
} from "@/components/screens/admin-functional-screen";
import {
  loadAccountProfile,
  normalizeTwoFactorCode,
  passwordConfirmationMatches,
  readProfileSettings,
  redirectAfterPasswordChange,
} from "@/components/screens/account-functional-screen";
import {
  authStepAfterPopState,
  authCompletionDestination,
  authenticatedDestination,
  safeReturnTarget,
  signupRecovery,
  signupCompletionPath,
  signupStepFromHistory,
  verificationKindFromSearch,
} from "@/components/screens/auth-functional-screen";
import { requestLogout } from "@/components/auth/logout-button";
import { mainScreenPrimaryActions } from "@/components/screens/main-screen-actions";
import { AdminShell } from "@/components/shell/admin-shell";
import { ParticipantShell } from "@/components/shell/participant-shell";
import { screenRegistry } from "@/lib/screens/registry";

const mainScreens = screenRegistry.filter(
  (screen) => screen.owner === "MAIN_AUTH" && screen.status === "FUNCTIONAL",
);
const fullAdminSession = {
  role: "HIGHEST_ADMIN" as const,
  permissions: ["RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN"] as const,
};

function renderedText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("25 functional Main/Auth screens", () => {
  it("관리자 감사 이력 표현을 실제 이벤트로 검증할 수 있는 경계를 제공한다", async () => {
    const adminScreenModule = await import("@/components/screens/admin-functional-screen");
    expect(adminScreenModule.AuditList).toBeTypeOf("function");
  });

  it("감사 이력은 실행자·대상 UUID 대신 이메일을 표시한다", () => {
    const actorId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
    const subjectId = "03aca507-5bd9-4d83-878b-8b39b6f97e63";
    const html = renderToStaticMarkup(
      createElement(AuditList, {
        events: [
          {
            event_id: "10000000-0000-4000-8000-000000000001",
            event_type: "ROLE_CHANGED",
            actor_id: actorId,
            subject_id: subjectId,
            occurred_at: "2026-08-21T01:02:03Z",
            request_id: "20000000-0000-4000-8000-000000000001",
            before_roles: ["PARTICIPANT"],
            after_roles: ["ADMIN"],
            before_permissions: [],
            after_permissions: ["RAG_ADMIN"],
            reason: "RAG 문서 운영 담당 지정",
          },
        ],
        userLabels: new Map([
          [actorId, "highest-admin@post-ai.com"],
          [subjectId, "rag-admin@post-ai.com"],
        ]),
      }),
    );

    expect(html).toContain("highest-admin@post-ai.com");
    expect(html).toContain("rag-admin@post-ai.com");
    expect(html).toContain("관리자 역할 변경");
    const text = renderedText(html);
    expect(text).not.toContain("ROLE_CHANGED");
    expect(text).not.toContain(actorId);
    expect(text).not.toContain(subjectId);
    expect(text).not.toContain("10000000-0000-4000-8000-000000000001");
    expect(text).not.toContain("20000000-0000-4000-8000-000000000001");
  });

  it("감사 사용자 조회 실패 시 내부 ID 대신 안전한 문구를 표시한다", () => {
    const actorId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
    const html = renderToStaticMarkup(
      createElement(AuditList, {
        events: [
          {
            event_id: "10000000-0000-4000-8000-000000000001",
            event_type: "ROLE_CHANGED",
            actor_id: actorId,
            occurred_at: "2026-08-21T01:02:03Z",
            request_id: "20000000-0000-4000-8000-000000000001",
          },
        ],
        userLabels: new Map(),
      }),
    );

    expect(html).toContain("확인할 수 없는 사용자");
    expect(renderedText(html)).not.toContain(actorId);
  });

  it("역할 변경과 가입 완료의 opaque ID를 경로 세그먼트로 인코딩한다", () => {
    expect(adminRoleMutationPath("user B/2")).toBe("/api/v1/admin/users/user%20B%2F2/roles");
    expect(signupCompletionPath("flow?part/1")).toBe(
      "/api/v1/signup/flows/flow%3Fpart%2F1/complete",
    );
  });

  it("대상이 없는 감사 이벤트는 사용자 상세 링크를 만들지 않는다", () => {
    expect(auditSubjectHref(null)).toBeNull();
    expect(auditSubjectHref(undefined)).toBeNull();
    expect(auditSubjectHref("user B/2")).toBe("/admin/users/detail?userId=user%20B%2F2");
  });

  it("관리자 사용자 검색은 가장 최근 요청만 결과를 반영한다", () => {
    const gate = createLatestAdminUserRequestGate();
    const initial = gate.begin();
    const latest = gate.begin();

    expect(initial()).toBe(false);
    expect(latest()).toBe(true);
    gate.cancel();
    expect(latest()).toBe(false);
  });

  it("관리자 사용자 조회의 전송·응답 해석 실패를 안전한 실패로 반환한다", async () => {
    const unavailable = vi.fn(async () => Promise.reject(new Error("offline")));
    const malformed = vi.fn(async () => Response.json({ items: "not-an-array" }));

    await expect(requestAdminUsers("admin", unavailable as typeof fetch)).resolves.toBeNull();
    await expect(requestAdminUsers("admin", malformed as typeof fetch)).resolves.toBeNull();
    expect(unavailable).toHaveBeenCalledWith("/api/v1/admin/users?query=admin", {
      cache: "no-store",
    });
  });

  it("관리자 감사 이력의 전송·응답 해석 실패를 안전한 실패로 반환한다", async () => {
    const unavailable = vi.fn(async () => Promise.reject(new Error("offline")));
    const malformed = vi.fn(async () => Response.json({ items: null }));

    await expect(requestAdminAudit(undefined, unavailable as typeof fetch)).resolves.toBeNull();
    await expect(requestAdminAudit(undefined, malformed as typeof fetch)).resolves.toBeNull();
  });

  it("사용자별 감사 화면은 선택한 사용자 이벤트만 유지한다", async () => {
    const request = vi.fn(async () =>
      Response.json({
        items: [
          { event_id: "event-a", subject_id: "user-a" },
          { event_id: "event-b", subject_id: "user-b" },
        ],
      }),
    );

    await expect(requestAdminAudit("user-b", request as typeof fetch)).resolves.toEqual([
      { event_id: "event-b", subject_id: "user-b" },
    ]);
    expect(request).toHaveBeenCalledWith("/api/v1/admin/audit", { cache: "no-store" });
  });

  it("사용자 조회 성공이 감사 조회 오류 메시지를 지우지 않는다", () => {
    const auditFailed = updateAdminLoadMessage(
      { user: "", audit: "" },
      "audit",
      "감사 이력을 불러오지 못했습니다.",
    );
    const usersLoaded = updateAdminLoadMessage(auditFailed, "user", "");

    expect(usersLoaded).toEqual({
      user: "",
      audit: "감사 이력을 불러오지 못했습니다.",
    });
  });

  it("계정 비밀번호 변경은 확인값이 일치할 때만 허용한다", () => {
    const matching = new FormData();
    matching.set("new_password", "correct horse battery staple");
    matching.set("new_password_confirmation", "correct horse battery staple");
    expect(passwordConfirmationMatches(matching)).toBe(true);

    matching.set("new_password_confirmation", "typing mistake");
    expect(passwordConfirmationMatches(matching)).toBe(false);
  });

  it("비밀번호 변경 성공 직후 폐기된 세션을 쓰지 않고 로그인으로 이동한다", () => {
    const navigate = vi.fn();
    redirectAfterPasswordChange(navigate);
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/login");
  });

  it("2FA 최초 활성화는 빈 코드를 null challenge 요청으로 정규화한다", () => {
    expect(normalizeTwoFactorCode("")).toBeNull();
    expect(normalizeTwoFactorCode("   ")).toBeNull();
    expect(normalizeTwoFactorCode(" 123456 ")).toBe("123456");
  });

  it("로그아웃은 Main/Auth refresh family 종료 API를 POST로 호출한다", async () => {
    const request = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(requestLogout(request as typeof fetch)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith("/api/v1/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await expect(
      requestLogout(vi.fn(async () => Promise.reject(new Error("offline"))) as typeof fetch),
    ).resolves.toBe(false);
  });

  it("관리자 사용자 상태 필터가 활성·비활성·관리자 행을 실제로 제한한다", () => {
    const users = [
      {
        user_id: "1",
        email: "active@example.com",
        account_state: "ACTIVE",
        roles: ["PARTICIPANT"],
        permissions: [],
        row_version: 1,
        must_change_password: false,
      },
      {
        user_id: "2",
        email: "inactive@example.com",
        account_state: "DEACTIVATED",
        roles: ["PARTICIPANT"],
        permissions: [],
        row_version: 1,
        must_change_password: false,
      },
      {
        user_id: "3",
        email: "rag-admin@example.com",
        account_state: "ACTIVE",
        roles: ["ADMIN"],
        permissions: ["RAG_ADMIN"],
        row_version: 1,
        must_change_password: false,
      },
    ];

    expect(filterAdminUsers(users, "active").map((user) => user.user_id)).toEqual(["1", "3"]);
    expect(filterAdminUsers(users, "inactive").map((user) => user.user_id)).toEqual(["2"]);
    expect(filterAdminUsers(users, "admin").map((user) => user.user_id)).toEqual(["3"]);
  });

  it("상세 화면은 목록 첫 행이 아니라 URL이 지정한 사용자를 직접 조회한다", async () => {
    const request = vi.fn(async () =>
      Response.json({ user_id: "requested-user", email: "requested@example.com" }),
    );

    await expect(
      loadRequestedAdminUser("requested-user", request as typeof fetch),
    ).resolves.toMatchObject({
      user_id: "requested-user",
    });
    expect(request).toHaveBeenCalledWith("/api/v1/admin/users/requested-user", {
      cache: "no-store",
    });
  });

  it("권한 변경은 응답이 끝날 때까지 중복 제출을 잠근다", () => {
    const lock = createMutationLock();

    expect(lock.tryBegin()).toBe(true);
    expect(lock.tryBegin()).toBe(false);
    lock.end();
    expect(lock.tryBegin()).toBe(true);
  });

  it("권한 버전 충돌은 최신 사용자를 다시 읽고 역할 폼 키를 갱신한다", async () => {
    const request = vi.fn(async () =>
      Response.json({
        user_id: "user B/2",
        email: "user-b@example.com",
        account_state: "ACTIVE",
        roles: ["ADMIN"],
        row_version: 4,
        must_change_password: false,
      }),
    );
    const stale = {
      user_id: "user B/2",
      email: "user-b@example.com",
      account_state: "ACTIVE",
      roles: ["PARTICIPANT"],
      permissions: [],
      row_version: 3,
      must_change_password: false,
    };
    const latest = await loadRoleConflictUser(409, stale.user_id, request as typeof fetch);

    expect(latest?.row_version).toBe(4);
    expect(request).toHaveBeenCalledWith("/api/v1/admin/users/user%20B%2F2", {
      cache: "no-store",
    });
    expect(roleFormKey(stale, "A-USER-003")).not.toBe(roleFormKey(latest, "A-USER-003"));
    await expect(
      loadRoleConflictUser(400, stale.user_id, vi.fn() as typeof fetch),
    ).resolves.toBeNull();
  });

  it("감사 화면의 뒤로 가기는 현재 사용자 ID를 상세 화면에 보존한다", () => {
    expect(
      userBackHref("/admin/users/detail", {
        user_id: "user B/2",
        email: "user-b@example.com",
        account_state: "ACTIVE",
        roles: ["PARTICIPANT"],
        permissions: [],
        row_version: 2,
        must_change_password: false,
      }),
    ).toBe("/admin/users/detail?userId=user%20B%2F2");
    expect(userBackHref("/admin/users/detail", null)).toBe("/admin/users/detail");
  });

  it("2FA 변경 후 동일한 no-store 프로필 조회 계약으로 최신 상태를 다시 읽는다", async () => {
    const request = vi.fn(async () =>
      Response.json({
        user_id: "participant-1",
        email: "participant@example.com",
        role: "PARTICIPANT",
        account_state: "ACTIVE",
        preferred_language: "ko",
        rag_answer_detail: "balanced",
        two_factor_enabled: true,
        response_version: 4,
      }),
    );

    await expect(loadAccountProfile(request as typeof fetch)).resolves.toMatchObject({
      two_factor_enabled: true,
      response_version: 4,
    });
    expect(request).toHaveBeenCalledWith("/api/v1/account/profile", { cache: "no-store" });
  });

  it("서버에서 늦게 읽은 계정 설정을 제어 입력값으로 정규화한다", () => {
    expect(
      readProfileSettings({
        user_id: "participant-1",
        email: "participant@example.com",
        role: "PARTICIPANT",
        account_state: "ACTIVE",
        preferred_language: "en",
        rag_answer_detail: "detailed",
        two_factor_enabled: false,
        response_version: 2,
      }),
    ).toEqual({ preferredLanguage: "en", answerDetail: "detailed" });
  });

  it("프로필 조회가 끝나기 전에는 기본값을 저장할 수 없다", () => {
    const profile = mainScreens.find((screen) => screen.id === "U-ACCOUNT-001");
    if (!profile) throw new Error("profile screen missing");

    const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: profile }));

    expect(html).toContain("불러오는 중…");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>불러오는 중…<\/button>/u);
    expect(html).toMatch(/<select[^>]*disabled=""[^>]*name="preferred_language"/u);
  });

  it("프로필 조회가 끝나기 전에는 2FA 상태를 추정해 변경할 수 없다", () => {
    const security = mainScreens.find((screen) => screen.id === "U-ACCOUNT-003");
    if (!security) throw new Error("security screen missing");

    const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: security }));

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>2단계 인증 활성화<\/button>/u);
  });

  it("RAG 실패 요약 조회 실패는 확인된 0건과 구분한다", async () => {
    const unavailable = vi.fn(async () => new Response(null, { status: 503 }));
    const zero = vi.fn(async () =>
      Response.json({
        failed: 0,
        active: 2,
        counts: { QUEUED: 1, RUNNING: 1, RETRY_WAIT: 0, FAILED: 0 },
        recent_failures: [],
      }),
    );

    await expect(loadRagJobSummary(unavailable as typeof fetch)).resolves.toEqual({
      status: "unavailable",
    });
    await expect(loadRagJobSummary(zero as typeof fetch)).resolves.toEqual({
      status: "ready",
      failed: 0,
      active: 2,
      counts: { QUEUED: 1, RUNNING: 1, RETRY_WAIT: 0, FAILED: 0 },
      recentFailures: [],
    });
  });

  it("관리 홈은 Chat 승인 대기와 24시간 내 과업 마감을 실제 응답에서 계산한다", async () => {
    const now = Date.parse("2026-08-26T00:00:00Z");
    const chat = vi.fn(async () =>
      Response.json({ items: [{ id: "one" }, { id: "two" }], hasNext: false }),
    );
    const tasks = vi.fn(async () =>
      Response.json([
        {
          status: "OPEN",
          schedule: { closesAt: "2026-08-26T12:00:00Z" },
        },
        {
          status: "OPEN",
          schedule: { closesAt: "2026-08-28T12:00:00Z" },
        },
        {
          status: "CLOSED",
          schedule: { closesAt: "2026-08-26T03:00:00Z" },
        },
      ]),
    );

    await expect(loadChatRequestSummary(chat as typeof fetch)).resolves.toEqual({
      status: "ready",
      count: 2,
      hasMore: false,
    });
    await expect(loadTaskDeadlineSummary(tasks as typeof fetch, now)).resolves.toEqual({
      status: "ready",
      count: 1,
      hasMore: false,
    });
  });

  it("로그인 복귀 경로는 동일 출처 상대 경로만 허용한다", () => {
    expect(safeReturnTarget("?returnTo=%2Frag%3FfolderId%3Dwelfare")).toBe("/rag?folderId=welfare");
    expect(safeReturnTarget("?returnTo=https%3A%2F%2Fevil.example")).toBeNull();
    expect(safeReturnTarget("?returnTo=%2F%2Fevil.example")).toBeNull();
    expect(safeReturnTarget("?returnTo=%2Flogin")).toBeNull();
  });

  it("강제 비밀번호 변경 세션은 역할 홈이나 복귀 경로보다 계정 보안을 우선한다", () => {
    expect(
      authenticatedDestination({ role: "HIGHEST_ADMIN", must_change_password: true }, "/admin/rag"),
    ).toBe("/account/security");
    expect(authenticatedDestination({ role: "ADMIN", must_change_password: true }, null)).toBe(
      "/account/security",
    );
    expect(authenticatedDestination({ role: "ADMIN", must_change_password: false }, null)).toBe(
      "/admin",
    );
  });

  it("등록된 인증 경로를 새로 열어도 2FA 흐름을 복구한다", () => {
    expect(verificationKindFromSearch("?kind=two-factor&returnTo=%2Frag")).toBe("TWO_FACTOR");
    expect(verificationKindFromSearch("")).toBe("SIGNUP");
  });

  it("가입 인증과 비밀번호 재설정·재활성화 완료 뒤 로그인 화면으로 이동한다", () => {
    expect(authCompletionDestination("AUTH-005", "SIGNUP")).toBe("/login");
    expect(authCompletionDestination("AUTH-008", "SIGNUP")).toBe("/login");
    expect(authCompletionDestination("AUTH-010", "SIGNUP")).toBe("/login");
    expect(authCompletionDestination("AUTH-005", "TWO_FACTOR")).toBeNull();
  });

  it("새로고침으로 가입 흐름 메타데이터가 없어진 후속 단계는 계정 입력으로 복구한다", () => {
    expect(signupRecovery("AUTH-003", false)).toEqual({
      screenId: "AUTH-002",
      pathname: "/signup/account",
    });
    expect(signupRecovery("AUTH-004", false)).toEqual({
      screenId: "AUTH-002",
      pathname: "/signup/account",
    });
    expect(signupRecovery("AUTH-004", true)).toBeNull();
  });

  it("브라우저 뒤로가기 상태에서 가입 단계를 복원한다", () => {
    expect(signupStepFromHistory({ civicSignupStep: "AUTH-002" })).toBe("AUTH-002");
    expect(signupStepFromHistory({ civicSignupStep: "AUTH-003" })).toBe("AUTH-003");
    expect(signupStepFromHistory({ civicSignupStep: "AUTH-004" })).toBe("AUTH-004");
    expect(signupStepFromHistory({ civicSignupStep: "AUTH-001" })).toBeNull();
    expect(signupStepFromHistory({ civicSignupStep: "../../admin" })).toBeNull();
    expect(authStepAfterPopState(null, "AUTH-001")).toBe("AUTH-001");
  });

  it("registry와 구현 action map이 정확히 25개 화면을 공유한다", () => {
    expect(mainScreens).toHaveLength(25);
    expect(Object.keys(mainScreenPrimaryActions).sort()).toEqual(
      mainScreens.map((screen) => screen.id).sort(),
    );
  });

  it("Wire Flow의 첫 번째 행동 문구를 그대로 사용한다", () => {
    expect(mainScreenPrimaryActions).toEqual({
      "AUTH-001": "로그인",
      "AUTH-002": "개인정보·설문 입력",
      "AUTH-003": "필수 동의 단계로",
      "AUTH-004": "필수 동의 후 가입",
      "AUTH-005": "인증 완료",
      "AUTH-006": "가입 이메일 인증",
      "AUTH-007": "재설정 이메일 보내기",
      "AUTH-008": "비밀번호 변경",
      "AUTH-009": "재활성화 계속",
      "AUTH-010": "계정 재활성화",
      "U-HOME-001": "진행 중 과업",
      "U-ACCOUNT-001": "개인정보·설문",
      "U-ACCOUNT-002": "필수 정보·동의 저장",
      "U-ACCOUNT-003": "2단계 인증 활성화",
      "U-ACCOUNT-004": "계정 비활성화",
      "A-HOME-001": "사용자·권한",
      "A-USER-001": "사용자 상세",
      "A-USER-002": "관리자·권한 편집",
      "A-USER-003": "권한 변경 저장",
      "A-USER-004": "권한 회수",
      "A-USER-005": "대상 사용자 보기",
      "COMMON-001": "관리 업무 선택",
      "COMMON-002": "최신 상태 보기",
      "COMMON-003": "처리 결과 재조회",
      "COMMON-004": "다시 시도",
    });
  });

  it.each(mainScreens)("$id 제품 제목·대표 행동을 렌더링한다", (screen) => {
    const html = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen, adminSession: fullAdminSession }),
    );
    expect(html).toContain(screen.id);
    expect(html).toContain('<h1 id="civic-screen-title">');
    expect(html).toContain(mainScreenPrimaryActions[screen.id]);
    expect(html).toContain('class="wf-screen-heading"');
    expect(html).not.toContain('class="civic-screen-meta"');
    expect(html).not.toContain("준비 중");
  });

  it("Wire Flow의 모바일 인증 단계와 보조 행동 구조를 유지한다", () => {
    const signup = mainScreens.find((screen) => screen.id === "AUTH-002");
    const login = mainScreens.find((screen) => screen.id === "AUTH-001");
    if (!signup || !login) throw new Error("AUTH wire flow screens missing");

    const signupHtml = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen: signup }),
    );
    const loginHtml = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: login }));

    expect(signupHtml).toContain('data-wireflow-screen="AUTH-002"');
    expect(signupHtml).toContain('aria-label="회원가입 단계"');
    expect(signupHtml).toContain("1 / 3");
    expect(loginHtml).toContain("회원가입");
    expect(loginHtml).toContain("비밀번호 재설정");
  });

  it("AUTH-001은 기준 GUI의 로그인 카드와 복구·가입 카드 배치를 유지한다", () => {
    const login = mainScreens.find((screen) => screen.id === "AUTH-001");
    if (!login) throw new Error("AUTH-001 wire flow screen missing");

    const loginHtml = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: login }));

    expect(loginHtml).not.toContain("이메일 인증을 완료한 계정으로 접속합니다.");
    expect(loginHtml).toContain('data-wireflow-layout="auth-login"');
    expect(loginHtml).toContain('class="wf-auth-form"');
    expect(loginHtml).toContain('placeholder="name@example.com"');
    expect(loginHtml).toContain('placeholder="비밀번호 입력"');
    expect(loginHtml).toContain('class="wf-button wf-button-primary civic-auth-submit"');
    expect(loginHtml.match(/class="wf-card wf-action-card"/g)).toHaveLength(2);
    expect(loginHtml.indexOf('data-wireflow-slot="auth-reset"')).toBeGreaterThan(
      loginHtml.indexOf('data-wireflow-layout="auth-login"'),
    );
    expect(loginHtml.indexOf('data-wireflow-slot="auth-signup"')).toBeGreaterThan(
      loginHtml.indexOf('data-wireflow-slot="auth-reset"'),
    );
  });

  it("인증 코드와 비밀번호 재설정은 최신 카드·안내 구조를 공유한다", () => {
    for (const id of ["AUTH-005", "AUTH-006", "AUTH-008"]) {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen }));
      expect(html).toContain('class="wf-auth-form"');
      expect(html).toContain('class="wf-auth-info"');
    }
  });

  it("COMMON 화면은 최신 상태 카드 구조를 사용한다", () => {
    for (const id of ["COMMON-001", "COMMON-002", "COMMON-003", "COMMON-004"]) {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen }));
      expect(html).toContain('class="wf-common-state"');
      expect(html).toContain('class="wf-button wf-button-primary"');
      if (id === "COMMON-004") expect(html).toContain('href="/home"');
    }
  });

  it("가입·계정 화면은 고정 정책의 비민감 2문항과 두 필수 동의만 설명한다", () => {
    for (const id of ["AUTH-003", "AUTH-004", "U-ACCOUNT-002"]) {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen }));
      expect(html).not.toContain("민감정보");
      expect(html).not.toContain("개인 AI 페르소나");
    }
  });

  it("frontend2 Platform Shell 참여자 메뉴와 실제 UI 관리자 메뉴를 유지한다", () => {
    const participantHtml = renderToStaticMarkup(
      <ParticipantShell activeRoute="/rag">본문</ParticipantShell>,
    );
    const adminHtml = renderToStaticMarkup(
      <AdminShell activeRoute="/admin/rag" permissions={["RAG_ADMIN"]}>
        본문
      </AdminShell>,
    );

    expect(participantHtml.match(/data-platform-shell="true"/g)).toHaveLength(1);
    expect(participantHtml).toContain('aria-label="참여자 주요 메뉴"');
    expect(participantHtml).toContain("AI");
    expect(adminHtml).toContain('data-wireflow-shell="admin"');
    expect(adminHtml).toContain("<strong>CIVIC AI</strong>");
    expect(adminHtml).toContain("<small>ADMIN</small>");
    expect(adminHtml).toContain("문서 관리");
    expect(adminHtml).toContain("로그아웃");
    const ragAdminHtml = renderToStaticMarkup(
      <AdminShell activeRoute="/forbidden" permissions={["RAG_ADMIN"]} role="ADMIN">
        본문
      </AdminShell>,
    );
    expect(ragAdminHtml).toContain("문서 관리");
    expect(ragAdminHtml).not.toContain("사용자·권한");
  });

  it("U-HOME-001은 최신 Wire Flow의 세 행동 카드와 텍스트 버튼을 사용한다", () => {
    const home = mainScreens.find((screen) => screen.id === "U-HOME-001");
    if (!home) throw new Error("U-HOME-001 missing");

    const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: home }));

    expect(html).toContain('data-wireflow-layout="participant-home"');
    expect(html.match(/class="wf-card wf-action-card"/g)).toHaveLength(3);
    expect(html).toContain("진행 중 과업");
    expect(html).toContain("마감 임박 순으로 확인");
    expect(html).toContain("과업 보기");
    expect(html).toContain("내 채팅");
    expect(html).toContain("참여 중인 방과 새 메시지");
    expect(html).toContain("채팅 보기");
    expect(html).toContain("문서에 질문하기");
    expect(html).toContain("공개 문서를 근거로 답변");
    expect(html).toContain("질문 시작");
    expect(html).not.toMatch(/[▣◇▤›]/);
    expect(html).not.toContain("오픈 예정");
  });

  it("U-ACCOUNT 화면은 최신 모바일 탭·보안 카드·비활성화 dialog 구조를 사용한다", () => {
    const renderAccount = (id: string) => {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      return renderToStaticMarkup(
        createElement(MainFunctionalScreen, { screen, adminSession: fullAdminSession }),
      );
    };

    const profile = renderAccount("U-ACCOUNT-001");
    expect(profile).toContain('data-wireflow-layout="account-profile"');
    expect(profile).toContain('aria-label="계정 설정"');
    expect(profile).toContain("개인정보·설문");
    expect(profile).toContain("보안");
    expect(profile).toContain('class="wf-card wf-account-card"');
    expect(profile).not.toContain("Account authority");
    expect(profile).not.toContain('class="civic-account-summary"');

    const validation = renderAccount("U-ACCOUNT-002");
    expect(validation).toContain('data-wireflow-state="validation-error"');
    expect(validation).toContain('role="alert"');

    const security = renderAccount("U-ACCOUNT-003");
    expect(security).toContain('data-wireflow-layout="account-security"');
    expect(security).toContain("2단계 인증 이메일");
    expect(security).toContain("최근 변경");
    expect(security.match(/class="wf-card wf-action-card"/g)).toHaveLength(2);
    expect(security).toContain("로그아웃");

    const deactivate = renderAccount("U-ACCOUNT-004");
    expect(deactivate).toContain('data-wireflow-layout="account-deactivate"');
    expect(deactivate).toContain('role="alertdialog"');
    expect(deactivate).toContain('aria-modal="true"');
    expect(deactivate).toContain("계정을 비활성화하시겠습니까?");
    expect(deactivate).toContain("계정 유지");
  });

  it("Wire Flow 관리자 사용자 표·사유 필드·회수 확인·감사 열을 유지한다", () => {
    const renderAdmin = (id: string) => {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      return renderToStaticMarkup(createElement(MainFunctionalScreen, { screen }));
    };

    const list = renderAdmin("A-USER-001");
    for (const heading of [
      "이메일",
      "계정 상태",
      "관리자 역할",
      "운영 권한",
      "최근 활동",
      "작업",
    ]) {
      expect(list).toContain(`<th>${heading}</th>`);
    }
    expect(list).not.toContain("<th>이메일 인증</th>");
    expect(list).toContain('aria-label="사용자 상태 필터"');

    const roles = renderAdmin("A-USER-003");
    expect(roles).toContain('name="reason"');
    expect(roles).toContain("변경 사유 (필수)");
    for (const permission of ["RAG 관리", "채팅 관리", "과업·투표 관리", "시뮬레이션 실행·관리"]) {
      expect(roles).toContain(permission);
    }
    expect(roles.match(/disabled=""/g)).toHaveLength(9);

    const revoke = renderAdmin("A-USER-004");
    expect(revoke).toContain('role="alertdialog"');
    expect(revoke).toContain("영향을 확인했습니다");

    const audit = renderAdmin("A-USER-005");
    for (const heading of ["실행자", "대상", "변경 전", "변경 후", "사유", "변경 시각", "작업"]) {
      expect(audit).toContain(`<th>${heading}</th>`);
    }
  });

  it("A-HOME-001은 최신 Wire Flow의 3개 현황 지표와 5개 관리 카드로 구성한다", () => {
    const home = mainScreens.find((screen) => screen.id === "A-HOME-001");
    if (!home) throw new Error("A-HOME-001 missing");

    const html = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen: home, adminSession: fullAdminSession }),
    );

    expect(html).toContain('data-wireflow-layout="admin-home"');
    expect(html.match(/class="wf-admin-metric"/g)).toHaveLength(3);
    expect(html).toContain("승인 대기");
    expect(html).toContain("채팅 생성 신청 확인 중");
    expect(html).toContain("처리 실패");
    expect(html).toContain("확인 중");
    expect(html).toContain("24시간 내 마감");
    expect(html.match(/class="wf-card wf-action-card"/g)).toHaveLength(5);
    expect(html).toContain("사용자 관리 열기");
    expect(html).toContain("문서 관리 열기");
    expect(html).toContain("채팅 신청 열기");
    expect(html).toContain("과업 관리 열기");
    expect(html).toContain("시뮬레이션 열기");
    expect(html).not.toContain("RAG 자료");
    expect(html).not.toContain("오픈 예정");
  });

  it("A-USER 상세·편집·회수는 최신 tab과 overlay 구조를 공유한다", () => {
    const renderAdmin = (id: string) => {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      return renderToStaticMarkup(createElement(MainFunctionalScreen, { screen }));
    };

    const detail = renderAdmin("A-USER-002");
    expect(detail).toContain('data-wireflow-layout="admin-user-detail"');
    expect(detail).toContain('aria-label="사용자 상세 메뉴"');
    expect(detail).toContain('class="civic-user-summary-grid"');
    expect(detail).toContain('class="wf-admin-timeline"');

    const roles = renderAdmin("A-USER-003");
    expect(roles).toContain('data-wireflow-layout="admin-role-editor"');
    expect(roles).toContain("대상 계정");
    expect(roles).toContain("현재 역할");

    const revoke = renderAdmin("A-USER-004");
    expect(revoke).toContain('class="wf-admin-overlay"');
    expect(revoke).toContain('aria-modal="true"');
    expect(revoke).toContain("권한을 회수하시겠습니까?");
  });
});
