import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MainFunctionalScreen } from "@/components/screens/main-functional-screen";
import { ParticipantHomeScreen } from "@/components/screens/participant-home-screen";
import {
  completedSurveyDestination,
  groupSurveyQuestions,
  loadVoteSurvey,
} from "@/components/account/vote-survey-surface";
import { QueryClient } from "@tanstack/react-query";
import {
  AUDIT_GRID_COLUMNS,
  auditRowFromEvent,
  USER_GRID_COLUMNS,
} from "@/components/admin/admin-user-workspace";
import {
  createLatestAdminUserRequestGate,
  createMutationLock,
  auditSubjectHref,
  adminRoleMutationPath,
  ADMIN_PERMISSION_CODES,
  AdminFunctionalScreen,
  AdminHome,
  AdminPendingChatRequests,
  filterAdminUsers,
  formatAdminHomeDate,
  hasAdminAccessRevocation,
  loadRequestedAdminUser,
  loadRoleConflictUser,
  loadChatRequestSummary,
  loadRagJobSummary,
  loadSimulationWalletSummary,
  loadActiveTaskSummary,
  RagFailureSummary,
  ragFailureRetryHref,
  ragFailureLabel,
  requestAdminUsers,
  requestAdminAudit,
  permissionsForAdminRole,
  roleFormKey,
  selectedAdminRole,
  updateAdminLoadMessage,
  userBackHref,
} from "@/components/screens/admin-functional-screen";
import { listCountLabel } from "@/lib/admin/list-count";
import {
  accountDeactivationSuccessPath,
  accountMutation,
  accountProblemMessage,
  loadAccountProfile,
  normalizeTwoFactorCode,
  passwordConfirmationMatches,
  redirectAfterPasswordChange,
  togglePasswordAccordion,
  toggleTwoFactorAccordion,
} from "@/components/screens/account-functional-screen";
import {
  AccountDeactivationCompletedNotice,
  ApiRequestError,
  authErrorMessage,
  authStepAfterPopState,
  authCompletionDestination,
  authenticatedDestination,
  duplicateEmailAccountState,
  evidence,
  isDeactivatedAccountError,
  isAccountDeactivationCompleted,
  isPasswordResetEmail,
  LegalDocumentLink,
  LoginDeactivatedNotice,
  passwordResetAction,
  passwordResetCardTitle,
  passwordResetCodeFromSearch,
  PasswordResetFields,
  passwordResetStepAfterError,
  readPasswordResetResponse,
  secondsUntil,
  safeReturnTarget,
  readSignupAcceptanceControls,
  SignupDuplicateEmailNotice,
  signupPasswordProblem,
  signupRecovery,
  signupCompletionPath,
  signupStepForScreen,
  signupStepFromHistory,
  verificationKindFromSearch,
} from "@/components/screens/auth-functional-screen";
import { requestLogout } from "@/components/auth/logout-button";
import { mainScreenPrimaryActions } from "@/components/screens/main-screen-actions";
import { AdminShell } from "@/components/shell/admin-shell";
import { ParticipantHomeSkeleton } from "@/components/shell/participant-home-skeleton";
import { ParticipantShell } from "@/components/shell/participant-shell";
import { HOME_SEARCH_DESCRIPTION } from "@/lib/home-search";
import { screenRegistry } from "@/lib/screens/registry";

const mainScreens = screenRegistry.filter(
  (screen) => screen.owner === "MAIN_AUTH" && screen.status === "FUNCTIONAL",
);
const fullAdminSession = {
  role: "HIGHEST_ADMIN" as const,
  permissions: ["RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN"] as const,
};

describe("signup consent evidence", () => {
  it("keeps the checkbox click instant instead of replacing it at submit time", () => {
    expect(
      evidence(
        {
          document_id: "TERMS",
          document_version: "2",
          body_sha256: "a".repeat(64),
          path: "/legal/terms/2",
        },
        "2026-09-03T03:04:05.000Z",
      ),
    ).toEqual({
      document_id: "TERMS",
      document_version: "2",
      body_sha256: "a".repeat(64),
      checked_at: "2026-09-03T03:04:05.000Z",
      path: "/legal/terms/2",
    });
  });

  it("requires both terms and account-RAG privacy when the server declares both controls", () => {
    expect(readSignupAcceptanceControls(["TERMS", "ACCOUNT_RAG_PRIVACY"])).toEqual([
      "TERMS",
      "ACCOUNT_RAG_PRIVACY",
    ]);
    expect(readSignupAcceptanceControls(undefined)).toEqual(["TERMS", "ACCOUNT_RAG_PRIVACY"]);
    expect(() => readSignupAcceptanceControls(["ACCOUNT_RAG_PRIVACY"])).toThrow(
      "필수 이용약관 동의 항목을 불러오지 못했습니다.",
    );
  });
});

describe("signup password validation", () => {
  it("accepts the same password boundary as Main/Auth", () => {
    expect(signupPasswordProblem("Abcdef1!", "Abcdef1!")).toBeNull();
    expect(signupPasswordProblem(`${"A".repeat(1022)}1!`, `${"A".repeat(1022)}1!`)).toBeNull();
  });

  it.each([
    ["minimum length", "Short1!"],
    ["required digit", "onlyletters!"],
    ["required symbol", "NoSymbol123"],
    ["whitespace", "Whitespace 1!"],
    ["unsupported symbol", "Invalid123?"],
    ["non-ASCII characters", "한글Pass123!"],
    ["maximum length", `${"A".repeat(1023)}1!`],
  ])("rejects a password outside the Main/Auth policy: %s", (_case, password) => {
    expect(signupPasswordProblem(password, password)).toBe(
      "비밀번호는 8자 이상의 영문·숫자·특수문자(!@#$%^&*()_+-=) 조합으로 입력해 주세요.",
    );
  });

  it("rejects a confirmation that does not match", () => {
    expect(signupPasswordProblem("Valid123!", "Different123!")).toBe(
      "비밀번호 확인이 일치하지 않습니다.",
    );
  });
});

function surveyQuestion(prompt: string, displayOrder: number) {
  return {
    id: `question-${displayOrder}`,
    lineageKey: `lineage-${displayOrder}`,
    type: "SHORT_TEXT" as const,
    prompt,
    description: null,
    displayOrder,
    required: true,
    rule: {},
    allowOther: false,
    options: [],
  };
}

function pendingChatRequest(id: string, requesterUserId: string, name: string) {
  return {
    creationRequestId: id,
    requesterUserId,
    name,
    description: `${name} 설명`,
    categoryIds: [],
    visibility: "LISTED",
    joinPolicy: "OPEN",
    status: "PENDING" as const,
    requestedAt: "2026-08-26T03:00:00Z",
    resolvedAt: null,
    roomId: null,
    ownerMembershipId: null,
    roomVersion: null,
    ownerMembershipVersion: null,
    rejectionReason: null,
    replayed: false,
  };
}

describe("25 functional Main/Auth screens", () => {
  it("관리자 감사 이력 표현을 실제 이벤트로 검증할 수 있는 경계를 제공한다", async () => {
    const workspaceModule = await import("@/components/admin/admin-user-workspace");
    expect(workspaceModule.auditRowFromEvent).toBeTypeOf("function");
  });

  it("감사 이력은 실행자·대상 UUID 대신 이메일을 표시한다", () => {
    const actorId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
    const subjectId = "03aca507-5bd9-4d83-878b-8b39b6f97e63";
    const row = auditRowFromEvent(
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
      new Map([
        [actorId, "highest-admin@example.test"],
        [subjectId, "rag-admin@example.test"],
      ]),
    );

    expect(row.actorLabel).toBe("highest-admin@example.test");
    expect(row.subjectLabel).toBe("rag-admin@example.test");
    expect(row.eventLabel).toBe("관리자 역할 변경");
    expect(row.afterLabel).toContain("문서 관리");
    // subjectId stays as raw data for building links; every displayed label
    // must stay free of internal identifiers.
    const displayed = [
      row.eventLabel,
      row.actorLabel,
      row.subjectLabel,
      row.beforeLabel,
      row.afterLabel,
      row.reason,
      row.occurredLabel,
    ].join(" ");
    expect(displayed).not.toContain("ROLE_CHANGED");
    expect(displayed).not.toContain(actorId);
    expect(displayed).not.toContain(subjectId);
    expect(displayed).not.toContain("20000000-0000-4000-8000-000000000001");
  });

  it("감사 사용자 조회 실패 시 내부 ID 대신 안전한 문구를 표시한다", () => {
    const actorId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
    const row = auditRowFromEvent(
      {
        event_id: "10000000-0000-4000-8000-000000000001",
        event_type: "ROLE_CHANGED",
        actor_id: actorId,
        occurred_at: "2026-08-21T01:02:03Z",
        request_id: "20000000-0000-4000-8000-000000000001",
      },
      new Map(),
    );

    expect(row.actorLabel).toContain("확인할 수 없는 사용자");
    expect(row.actorLabel).not.toContain(actorId);
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
    expect(unavailable).toHaveBeenCalledWith(
      "/api/v1/admin/users?query=admin&status=all&page=1&page_size=20",
      { cache: "no-store" },
    );
  });

  it("관리자 사용자 조회는 상태·페이지·페이지 크기를 서버에 보내고 전체 수를 해석한다", async () => {
    const paged = vi.fn(async () =>
      Response.json({ items: [{ user_id: "u-21" }], total: 145, page: 2, total_pages: 3 }),
    );
    const legacy = vi.fn(async () => Response.json({ items: [] }));

    await expect(requestAdminUsers("", paged as typeof fetch, "admin", 2, 50)).resolves.toEqual({
      items: [{ user_id: "u-21" }],
      total: 145,
      page: 2,
      pageSize: 50,
    });
    expect(paged).toHaveBeenCalledWith(
      "/api/v1/admin/users?query=&status=admin&page=2&page_size=50",
      { cache: "no-store" },
    );
    await expect(requestAdminUsers("", legacy as typeof fetch)).resolves.toEqual({
      items: [],
      total: null,
      page: 1,
      pageSize: 20,
    });
  });

  it("관리자 목록 건수 문구는 전체 대비 표시 건수를 보여준다", () => {
    expect(listCountLabel({ shown: 100, total: 145, unit: "명" })).toBe("전체 145명 중 100명 표시");
    expect(listCountLabel({ shown: 45, total: 45, unit: "명" })).toBe("전체 45명");
    expect(listCountLabel({ shown: 1200, total: 1200 })).toBe("전체 1,200건");
    expect(listCountLabel({ shown: 20, hasMore: true })).toBe("20건 표시 · 더 있음");
    expect(listCountLabel({ shown: 12 })).toBe("12건 표시");
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

  it("2FA 인증 코드는 공백을 제거한 6자리 숫자만 허용한다", () => {
    expect(normalizeTwoFactorCode("")).toBeNull();
    expect(normalizeTwoFactorCode("   ")).toBeNull();
    expect(normalizeTwoFactorCode("12345")).toBeNull();
    expect(normalizeTwoFactorCode("1234567")).toBeNull();
    expect(normalizeTwoFactorCode("12345a")).toBeNull();
    expect(normalizeTwoFactorCode(" 123456 ")).toBe("123456");
  });

  it("비밀번호와 2FA 보안 아코디언을 서로 독립적으로 제어한다", () => {
    const passwordOpen = togglePasswordAccordion({
      passwordOpen: false,
      twoFactorIntent: null,
    });
    const bothOpen = toggleTwoFactorAccordion(passwordOpen, "2fa-request");

    expect(bothOpen).toEqual({
      passwordOpen: true,
      twoFactorIntent: "2fa-request",
    });
    expect(togglePasswordAccordion(bothOpen)).toEqual({
      passwordOpen: false,
      twoFactorIntent: "2fa-request",
    });
    expect(toggleTwoFactorAccordion(bothOpen, "2fa-request")).toEqual({
      passwordOpen: true,
      twoFactorIntent: null,
    });
  });

  it("로그아웃은 Main/Auth refresh family 종료 API를 POST로 호출한다", async () => {
    const request = vi.fn(async () => new Response(null, { status: 204 }));
    const storage = { removeItem: vi.fn() };

    await expect(requestLogout(request as typeof fetch, storage)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith("/api/v1/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(storage.removeItem).toHaveBeenCalledWith("civic:rag-conversation:v1");
    expect(storage.removeItem).toHaveBeenCalledWith("civic.analytics-user-id.v1");
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

  it("관리자 역할은 단일 선택이며 최고 관리자는 모든 운영 권한을 잠근다", () => {
    expect(selectedAdminRole(["PARTICIPANT", "ADMIN"])).toBe("ADMIN");
    expect(selectedAdminRole(["ADMIN", "HIGHEST_ADMIN"])).toBe("HIGHEST_ADMIN");
    expect(permissionsForAdminRole("HIGHEST_ADMIN", [])).toEqual(ADMIN_PERMISSION_CODES);
    expect(permissionsForAdminRole("PARTICIPANT", ["RAG_ADMIN"])).toEqual([]);
    expect(permissionsForAdminRole("ADMIN", ["CHAT_ADMIN", "UNKNOWN"])).toEqual(["CHAT_ADMIN"]);
  });

  it("사용자 전환이나 운영 권한 축소는 저장 요청에서 회수 영향 확인으로 계산한다", () => {
    expect(hasAdminAccessRevocation(["ADMIN"], ["RAG_ADMIN"], ["PARTICIPANT"], [])).toBe(true);
    expect(hasAdminAccessRevocation(["PARTICIPANT"], [], ["ADMIN"], ["RAG_ADMIN"])).toBe(false);
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

  it("내 정보 관리에서는 불필요한 회원정보 설정을 편집하지 않는다", () => {
    const profile = mainScreens.find((screen) => screen.id === "U-ACCOUNT-002");
    if (!profile) throw new Error("profile screen missing");

    const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: profile }));

    expect(html).not.toContain("회원정보 수정");
    expect(html).not.toContain("선호 언어");
    expect(html).not.toContain("AI 답변 상세도");
    expect(html).not.toContain('name="preferred_language"');
    expect(html).not.toContain('name="rag_answer_detail"');
  });

  it("프로필 조회가 끝나기 전에는 2FA 상태를 추정해 변경할 수 없다", () => {
    const security = mainScreens.find((screen) => screen.id === "U-ACCOUNT-002");
    if (!security) throw new Error("security screen missing");

    const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: security }));

    expect(html).toContain("로그인 시 이메일로 받은 6자리 인증번호를 추가로 확인합니다.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>설정하기<\/button>/u);
  });

  it("프로필을 불러오지 못해도 비밀번호는 변경할 수 있다", () => {
    const security = mainScreens.find((screen) => screen.id === "U-ACCOUNT-002");
    if (!security) throw new Error("security screen missing");

    const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: security }));

    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>변경하기<\/button>/u);
  });

  it.each([
    [
      "/api/v1/account/2fa/enable",
      401,
      { detail: "Authentication code is invalid", code: "TWO_FACTOR_ENABLE_EXPIRED" },
      "인증 유효 시간이 지났습니다. 인증번호를 다시 받아 주세요.",
    ],
    [
      "/api/v1/account/2fa/enable",
      401,
      { detail: "Authentication flow subject mismatch" },
      "인증 유효 시간이 지났습니다. 인증번호를 다시 받아 주세요.",
    ],
    [
      "/api/v1/account/password",
      401,
      { detail: "Email or password is invalid" },
      "비밀번호를 변경하지 못했습니다. 현재 비밀번호와, 새 비밀번호가 현재 비밀번호와 다른지 확인해 주세요.",
    ],
    [
      "/api/v1/account/2fa/disable",
      401,
      { detail: "Email or password is invalid" },
      "현재 비밀번호가 올바르지 않습니다.",
    ],
    [
      "/api/v1/account/deactivate",
      401,
      { detail: "Email or password is invalid" },
      "현재 비밀번호가 올바르지 않습니다.",
    ],
    [
      "/api/v1/account/password",
      401,
      { detail: "New password does not satisfy the password policy" },
      "비밀번호는 8자 이상의 영문·숫자·특수문자(!@#$%^&*()_+-=) 조합으로 입력해 주세요.",
    ],
    [
      "/api/v1/account/2fa/enable",
      403,
      { detail: "Password rotation is required" },
      "비밀번호를 먼저 변경해 주세요.",
    ],
    [
      "/api/v1/account/2fa/disable",
      401,
      { detail: "Access token is invalid or expired" },
      "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    ],
    ["/api/v1/account/2fa/enable", 401, {}, "로그인이 만료되었습니다. 다시 로그인해 주세요."],
    [
      "/api/v1/account/2fa/enable",
      400,
      { detail: "CSRF token is invalid" },
      "요청을 처리하지 못했습니다.",
    ],
  ] as const)("계정 오류 %s %i를 한국어로 안내한다", (path, status, problem, message) => {
    expect(accountProblemMessage(path, status, problem)).toBe(message);
  });

  it("계정 변경 요청은 취소 신호를 전달하고 서버 오류를 한국어로 알린다", async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ detail: "Authentication code is invalid" }, { status: 401 }),
    );

    await expect(
      accountMutation(
        "/api/v1/account/2fa/enable",
        "POST",
        { code: "000000" },
        controller.signal,
        request,
      ),
    ).rejects.toThrow("인증번호가 올바르지 않습니다. 다시 확인해 주세요.");
    expect(request.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
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

  it("RAG 실패 요약은 문서 읽기와 구조 분석 실패의 조치 방법을 구분한다", () => {
    expect(ragFailureLabel("DOCUMENT_READ_FAILED")).toBe(
      "문서를 읽을 수 없습니다. 암호화 또는 손상 여부를 확인해 주세요.",
    );
    expect(ragFailureLabel("PAGE_INDEX_OUTLINE_FAILED")).toBe(
      "문서 구조 분석에 실패했습니다. 다시 시도해 주세요.",
    );
    expect(ragFailureLabel("UNKNOWN_FAILURE")).toBe("처리 상태를 확인하고 다시 시도하세요.");
  });

  it("RAG 실패 요약은 공통 문서 관리 링크 대신 문서별 업로드 재시도를 제공한다", () => {
    const sampleFailure = {
      jobId: "job-1",
      documentId: "document-1",
      filename: "sample 정책.pdf",
      failureCode: "PAGE_INDEX_OUTLINE_FAILED",
    };
    const html = renderToStaticMarkup(
      createElement(RagFailureSummary, {
        failures: [
          sampleFailure,
          {
            jobId: "job-2",
            documentId: "document-2",
            filename: "civic-encrypted.pdf",
            failureCode: "DOCUMENT_READ_FAILED",
          },
        ],
      }),
    );

    expect(html).not.toContain("문서 관리에서 조치");
    expect(ragFailureRetryHref(sampleFailure)).toBe(
      "/admin/rag/upload?retryJobId=job-1&documentId=document-1&filename=sample+%EC%A0%95%EC%B1%85.pdf",
    );
    expect(html.match(/href="\/admin\/rag\/upload\?retryJobId=/gu)).toHaveLength(2);
    expect(html).toContain('aria-label="sample 정책.pdf 재시도"');
    expect(html).toContain('aria-label="civic-encrypted.pdf 재시도"');
    expect(html.match(/>재시도<\/a>/gu)).toHaveLength(2);
  });

  it("RAG 실패 요약 응답의 작업·문서 ID를 자동 재시도 링크까지 보존한다", async () => {
    const response = vi.fn(async () =>
      Response.json({
        failed: 1,
        active: 0,
        counts: { FAILED: 1 },
        recent_failures: [
          {
            job_id: "job-1",
            document_id: "document-1",
            filename: "sample.pdf",
            failure_code: "PAGE_INDEX_OUTLINE_FAILED",
            updated_at: "2026-08-29T10:00:00Z",
          },
        ],
      }),
    );

    await expect(loadRagJobSummary(response as typeof fetch)).resolves.toMatchObject({
      status: "ready",
      recentFailures: [
        {
          jobId: "job-1",
          documentId: "document-1",
          filename: "sample.pdf",
        },
      ],
    });
  });

  it("관리 홈은 승인 대기·진행 중 투표·시뮬레이션 사용 잔액을 실제 응답에서 계산한다", async () => {
    const chat = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/v1/admin/user-labels?")) {
        return Response.json({
          items: [
            { user_id: "user-one", email: "one@example.com" },
            { user_id: "user-two", email: "two@example.com" },
          ],
        });
      }
      return Response.json({
        items: [
          pendingChatRequest("request-one", "user-one", "지역 교통 토론방"),
          pendingChatRequest("request-two", "user-two", "청년 주거 토론방"),
        ],
        nextCursor: null,
        hasNext: false,
      });
    });
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
    const wallet = vi.fn(async () =>
      Response.json({
        balanceKrw: 100_000,
        heldKrw: 12_000,
        availableKrw: 88_000,
        spentTodayKrw: 2_700,
        updatedAt: "2026-08-29T10:00:00Z",
      }),
    );

    const chatSummary = await loadChatRequestSummary(chat as typeof fetch);
    expect(chatSummary).toEqual({
      status: "ready",
      count: 2,
      hasMore: false,
      items: [
        pendingChatRequest("request-one", "user-one", "지역 교통 토론방"),
        pendingChatRequest("request-two", "user-two", "청년 주거 토론방"),
      ],
      labels: new Map([
        ["user-one", "one@example.com"],
        ["user-two", "two@example.com"],
      ]),
    });
    const chatHtml = renderToStaticMarkup(
      createElement(AdminPendingChatRequests, { state: chatSummary }),
    );
    expect(chatHtml).toContain("지역 교통 토론방");
    expect(chatHtml).toContain("one@example.com");
    expect(chatHtml).toContain("검토하기");
    expect(chatHtml).toContain("/admin/chat/requests?requestId=request-one");
    expect(chatHtml).toContain(
      '<a class="civic-home-section-action civic-home-section-action--dark" href="/admin/chat/requests">전체 보기</a>',
    );
    expect(chatHtml).toContain('토론방 승인 대기<span class="civic-home-section-count">2건</span>');
    await expect(loadActiveTaskSummary(tasks as typeof fetch)).resolves.toEqual({
      status: "ready",
      count: 2,
      hasMore: false,
    });
    await expect(loadSimulationWalletSummary(wallet as typeof fetch)).resolves.toEqual({
      status: "ready",
      wallet: {
        balanceKrw: 100_000,
        heldKrw: 12_000,
        availableKrw: 88_000,
        spentTodayKrw: 2_700,
        updatedAt: "2026-08-29T10:00:00Z",
      },
    });
  });

  it("관리 홈은 서버의 접수순 계약에 맞춰 먼저 접수된 승인 대기 3건임을 안내한다", () => {
    const items = Array.from({ length: 3 }, (_, index) =>
      pendingChatRequest(`request-${index + 1}`, `user-${index + 1}`, `토론방 ${index + 1}`),
    );
    const html = renderToStaticMarkup(
      createElement(AdminPendingChatRequests, {
        state: {
          status: "ready",
          count: 100,
          hasMore: true,
          items,
          labels: new Map(),
        },
      }),
    );

    expect(html).toContain("먼저 접수된 3건을 표시했습니다.");
    expect(html).not.toContain("최신 3건");
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

  it("Vote 설문 화면 조회가 지연되면 제한시간 오류로 재시도할 수 있다", async () => {
    const hangingVote = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    await expect(loadVoteSurvey(hangingVote, 1)).rejects.toThrow(
      "설문 응답 시간이 초과되었습니다. 다시 시도해 주세요.",
    );
  });

  it("설문 제출 뒤 eligibility를 다시 확인하고 원래 목적지 또는 홈으로 이동한다", async () => {
    const queryClient = new QueryClient();
    const eligible = vi.fn<typeof fetch>(async () =>
      Response.json({ eligible: true, nextAction: null }),
    );
    const stillRequired = vi.fn<typeof fetch>(async () =>
      Response.json({ eligible: false, nextAction: "COMPLETE_CURRENT_SURVEY" }),
    );

    await expect(
      completedSurveyDestination("?returnTo=%2Frag%3FfolderId%3Dwelfare", queryClient, eligible),
    ).resolves.toBe("/rag?folderId=welfare");
    await expect(completedSurveyDestination("", queryClient, eligible)).resolves.toBe("/home");
    await expect(completedSurveyDestination("", queryClient, stillRequired)).resolves.toBeNull();
    expect(eligible).toHaveBeenCalledWith("/api/v1/me/service-eligibility", {
      cache: "no-store",
      method: "GET",
    });
  });

  it("설문 문항을 입력 섹션 순서로 묶고 알 수 없는 문항도 보존한다", () => {
    const questions = [
      surveyQuestion("지방정부 신뢰도", 1),
      surveyQuestion("출생연도", 2),
      surveyQuestion("생활양식", 3),
      surveyQuestion("가구소득", 4),
      surveyQuestion("새로운 설문 문항", 5),
    ];

    expect(groupSurveyQuestions(questions).map((section) => section.title)).toEqual([
      "일반 개인정보",
      "생활 · 경제",
      "사회 · 기관 신뢰",
      "매체 이용 · 정보 습관",
      "설문 항목",
    ]);
    expect(groupSurveyQuestions(questions).flatMap((section) => section.questions)).toHaveLength(
      questions.length,
    );
  });

  it("등록된 인증 경로를 새로 열어도 2FA 흐름을 복구한다", () => {
    expect(verificationKindFromSearch("?kind=two-factor&returnTo=%2Frag")).toBe("TWO_FACTOR");
    expect(verificationKindFromSearch("")).toBe("SIGNUP");
  });

  it("비밀번호 재설정 이메일과 딥링크 인증 코드를 안전하게 읽는다", () => {
    expect(isPasswordResetEmail(" citizen@example.com ")).toBe(true);
    expect(isPasswordResetEmail("citizen.example.com")).toBe(false);
    expect(passwordResetCodeFromSearch("?code=111222")).toBe("111222");
    expect(passwordResetCodeFromSearch("?code=11%2012%2022")).toBe("111222");
    expect(passwordResetCodeFromSearch("?code=12345x")).toBeNull();
  });

  it("비밀번호 재설정은 이메일·인증번호·새 비밀번호를 단계별로 분리한다", () => {
    const onChange = () => undefined;
    const emailHtml = renderToStaticMarkup(
      createElement(PasswordResetFields, {
        code: "",
        email: "",
        onCodeChange: onChange,
        onEmailChange: onChange,
        step: "EMAIL",
      }),
    );
    const codeHtml = renderToStaticMarkup(
      createElement(PasswordResetFields, {
        code: "123456",
        email: "citizen@example.com",
        onCodeChange: onChange,
        onEmailChange: onChange,
        step: "CODE",
      }),
    );
    const passwordHtml = renderToStaticMarkup(
      createElement(PasswordResetFields, {
        code: "123456",
        email: "citizen@example.com",
        onCodeChange: onChange,
        onEmailChange: onChange,
        step: "PASSWORD",
      }),
    );

    expect(emailHtml).toContain('name="email"');
    expect(emailHtml).not.toContain('name="code"');
    expect(codeHtml).toContain('name="email"');
    expect(codeHtml).toContain("readOnly");
    expect(codeHtml).toContain('name="code"');
    expect(codeHtml).not.toContain('name="new_password"');
    expect(passwordHtml).toContain('name="new_password"');
    expect(passwordHtml).toContain('name="new_password_confirmation"');
    expect(passwordHtml).not.toContain('name="code"');
    expect(passwordResetCardTitle("EMAIL")).toBe("이메일 입력");
    expect(passwordResetCardTitle("CODE")).toBe("인증번호 입력");
    expect(passwordResetCardTitle("PASSWORD")).toBe("새 비밀번호 설정");
    expect(passwordResetAction("EMAIL")).toBe("인증번호 받기");
    expect(passwordResetAction("CODE")).toBe("인증번호 확인");
    expect(passwordResetAction("PASSWORD")).toBe("비밀번호 변경");
  });

  it("가입 인증은 동의 단계로 이어지고 비밀번호 재설정·재활성화만 로그인으로 이동한다", () => {
    expect(authCompletionDestination("AUTH-005")).toBeNull();
    expect(authCompletionDestination("AUTH-008")).toBe("/login");
    expect(authCompletionDestination("AUTH-010")).toBe("/login");
  });

  it("가입 흐름 409 응답만 이메일 중복으로 분류하고 계정 상태를 읽는다", () => {
    const conflict = (problem: Record<string, unknown>) =>
      new ApiRequestError(409, problem, "이미 가입된 이메일입니다.");
    expect(duplicateEmailAccountState(conflict({ account_state: "ACTIVE" }))).toBe("ACTIVE");
    expect(duplicateEmailAccountState(conflict({ account_state: "INACTIVE" }))).toBe("INACTIVE");
    expect(duplicateEmailAccountState(conflict({}))).toBe("ACTIVE");
    expect(duplicateEmailAccountState(new ApiRequestError(422, {}, "잘못된 요청"))).toBeNull();
    expect(duplicateEmailAccountState(new Error("이미 가입된 이메일입니다."))).toBeNull();
    expect(duplicateEmailAccountState(null)).toBeNull();
  });

  it("서버의 영문 인증 detail을 직접 노출하지 않고 로그인 문구로 변환한다", () => {
    const invalidCredentials = new ApiRequestError(
      401,
      { code: "INVALID_CREDENTIALS", detail: "Email or password is invalid" },
      "Email or password is invalid",
    );
    const unknown = new ApiRequestError(
      418,
      { code: "UNKNOWN_AUTH_ERROR", detail: "Unexpected authentication error" },
      "Unexpected authentication error",
    );

    expect(authErrorMessage(invalidCredentials, "LOGIN")).toBe(
      "이메일 또는 비밀번호가 올바르지 않습니다.",
    );
    expect(authErrorMessage(unknown, "LOGIN")).toBe(
      "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(authErrorMessage(new Error("Internal auth failure"), "LOGIN")).toBe(
      "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });

  it("네트워크·요청 제한·서비스 오류를 공통 한글 문구로 변환한다", () => {
    expect(
      authErrorMessage(
        new ApiRequestError(0, { code: "NETWORK_ERROR" }, "Failed to fetch"),
        "LOGIN",
      ),
    ).toBe("네트워크 연결을 확인한 후 다시 시도해 주세요.");
    expect(authErrorMessage(new ApiRequestError(429, {}, "Too many requests"), "LOGIN")).toBe(
      "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(
      authErrorMessage(new ApiRequestError(429, {}, "Too many requests"), "VERIFICATION_RESEND"),
    ).toBe("인증번호를 이미 보냈습니다. 잠시 후 다시 시도해 주세요.");
    expect(
      authErrorMessage(new ApiRequestError(503, {}, "Service unavailable"), "SIGNUP_START"),
    ).toBe("서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("회원가입 인증·완료 오류를 단계에 맞는 문구로 변환한다", () => {
    expect(
      authErrorMessage(
        new ApiRequestError(400, { code: "INVALID_EMAIL" }, "Invalid email"),
        "SIGNUP_START",
      ),
    ).toBe("올바른 이메일 주소를 입력해 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(410, { code: "VERIFICATION_CODE_EXPIRED" }, "Code expired"),
        "SIGNUP_VERIFY",
      ),
    ).toBe("인증번호가 만료되었습니다. 새 인증번호를 받아 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(422, { code: "INVALID_VERIFICATION_CODE" }, "Invalid code"),
        "SIGNUP_VERIFY",
      ),
    ).toBe("인증번호가 올바르지 않습니다. 다시 확인해 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(410, { error_code: "SIGNUP_FLOW_EXPIRED" }, "Flow expired"),
        "SIGNUP_COMPLETE",
      ),
    ).toBe("회원가입 시간이 만료되었습니다. 처음부터 다시 진행해 주세요.");
  });

  it("비밀번호 재설정 오류를 요청·인증번호·비밀번호 문제로 구분한다", () => {
    expect(
      authErrorMessage(
        new ApiRequestError(422, { code: "INVALID_EMAIL" }, "Invalid email"),
        "PASSWORD_RESET_REQUEST",
      ),
    ).toBe("올바른 이메일 주소를 입력해 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(401, {}, "Authentication code is invalid"),
        "PASSWORD_RESET_CODE",
      ),
    ).toBe("인증번호가 올바르지 않습니다. 다시 확인해 주세요.");
    expect(
      authErrorMessage(new ApiRequestError(429, {}, "Too many requests"), "PASSWORD_RESET_CODE"),
    ).toBe("인증 시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(401, { code: "PASSWORD_POLICY" }, "Weak password"),
        "PASSWORD_RESET_COMPLETE",
      ),
    ).toBe("비밀번호는 8자 이상의 영문·숫자·특수문자(!@#$%^&*()_+-=) 조합으로 입력해 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(401, { code: "PASSWORD_REUSED" }, "Password reused"),
        "PASSWORD_RESET_COMPLETE",
      ),
    ).toBe("기존 비밀번호와 다른 비밀번호를 사용해 주세요. 인증번호를 다시 받아 진행해 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(401, {}, "Authentication code is invalid"),
        "PASSWORD_RESET_COMPLETE",
      ),
    ).toBe("인증 유효 시간이 지났습니다. 인증번호를 다시 받아 주세요.");
  });

  it("비밀번호 재설정 실패 후 요청 소진 여부에 따라 이메일 또는 인증번호 단계로 되돌린다", () => {
    const unauthorized = (code?: string) =>
      new ApiRequestError(401, code ? { code } : {}, "Authentication failed");
    expect(passwordResetStepAfterError("PASSWORD_RESET_COMPLETE", unauthorized())).toBe("CODE");
    expect(
      passwordResetStepAfterError(
        "PASSWORD_RESET_COMPLETE",
        unauthorized("PASSWORD_RESET_NOT_VERIFIED"),
      ),
    ).toBe("CODE");
    expect(
      passwordResetStepAfterError("PASSWORD_RESET_COMPLETE", unauthorized("PASSWORD_REUSED")),
    ).toBe("EMAIL");
    expect(
      passwordResetStepAfterError("PASSWORD_RESET_COMPLETE", unauthorized("PASSWORD_POLICY")),
    ).toBeNull();
    expect(
      passwordResetStepAfterError("PASSWORD_RESET_RESEND", unauthorized("PASSWORD_RESET_EXPIRED")),
    ).toBe("EMAIL");
    expect(
      passwordResetStepAfterError("PASSWORD_RESET_CODE", unauthorized("PASSWORD_RESET_EXPIRED")),
    ).toBeNull();
    expect(
      passwordResetStepAfterError(
        "PASSWORD_RESET_RESEND",
        new ApiRequestError(429, { code: "PASSWORD_RESET_RESEND_COOLDOWN" }, "Too many"),
      ),
    ).toBeNull();
    expect(passwordResetStepAfterError("PASSWORD_RESET_COMPLETE", new Error("network"))).toBeNull();
  });

  it("비밀번호 재설정 응답의 가린 이메일과 일정만 읽는다", () => {
    expect(
      readPasswordResetResponse({
        masked_email: "ci***@example.com",
        expires_at: "2026-10-01T03:10:00Z",
        resend_available_at: "2026-10-01T03:01:00Z",
      }),
    ).toEqual({
      maskedEmail: "ci***@example.com",
      schedule: {
        expiresAt: "2026-10-01T03:10:00Z",
        resendAvailableAt: "2026-10-01T03:01:00Z",
      },
    });
    expect(readPasswordResetResponse(null)).toEqual({ maskedEmail: null, schedule: null });
    expect(secondsUntil("2026-10-01T03:01:00Z", Date.parse("2026-10-01T03:00:30.500Z"))).toBe(30);
    expect(secondsUntil("2026-10-01T03:01:00Z", Date.parse("2026-10-01T03:02:00Z"))).toBe(0);
    expect(secondsUntil(null, Date.now())).toBe(0);
  });

  it("비밀번호 재설정 요청은 가입되지 않은 이메일을 안내한다", () => {
    expect(
      authErrorMessage(
        new ApiRequestError(404, { code: "PASSWORD_RESET_ACCOUNT_NOT_FOUND" }, "Not found"),
        "PASSWORD_RESET_REQUEST",
      ),
    ).toBe("가입되지 않은 이메일입니다. 이메일 주소를 다시 확인해 주세요.");
    expect(
      passwordResetStepAfterError(
        "PASSWORD_RESET_REQUEST",
        new ApiRequestError(404, { code: "PASSWORD_RESET_ACCOUNT_NOT_FOUND" }, "Not found"),
      ),
    ).toBeNull();
  });

  it("비밀번호 재설정 오류 코드를 원인별 문구로 변환한다", () => {
    const now = Date.now();
    expect(
      authErrorMessage(
        new ApiRequestError(401, { code: "PASSWORD_RESET_ATTEMPTS_EXCEEDED" }, "Exceeded"),
        "PASSWORD_RESET_CODE",
      ),
    ).toBe("인증번호를 5회 잘못 입력했습니다. 인증번호를 다시 받아 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(401, { code: "PASSWORD_RESET_EXPIRED" }, "Expired"),
        "PASSWORD_RESET_CODE",
      ),
    ).toBe("인증번호가 만료되었습니다. 인증번호를 다시 받아 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(401, { code: "PASSWORD_RESET_CODE_MISMATCH" }, "Mismatch"),
        "PASSWORD_RESET_CODE",
      ),
    ).toBe("인증번호가 올바르지 않습니다. 다시 확인해 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(401, { code: "PASSWORD_RESET_NOT_VERIFIED" }, "Not verified"),
        "PASSWORD_RESET_COMPLETE",
      ),
    ).toBe("인증번호 확인이 필요합니다. 인증번호를 입력해 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(401, { code: "PASSWORD_RESET_EXPIRED" }, "Expired"),
        "PASSWORD_RESET_RESEND",
      ),
    ).toBe("재설정 요청이 만료되었습니다. 이메일을 다시 입력해 주세요.");
    expect(
      authErrorMessage(
        new ApiRequestError(
          429,
          {
            code: "PASSWORD_RESET_RESEND_COOLDOWN",
            retry_at: new Date(now + 42_000).toISOString(),
          },
          "Too many",
        ),
        "PASSWORD_RESET_RESEND",
      ),
    ).toMatch(/^(41|42)초 후에 다시 받을 수 있습니다\.$/u);
    expect(
      authErrorMessage(
        new ApiRequestError(
          429,
          {
            code: "PASSWORD_RESET_RESEND_LIMIT",
            retry_at: new Date(now + 30 * 60_000).toISOString(),
          },
          "Too many",
        ),
        "PASSWORD_RESET_REQUEST",
      ),
    ).toBe("인증번호 요청 횟수를 초과했습니다. 30분 후에 다시 시도해 주세요.");
  });

  it("로그인 화면에서 연 비밀번호 재설정은 뒤로·앞으로 이동에서 단계가 복원된다", () => {
    expect(authStepAfterPopState({ civicAuthStep: "AUTH-007" }, "AUTH-001")).toBe("AUTH-007");
    expect(authStepAfterPopState({}, "AUTH-001")).toBe("AUTH-001");
  });

  it("이메일 중복 안내는 활성 계정을 로그인으로, 비활성 계정을 재활성화로 보낸다", () => {
    const activeHtml = renderToStaticMarkup(
      createElement(SignupDuplicateEmailNotice, { accountState: "ACTIVE" }),
    );
    expect(activeHtml).toContain("이미 가입된 이메일");
    expect(activeHtml).toContain('class="civic-form-alert civic-signup-duplicate"');
    expect(activeHtml).toContain("기존 계정으로 로그인해 주세요.");
    expect(activeHtml).not.toContain("대소문자를 무시한 동일 이메일이 있습니다.");
    expect(activeHtml).toContain('href="/login"');
    expect(activeHtml).toContain("로그인으로 이동");
    expect(activeHtml).not.toContain("계정 재활성화");

    const dormantHtml = renderToStaticMarkup(
      createElement(SignupDuplicateEmailNotice, { accountState: "INACTIVE" }),
    );
    expect(dormantHtml).toContain("이미 가입된 이메일");
    expect(dormantHtml).toContain("비활성화된 계정에 사용 중인 이메일입니다.");
    expect(dormantHtml).toContain('href="/reactivate"');
    expect(dormantHtml).toContain("계정 재활성화");
    expect(dormantHtml).not.toContain("로그인으로 이동");
  });

  it("비활성 계정 응답만 로그인 재활성화 안내로 분류한다", () => {
    expect(
      isDeactivatedAccountError(
        new ApiRequestError(403, { account_state: "INACTIVE" }, "비활성화된 계정입니다."),
      ),
    ).toBe(true);
    expect(
      isDeactivatedAccountError(
        new ApiRequestError(401, { account_state: "INACTIVE" }, "비활성화된 계정입니다."),
      ),
    ).toBe(true);
    expect(
      isDeactivatedAccountError(new ApiRequestError(403, { account_state: "ACTIVE" }, "금지됨")),
    ).toBe(false);
    expect(isDeactivatedAccountError(new ApiRequestError(401, {}, "인증 실패"))).toBe(false);
    expect(isDeactivatedAccountError(new Error("비활성화된 계정입니다."))).toBe(false);
  });

  it("비활성 계정 로그인 안내는 재활성화 텍스트 버튼을 보여 준다", () => {
    const html = renderToStaticMarkup(createElement(LoginDeactivatedNotice));
    expect(html).toContain("비활성화된 계정");
    expect(html).toContain('class="civic-form-alert civic-login-deactivated"');
    expect(html).toContain('href="/reactivate"');
    expect(html).toContain("계정 재활성화");
  });

  it("계정 비활성화 성공은 로그인 완료 안내에서 선택적으로 재활성화하도록 한다", () => {
    expect(accountDeactivationSuccessPath).toBe("/login?deactivated=1");
    expect(isAccountDeactivationCompleted("?deactivated=1")).toBe(true);
    expect(isAccountDeactivationCompleted("?deactivated=0")).toBe(false);
    expect(isAccountDeactivationCompleted("?returnTo=%2Fhome")).toBe(false);

    const html = renderToStaticMarkup(createElement(AccountDeactivationCompletedNotice));
    expect(html).toContain("계정 비활성화 완료");
    expect(html).toContain("모든 기기에서 로그아웃되었습니다.");
    expect(html).toContain('href="/reactivate"');
    expect(html).toContain("계정 재활성화");
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
    expect(signupStepFromHistory({ civicSignupStep: "AUTH-003" })).toBeNull();
    expect(signupStepFromHistory({ civicSignupStep: "AUTH-004" })).toBe("AUTH-004");
    expect(signupStepFromHistory({ civicSignupStep: "AUTH-001" })).toBeNull();
    expect(signupStepFromHistory({ civicSignupStep: "../../admin" })).toBeNull();
    expect(authStepAfterPopState(null, "AUTH-001")).toBe("AUTH-001");
  });

  it("가입 진행 표시는 계정 정보, 이메일 인증, 약관 동의 세 단계만 사용한다", () => {
    expect(signupStepForScreen("AUTH-002")).toBe(1);
    expect(signupStepForScreen("AUTH-005")).toBe(2);
    expect(signupStepForScreen("AUTH-006")).toBe(2);
    expect(signupStepForScreen("AUTH-004")).toBe(3);
    expect(signupStepForScreen("AUTH-003")).toBeNull();
    expect(signupStepForScreen("AUTH-007")).toBeNull();
  });

  it("registry와 구현 action map이 정확히 25개 화면을 공유한다", () => {
    expect(mainScreens).toHaveLength(25);
    expect(Object.keys(mainScreenPrimaryActions).sort()).toEqual(
      mainScreens.map((screen) => screen.id).sort(),
    );
  });

  it("현재 화면의 대표 행동 문구를 사용한다", () => {
    expect(mainScreenPrimaryActions).toEqual({
      "AUTH-001": "로그인",
      "AUTH-002": "인증 코드 받기",
      "AUTH-003": "다음으로",
      "AUTH-004": "약관에 동의하고 가입하기",
      "AUTH-005": "인증하기",
      "AUTH-006": "가입 이메일 인증",
      "AUTH-007": "인증번호 받기",
      "AUTH-008": "비밀번호 변경",
      "AUTH-009": "인증 코드 받기",
      "AUTH-010": "계정 재활성화",
      "U-HOME-001": "질문하기",
      "U-ACCOUNT-001": "비밀번호 변경",
      "U-ACCOUNT-002": "비밀번호 변경",
      "U-ACCOUNT-003": "설문 참여",
      "U-ACCOUNT-004": "계정 비활성화",
      "A-HOME-001": "관리 현황",
      "A-USER-001": "사용자 상세",
      "A-USER-002": "권한 편집",
      "A-USER-003": "권한 변경 저장",
      "A-USER-004": "권한 변경 저장",
      "A-USER-005": "권한 이력",
      "COMMON-001": "관리 업무 선택",
      "COMMON-002": "최신 상태 보기",
      "COMMON-003": "처리 결과 재조회",
      "COMMON-004": "다시 시도",
    });
  });

  it.each(mainScreens)("$id 제품 제목·대표 행동을 렌더링한다", (screen) => {
    const html = renderToStaticMarkup(
      screen.id === "U-HOME-001"
        ? createElement(ParticipantHomeScreen, { screen })
        : screen.audience === "ADMIN"
          ? createElement(AdminFunctionalScreen, { screen, adminCurrentUser: fullAdminSession })
          : createElement(MainFunctionalScreen, { screen }),
    );
    expect(html).toContain(screen.id === "AUTH-008" ? "AUTH-007" : screen.id);
    expect(html).toContain('<h1 id="civic-screen-title">');
    expect(html).toContain(
      screen.id === "AUTH-008" ? passwordResetAction("EMAIL") : mainScreenPrimaryActions[screen.id],
    );
    expect(html).toContain('class="wf-screen-heading"');
    expect(html).not.toContain('class="civic-screen-meta"');
    expect(html).not.toContain("준비 중");
  });

  it("Wire Flow의 모바일 인증 단계와 보조 행동 구조를 유지한다", () => {
    const signup = mainScreens.find((screen) => screen.id === "AUTH-002");
    const verification = mainScreens.find((screen) => screen.id === "AUTH-005");
    const consent = mainScreens.find((screen) => screen.id === "AUTH-004");
    const login = mainScreens.find((screen) => screen.id === "AUTH-001");
    if (!signup || !verification || !consent || !login) {
      throw new Error("AUTH wire flow screens missing");
    }

    const signupHtml = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen: signup }),
    );
    const verificationHtml = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen: verification }),
    );
    const consentHtml = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen: consent }),
    );
    const loginHtml = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: login }));

    expect(signupHtml).toContain('data-wireflow-screen="AUTH-002"');
    expect(signupHtml).toContain('aria-label="회원가입 단계"');
    expect(signupHtml).toContain("1/3");
    expect(signupHtml).toContain("계정 정보");
    expect(signupHtml).toContain("로그인 시 사용할 이메일 주소 입니다.");
    expect(signupHtml).not.toContain("로그인에 사용할 이메일");
    expect(signupHtml).not.toContain("필수 동의 항목");
    expect(signupHtml).not.toContain("이용약관에 동의합니다");
    expect(signupHtml).toContain("인증 코드 받기");
    expect(signupHtml).not.toContain("선호 언어");
    expect(signupHtml).not.toContain("AI 답변 상세도");
    expect(signupHtml.match(/autocomplete="new-password"/gi)).toHaveLength(2);
    expect(signupHtml).not.toMatch(/autocomplete="current-password"/i);
    expect(verificationHtml).toContain("2/3");
    expect(verificationHtml).toContain("이메일 인증");
    expect(consentHtml).toContain("3/3");
    expect(consentHtml).toContain("약관 동의·필수정보");
    expect(loginHtml).toContain("회원가입");
    expect(loginHtml).toContain("비밀번호 재설정");
  });

  it("AUTH-001은 기존 로그인 보조 버튼을 유지하고 재활성화 진입을 추가한다", () => {
    const login = mainScreens.find((screen) => screen.id === "AUTH-001");
    if (!login) throw new Error("AUTH-001 wire flow screen missing");

    const loginHtml = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: login }));

    expect(loginHtml).not.toContain("이메일 인증을 완료한 계정으로 접속합니다.");
    expect(loginHtml).toContain('data-wireflow-layout="auth-login"');
    expect(loginHtml).toContain('class="wf-auth-form"');
    expect(loginHtml).toContain('placeholder="name@example.com"');
    expect(loginHtml).toContain('placeholder="비밀번호 입력…"');
    expect(loginHtml).toContain('class="wf-button wf-button-primary civic-auth-submit"');
    expect(loginHtml).toContain('class="civic-auth-support civic-auth-support-compact"');
    expect(loginHtml.indexOf('data-wireflow-slot="auth-reset"')).toBeGreaterThan(
      loginHtml.indexOf('data-wireflow-layout="auth-login"'),
    );
    expect(loginHtml.indexOf('data-wireflow-slot="auth-signup"')).toBeGreaterThan(
      loginHtml.indexOf('data-wireflow-slot="auth-reset"'),
    );
    expect(loginHtml).toContain("계정을 비활성화하셨나요?");
    expect(loginHtml).toContain('data-wireflow-slot="login-reactivate"');
    expect(loginHtml).toContain('href="/reactivate"');
    expect(loginHtml).toContain("계정 재활성화");
  });

  it("AUTH-009는 비밀번호를 잊은 사용자를 재설정 화면으로 보낸다", () => {
    const reactivation = mainScreens.find((screen) => screen.id === "AUTH-009");
    if (!reactivation) throw new Error("AUTH-009 wire flow screen missing");

    const html = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen: reactivation }),
    );

    expect(html).toContain("비밀번호를 잊으셨나요?");
    expect(html).toContain('data-wireflow-slot="reactivation-password-reset"');
    expect(html).toContain('href="/password-reset"');
    expect(html).toContain("비밀번호 재설정");
  });

  it("AUTH-001의 테스트 로그인 버튼은 개발 호스트에서만 렌더링한다", () => {
    const login = mainScreens.find((screen) => screen.id === "AUTH-001");
    if (!login) throw new Error("AUTH-001 wire flow screen missing");

    const publicHtml = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: login }));
    const devHtml = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen: login, devQuickLoginEnabled: true }),
    );

    expect(publicHtml).not.toContain("일반 사용자 테스트 로그인");
    expect(publicHtml).not.toContain("관리자 테스트 로그인");
    expect(devHtml).toContain("개발 테스트 로그인");
    expect(devHtml).toContain("일반 사용자 테스트 로그인");
    expect(devHtml).toContain("관리자 테스트 로그인");
  });

  it("인증 화면과 비밀번호 재설정은 단계에 맞는 카드·안내 구조를 사용한다", () => {
    for (const id of ["AUTH-005", "AUTH-006", "AUTH-007", "AUTH-008"]) {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen }));
      expect(html).toContain('class="wf-auth-form" method="post"');
      if (id === "AUTH-005" || id === "AUTH-006") {
        expect(html).toContain('class="wf-auth-info"');
      } else {
        expect(html).toContain("이메일 입력");
        expect(html).toContain('name="email"');
        expect(html).not.toContain('name="code"');
        expect(html).not.toContain('class="wf-auth-info"');
        expect(html).toContain("아직 계정이 없으신가요?");
        expect(html).toContain('data-wireflow-slot="password-reset-signup"');
        expect(html).toContain('href="/signup/account"');
        expect(html.indexOf('data-wireflow-slot="password-reset-signup"')).toBeGreaterThan(
          html.indexOf("</form>"),
        );
      }
    }
  });

  it("COMMON 화면은 최신 상태 카드 구조를 사용한다", () => {
    const renderCommon = (id: string) => {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      return renderToStaticMarkup(createElement(MainFunctionalScreen, { screen }));
    };

    const forbidden = renderCommon("COMMON-001");
    expect(forbidden).toContain('class="wf-common-state"');
    expect(forbidden).toContain('class="wf-button wf-button-primary"');

    const conflict = renderCommon("COMMON-002");
    expect(conflict).toContain('class="wf-conflict-state"');
    expect(conflict).toContain("화면에 보인 상태");
    expect(conflict).toContain("최신 상태 보기");
    expect(conflict).toContain("투표 목록으로");

    const progress = renderCommon("COMMON-003");
    expect(progress).toContain('class="wf-progress-state"');
    expect(progress).toContain("처리 진행 상태");
    expect(progress).toContain("요청 접수");
    expect(progress).toContain("결과 확인");
    expect(progress).toContain("처리 결과 재조회");

    const outage = renderCommon("COMMON-004");
    expect(outage).toContain('class="wf-outage-state"');
    expect(outage).toContain("입력한 내용은 유지됩니다");
    expect(outage).toContain("다시 시도");
    expect(outage).toContain('href="/home"');
  });

  it("가입 단계는 일반 개인정보 동의와 Vote 민감정보 동의를 구분한다", () => {
    for (const id of ["AUTH-003", "AUTH-004", "U-ACCOUNT-002"]) {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen }));
      expect(html).not.toContain("민감정보");
      expect(html).not.toContain("개인 AI 페르소나");
    }
    const consent = mainScreens.find((item) => item.id === "AUTH-004");
    if (!consent) throw new Error("AUTH-004 missing");
    const consentHtml = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen: consent }),
    );
    expect(consentHtml).toContain("개인정보 수집·이용에 동의합니다");
    expect(consentHtml).not.toContain("계정·RAG");
  });

  it("가입 문서 링크에는 내부 문서 버전을 노출하지 않는다", () => {
    const html = renderToStaticMarkup(
      createElement(LegalDocumentLink, {
        document: {
          document_id: "TERMS",
          document_version: "3",
          body_sha256: "synthetic-sha256",
          path: "/legal/terms/3",
        },
        label: "이용약관",
      }),
    );

    expect(html).toContain("전문 보기");
    expect(html).toContain('href="/legal/terms/3"');
    expect(html).not.toContain("버전 3");
  });

  it("frontend2 Platform Shell 참여자 메뉴와 실제 UI 관리자 메뉴를 유지한다", () => {
    const participantHtml = renderToStaticMarkup(
      <ParticipantShell activeRoute="/rag">본문</ParticipantShell>,
    );
    const participantRagHtml = renderToStaticMarkup(
      <ParticipantShell activeRoute="/rag" scroll="child">
        본문
      </ParticipantShell>,
    );
    const adminHtml = renderToStaticMarkup(
      <AdminShell activeRoute="/admin/rag" permissions={["RAG_ADMIN"]}>
        본문
      </AdminShell>,
    );

    expect(participantHtml.match(/data-platform-shell="true"/g)).toHaveLength(1);
    expect(participantHtml).toContain('aria-label="참여자 주요 메뉴"');
    expect(participantHtml).toContain("AI");
    expect(participantRagHtml.match(/data-scroll="child"/g)).toHaveLength(2);
    expect(participantHtml).toContain('class="civic-platform-participant-body"');
    expect(participantRagHtml).toContain('class="civic-platform-participant-body h-full"');
    const mypageHtml = renderToStaticMarkup(
      <ParticipantShell activeRoute="/mypage">본문</ParticipantShell>,
    );
    const customNavigationHtml = renderToStaticMarkup(
      <ParticipantShell
        activeRoute="/home"
        bottomNavigation={<div data-home-navigation="pending" />}
      >
        본문
      </ParticipantShell>,
    );
    expect(customNavigationHtml).toContain('data-home-navigation="pending"');
    expect(customNavigationHtml).not.toContain('aria-label="참여자 주요 메뉴"');
    for (const sectionHtml of [participantHtml, mypageHtml]) {
      expect(sectionHtml).toContain('aria-label="이전 화면으로 돌아가기"');
      expect(sectionHtml).toContain('data-state="enabled"');
      expect(sectionHtml).toContain('href="/home"');
      expect(sectionHtml).not.toContain('data-state="disabled"');
    }
    for (const route of ["/chat", "/vote"]) {
      const sectionHtml = renderToStaticMarkup(
        <ParticipantShell activeRoute={route}>본문</ParticipantShell>,
      );
      expect(sectionHtml).toContain('aria-label="이전 화면으로 돌아가기"');
      expect(sectionHtml).toContain('data-state="disabled"');
      expect(sectionHtml).toContain("disabled");
    }
    expect(adminHtml).toContain('data-wireflow-shell="admin"');
    expect(adminHtml).toContain("<strong>CIVIC AI</strong>");
    expect(adminHtml).toContain("<small>ADMIN</small>");
    expect(adminHtml).toContain(">문서</span>");
    expect(adminHtml).toContain("로그아웃");
    const ragAdminHtml = renderToStaticMarkup(
      <AdminShell activeRoute="/forbidden" permissions={["RAG_ADMIN"]} role="ADMIN">
        본문
      </AdminShell>,
    );
    expect(ragAdminHtml).toContain(">문서</span>");
    expect(ragAdminHtml).not.toContain(">사용자</span>");
  });

  it("U-HOME-001은 최신 Wire Flow의 세 행동 카드와 텍스트 버튼을 사용한다", () => {
    const home = mainScreens.find((screen) => screen.id === "U-HOME-001");
    if (!home) throw new Error("U-HOME-001 missing");

    const html = renderToStaticMarkup(createElement(ParticipantHomeScreen, { screen: home }));

    expect(html).toContain('data-wireflow-layout="participant-home"');
    expect(html).toContain('data-home-hero-animate="true"');
    expect(html.match(/data-home-hero-topic=/gu)).toHaveLength(3);
    expect(html).toContain('data-home-hero-topic="transfer-fare"');
    expect(html).toContain('data-home-hero-topic="public-parking"');
    expect(html).toContain("동네 공영주차장,");
    expect(html).toContain("주민·장기 주차 우선");
    expect(html).toContain("방문객·단기 주차 우선");
    expect(html).toContain("선착순 이용");
    expect(html).toContain("39%");
    expect(html).toContain("27%");
    expect(html).toContain("34%");
    expect(html).toContain('data-home-hero-topic="heavy-rain-response"');
    expect(html).toContain("집중호우로 인한 도심 침수,");
    expect(html).toContain("어디에 먼저 투자할까요?");
    expect(html).toContain("하수관로 용량 확대");
    expect(html).toContain("빗물저류시설 확충");
    expect(html).toContain("하천·저지대 정비");
    expect(html).toContain("56%");
    expect(html).toContain("25%");
    expect(html).toContain("19%");
    expect(html).toContain('data-home-hero-advance=""');
    expect(html).toMatch(/<circle[^>]*data-home-hero-advance=""[^>]*>/);
    expect(html).not.toMatch(/<svg[^>]*data-home-hero-advance/);
    expect(html).toContain('class="civic-opinion-hero-chart"');
    expect(html).toContain('class="civic-opinion-hero-chart-svg"');
    expect(html).toContain('class="civic-opinion-hero-labels"');
    expect(html).toContain("--civic-hero-dash-length");
    expect(html).toMatch(/stroke-dasharray="[\d.]+ [\d.]+"/u);
    expect(html).not.toContain('pathLength="1"');
    expect(html).not.toContain("aspect-[360/200]");
    expect(html).not.toContain("list-none");
    expect(html).not.toContain("차트 애니메이션 다시 재생");
    expect(html).not.toContain("civic-opinion-hero--animated");
    expect(html).toContain('class="wf-screen-heading-copy" data-nosnippet=""');
    expect(html.match(/class="wf-card wf-action-card"/g)).toHaveLength(3);
    expect(html).toContain('class="wf-card wf-home-welcome"');
    expect(html).toContain('aria-label="개발 지원"');
    expect(html).toContain("개발지원 :");
    expect(html).toContain('alt="한국언론진흥재단"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("support-logo.png");
    expect(html).toContain('data-nosnippet=""');
    expect(html).not.toContain("data-pwa-install-trigger");
    expect(html).toContain("배우고, 토론하고, 함께 결정합니다.");
    expect(html).toContain(HOME_SEARCH_DESCRIPTION);
    expect(html).toContain("어떤 점부터 짚어볼까요?");
    expect(html).toContain("AI가 주제 자료에서 관련 내용을 찾아\n답변해 드려요.");
    expect(html).toContain("질문하기");
    expect(html).toContain("같은 주제로 나누는 생각들");
    expect(html).toContain("관심 있는 주제를 골라 함께\n이야기해 보세요.");
    expect(html).toContain("토론하기");
    expect(html).toContain("논의에 보태는 내 의견");
    expect(html).toContain("이유까지 담아 생각을 표현해 보세요.\nAI가 이유 작성을 도와드려요.");
    expect(html).toContain("투표하기");
    expect(html).not.toMatch(/[▣◇▤›]/);
    expect(html).not.toContain("오픈 예정");
  });

  it("홈 로딩 화면은 애니메이션 없이 실제 히어로의 초기 상태를 유지한다", () => {
    const html = renderToStaticMarkup(createElement(ParticipantHomeSkeleton));

    expect(html).toContain("지역마다 다른 전남광주 환승 요금,");
    expect(html).toContain("어떻게 하면 좋을까요?");
    expect(html).toContain('stroke="#e5e7eb"');
    expect(html).toContain(HOME_SEARCH_DESCRIPTION);
    expect(html).toContain('data-nosnippet=""');
    expect(html).not.toContain("civic-opinion-hero--animated");
    expect(html).not.toContain("data-home-hero-animate");
    expect(html).not.toContain("차트 애니메이션 다시 재생");
  });

  it("계정 화면은 보안·비활성화·로그아웃을 한 화면에 제공하고 설문 보기를 노출하지 않는다", () => {
    const renderAccount = (id: string) => {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      return renderToStaticMarkup(createElement(MainFunctionalScreen, { screen }));
    };

    const hub = renderAccount("U-ACCOUNT-001");
    expect(hub).toContain('data-wireflow-layout="account-hub"');
    expect(hub).toContain('data-wireflow-layout="account-management"');
    expect(hub).toContain("비밀번호 변경");
    expect(hub).toContain("비밀번호 변경 시 모든 기기에서 로그아웃됩니다.");
    expect(hub).not.toContain("변경하면 모든 기기에서 다시 로그인해야 합니다.");
    expect(hub).toContain("로그인 2차 인증");
    expect(hub).toContain("계정 비활성화");
    expect(hub).not.toContain(
      "계정 비활성화의 영향과 복원 가능 범위를 확인한 뒤 진행할 수 있습니다.",
    );
    expect(hub).not.toContain("내 정보 관리");
    expect(hub).not.toContain("내 설문 보기");
    expect(hub).toContain("로그아웃");
    expect(hub.indexOf("로그아웃")).toBeLessThan(hub.indexOf("계정 비활성화"));

    const management = renderAccount("U-ACCOUNT-002");
    expect(management).toContain('data-wireflow-layout="account-management"');
    expect(management).not.toContain("회원정보 수정");
    expect(management).not.toContain("선호 언어");
    expect(management).not.toContain("AI 답변 상세도");
    expect(management).toContain("비밀번호 변경");
    expect(management).toContain("로그인 2차 인증");
    expect(management).not.toContain("서비스 이용 동의");
    expect(management).not.toContain("계정 관리");
    expect(management).toContain("계정 비활성화");
    expect(management).not.toContain("/mypage/deactivate");

    const survey = renderAccount("U-ACCOUNT-003");
    expect(survey).toContain('data-wireflow-layout="account-survey"');
    expect(survey).toContain("설문 참여");
    expect(survey).toContain("현재 설문을 불러오는 중입니다");
    expect(survey).not.toContain("Vote 서버");

    const deactivate = renderAccount("U-ACCOUNT-004");
    expect(deactivate).toContain('data-wireflow-layout="account-deactivate"');
    expect(deactivate).toContain('role="alertdialog"');
    expect(deactivate).toContain('aria-modal="true"');
    expect(deactivate).toContain("계정을 비활성화할까요?");
    expect(deactivate).toContain("계정 유지");
  });

  it("관리자 사용자 표·단일 역할·간결한 사유 필드·감사 열을 유지한다", () => {
    const renderAdmin = (id: string) => {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      return renderToStaticMarkup(createElement(AdminFunctionalScreen, { screen }));
    };

    const list = renderAdmin("A-USER-001");
    expect(USER_GRID_COLUMNS.map((column) => column.headerName)).toEqual(["이메일", "역할"]);
    expect(list).toContain('aria-label="사용자 상태 필터"');
    expect(list).toContain("이메일 검색");
    expect(list).toContain('aria-label="사용자 목록 표"');
    expect(list).not.toContain("이메일 또는 채팅 이름 검색");
    expect(list).not.toContain("wf-admin-workbench-link");

    const roles = renderAdmin("A-USER-003");
    expect(roles).toContain('name="reason"');
    expect(roles).toContain('aria-label="변경 사유 (필수)"');
    expect(roles).toContain('class="civic-role-reason"');
    expect(roles.match(/name="roles"/g)).toHaveLength(3);
    expect(roles.match(/type="radio"/g)).toHaveLength(3);
    for (const permission of ["문서 관리", "채팅 관리", "투표 관리", "시뮬레이션 실행·관리"]) {
      expect(roles).toContain(permission);
    }
    expect(roles).not.toContain("RAG 관리");
    expect(roles).not.toContain("권한 회수 영향 확인");
    // The list pager's prev/next/page-size controls are also disabled while loading;
    // count only the role editor.
    const roleEditor = roles.replace(/<div[^>]*console-pager[\s\S]*?<\/div>/u, "");
    expect(roleEditor.match(/disabled=""/g)).toHaveLength(9);

    const audit = renderAdmin("A-USER-005");
    expect(audit).toContain('aria-label="감사 이력 표"');
    expect(AUDIT_GRID_COLUMNS.map((column) => column.headerName)).toEqual([
      "이벤트",
      "실행자",
      "대상",
      "변경 전",
      "변경 후",
      "사유",
      "변경 시각",
    ]);
  });

  it("A-HOME-001은 메뉴를 반복하지 않고 4개 운영 지표로 구성한다", () => {
    const home = mainScreens.find((screen) => screen.id === "A-HOME-001");
    if (!home) throw new Error("A-HOME-001 missing");

    const html = renderToStaticMarkup(
      createElement(AdminFunctionalScreen, { screen: home, adminCurrentUser: fullAdminSession }),
    );

    expect(html).toContain('data-wireflow-layout="admin-home"');
    expect(html.match(/class="console-metric"/g)).toHaveLength(6);
    expect(html).toContain("토론방 승인 대기");
    expect(html).toContain("운영 중 토론방");
    expect(html).toContain("24시간 내 마감");
    expect(html).toContain('class="civic-admin-metric-link" href="/admin/rag"');
    expect(html).not.toContain("채팅 생성 신청");
    expect(html).toContain('aria-labelledby="civic-pending-chat-requests-title"');
    expect(html).toContain("승인 대기 목록을 확인하고 있습니다.");
    expect(html).toContain("문서 처리 실패");
    expect(html).not.toContain("실패 작업 재시도 가능");
    expect(html).toContain("확인 중");
    expect(html).toContain("진행 중 투표");
    expect(html).toContain("시뮬레이션 사용 잔액");
    expect(html).not.toContain("공용 지갑 잔액 확인 중");
    expect(html).not.toContain("실행 보류");
    // 실시간 운영 목록은 진행 작업이 1건 이상일 때만 나타난다.
    expect(html).not.toContain("현재 처리 중");
    expect(html).not.toContain("처리 현황을 확인하고 있습니다.");
    expect(html).not.toContain("확인이 필요한 문서");
    expect(html).not.toContain('class="wf-card wf-action-card"');
    expect(html).not.toContain("사용자 관리 열기");
    expect(html).not.toContain("문서 관리 열기");
    expect(html).not.toContain("채팅 신청 열기");
    expect(html).not.toContain("투표 관리 열기");
    expect(html).not.toContain("시뮬레이션 열기");
    expect(html).not.toContain("RAG 자료");
    expect(html).not.toContain("오픈 예정");
  });

  it("관리자 홈은 처리할 일을 차분한 목록으로 모아 보여준다", () => {
    const html = renderToStaticMarkup(
      createElement(AdminHome, {
        activeRoomSummary: { status: "ready", count: 2, hasMore: false },
        activeTaskSummary: { status: "ready", count: 1, hasMore: false },
        attentionSimulations: {
          status: "ready",
          count: 2,
          items: [
            {
              taskId: "task-1",
              title: "교통 정책 투표",
              stateLabel: "확인 필요",
              href: "/admin/simulations/status?simulationId=sim-1",
            },
            {
              taskId: "task-4",
              title: "주거 정책 투표",
              stateLabel: "확인 필요",
              href: "/admin/simulations/status?simulationId=sim-2",
            },
          ],
        },
        canManageSimulation: false,
        canReadRag: true,
        chatRequestSummary: {
          status: "ready",
          count: 0,
          hasMore: false,
          items: [],
          labels: new Map(),
        },
        dueSoonTaskSummary: { status: "ready", count: 1, hasMore: false },
        dueSoonTasks: [{ taskId: "task-2", title: "복지 투표", closesAt: "2026-08-31T10:00:00Z" }],
        upcomingTasks: [
          { taskId: "task-3", title: "예약된 교통 투표", opensAt: "2026-08-31T09:00:00Z" },
        ],
        ragJobSummary: {
          status: "ready",
          failed: 1,
          active: 3,
          counts: { FAILED: 1 },
          recentFailures: [
            {
              jobId: "job-failed",
              documentId: "document-failed",
              filename: "확인문서.pdf",
              failureCode: "DOCUMENT_READ_FAILED",
            },
          ],
        },
        simulationWalletSummary: { status: "forbidden" },
      }),
    );

    // 강조 색의 옛 실패 섹션 대신 차분한 목록으로 안내한다.
    expect(html).not.toContain("확인이 필요한 문서");
    expect(html).not.toContain("civic-rag-failure-summary");
    expect(html).toContain("처리 실패 문서");
    expect(html).toContain("확인문서.pdf");
    expect(html).toContain("마감 임박 투표");
    expect(html).toContain("복지 투표");
    expect(html).toContain("시작 예정 투표");
    expect(html).toContain("예약된 교통 투표");
    expect(html).toContain("확인 필요 시뮬레이션");
    expect(html).toContain('확인 필요 시뮬레이션<span class="civic-home-section-count">2건</span>');
    expect(html).toContain(
      '<a class="civic-home-section-action civic-home-section-action--dark" href="/admin/simulations">전체 보기</a>',
    );
    expect(html).toContain("교통 정책 투표");
    expect(html).toContain("주거 정책 투표");
    expect(html).not.toContain("최근 권한 변경");
  });

  it("관리 홈의 올해 날짜는 연도를 생략하고 과거 날짜는 연도를 표시한다", () => {
    const now = new Date("2026-08-31T00:00:00Z");

    expect(formatAdminHomeDate("2026-08-29T12:38:00Z", now)).toBe("8. 29. 오후 9:38");
    expect(formatAdminHomeDate("2025-08-29T12:38:00Z", now)).toBe("25. 8. 29. 오후 9:38");
  });

  it("A-USER 상세·편집은 최신 tab과 단일 권한 편집 구조를 공유한다", () => {
    const renderAdmin = (id: string) => {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      return renderToStaticMarkup(createElement(AdminFunctionalScreen, { screen }));
    };

    const detail = renderAdmin("A-USER-002");
    expect(detail).toContain('data-wireflow-layout="admin-user-console"');
    expect(detail).toContain('aria-label="사용자 상세 탭"');
    expect(detail).toContain(">개요</button>");
    expect(detail).not.toContain(">활동</button>");
    expect(detail).not.toContain("활동 요약");

    const roles = renderAdmin("A-USER-003");
    expect(roles).toContain('data-wireflow-layout="admin-user-console"');
    expect(roles).toContain("대상 계정");
    expect(roles).toContain("현재 역할");
    expect(roles).not.toContain("wf-admin-overlay");
    expect(roles).not.toContain("권한을 회수하시겠습니까?");

    const legacyRevokeRoute = renderAdmin("A-USER-004");
    expect(legacyRevokeRoute).toContain('data-wireflow-screen="A-USER-004"');
    expect(legacyRevokeRoute).toContain('data-wireflow-layout="admin-user-console"');
    expect(legacyRevokeRoute).toContain("사용자·권한");
    expect(legacyRevokeRoute).not.toContain('role="alertdialog"');
  });
});
