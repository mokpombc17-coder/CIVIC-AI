import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MainFunctionalScreen } from "@/components/screens/main-functional-screen";
import { groupSurveyQuestions, loadVoteSurvey } from "@/components/account/vote-survey-surface";
import {
  AuditList,
  createLatestAdminUserRequestGate,
  createMutationLock,
  auditSubjectHref,
  adminRoleMutationPath,
  ADMIN_PERMISSION_CODES,
  AdminHome,
  AdminPendingChatRequests,
  filterAdminUsers,
  hasAdminAccessRevocation,
  loadRequestedAdminUser,
  loadRoleConflictUser,
  loadChatRequestSummary,
  loadRagJobSummary,
  loadSimulationWalletSummary,
  loadTaskDeadlineSummary,
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
import {
  loadAccountProfile,
  normalizeTwoFactorCode,
  passwordConfirmationMatches,
  redirectAfterPasswordChange,
} from "@/components/screens/account-functional-screen";
import {
  ApiRequestError,
  authStepAfterPopState,
  authCompletionDestination,
  authenticatedDestination,
  authenticatedPostLoginDestination,
  duplicateEmailAccountState,
  isDeactivatedAccountError,
  isPasswordResetEmail,
  LoginDeactivatedNotice,
  passwordResetCodeFromSearch,
  safeReturnTarget,
  SignupDuplicateEmailNotice,
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
    expect(auditSubjectHref("user B/2")).toBe("/admin/users?userId=user%20B%2F2&tab=account");
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

  it("2FA 인증 코드는 공백을 제거한 6자리 숫자만 허용한다", () => {
    expect(normalizeTwoFactorCode("")).toBeNull();
    expect(normalizeTwoFactorCode("   ")).toBeNull();
    expect(normalizeTwoFactorCode("12345")).toBeNull();
    expect(normalizeTwoFactorCode("1234567")).toBeNull();
    expect(normalizeTwoFactorCode("12345a")).toBeNull();
    expect(normalizeTwoFactorCode(" 123456 ")).toBe("123456");
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

    const pwaRequest = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(requestLogout(pwaRequest as typeof fetch, storage, true)).resolves.toBe(true);
    expect(pwaRequest).toHaveBeenCalledWith("/api/v1/auth/pwa/logout", {
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

  it("계정 화면에서는 불필요한 회원정보 설정을 편집하지 않는다", () => {
    const account = mainScreens.find((screen) => screen.id === "U-ACCOUNT-001");
    if (!account) throw new Error("account screen missing");

    const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: account }));

    expect(html).not.toContain("회원정보 수정");
    expect(html).not.toContain("선호 언어");
    expect(html).not.toContain("AI 답변 상세도");
    expect(html).not.toContain('name="preferred_language"');
    expect(html).not.toContain('name="rag_answer_detail"');
  });

  it("프로필 조회가 끝나기 전에는 2FA 상태를 추정해 변경할 수 없다", () => {
    const account = mainScreens.find((screen) => screen.id === "U-ACCOUNT-001");
    if (!account) throw new Error("account screen missing");

    const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen: account }));

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>인증 설정하기<\/button>/u);
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
    expect(html).toContain('aria-label="sample 정책.pdf 업로드 화면에서 재시도"');
    expect(html).toContain('aria-label="civic-encrypted.pdf 업로드 화면에서 재시도"');
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

  it("관리 홈은 승인 대기·과업 마감·시뮬레이션 사용 잔액을 실제 응답에서 계산한다", async () => {
    const now = Date.parse("2026-08-26T00:00:00Z");
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
    await expect(loadTaskDeadlineSummary(tasks as typeof fetch, now)).resolves.toEqual({
      status: "ready",
      count: 1,
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

  it("관리 홈은 서버의 접수순 계약에 맞춰 먼저 접수된 승인 대기 5건임을 안내한다", () => {
    const items = Array.from({ length: 5 }, (_, index) =>
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

    expect(html).toContain("먼저 접수된 5건을 표시했습니다.");
    expect(html).not.toContain("최신 5건");
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

  it("로그인한 참여자의 Vote 설문이 필수 미제출이면 설문 화면을 우선한다", async () => {
    const requiredSurvey = vi.fn<typeof fetch>(async () =>
      Response.json({
        submitted: false,
        eligibility: { surveyRequirement: "REQUIRED" },
      }),
    );
    const completedSurvey = vi.fn<typeof fetch>(async () =>
      Response.json({
        submitted: true,
        eligibility: { surveyRequirement: "SATISFIED" },
      }),
    );

    await expect(
      authenticatedPostLoginDestination(
        { role: "PARTICIPANT", must_change_password: false },
        "/rag",
        requiredSurvey,
      ),
    ).resolves.toBe("/mypage/survey");
    await expect(
      authenticatedPostLoginDestination(
        { role: "PARTICIPANT", must_change_password: false },
        null,
        completedSurvey,
      ),
    ).resolves.toBe("/home");
    await expect(
      authenticatedPostLoginDestination(
        { role: "PARTICIPANT", must_change_password: false },
        "/rag",
        completedSurvey,
      ),
    ).resolves.toBe("/rag");
    expect(requiredSurvey).toHaveBeenCalledWith(
      "/api/v1/me/surveys/current",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it("Vote 조회 장애는 로그인 완료를 막지 않고 기본 역할 홈으로 폴백한다", async () => {
    const unavailableVote = vi.fn<typeof fetch>(async () =>
      Response.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 }),
    );
    await expect(
      authenticatedPostLoginDestination(
        { role: "PARTICIPANT", must_change_password: false },
        null,
        unavailableVote,
      ),
    ).resolves.toBe("/home");
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

  it("제출한 설문은 응답 상세를 다시 조회하지 않는다", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ submitted: true }));

    await expect(loadVoteSurvey(request)).resolves.toMatchObject({ submitted: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "/api/v1/me/surveys/current",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
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

  it("Vote 조회가 응답하지 않아도 제한시간 후 로그인 기본 홈으로 이동한다", async () => {
    const hangingVote = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    await expect(
      authenticatedPostLoginDestination(
        { role: "PARTICIPANT", must_change_password: false },
        null,
        hangingVote,
        1,
      ),
    ).resolves.toBe("/home");
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

  it("가입 인증과 비밀번호 재설정·재활성화 완료 뒤 로그인 화면으로 이동한다", () => {
    expect(authCompletionDestination("AUTH-005", "SIGNUP")).toBe("/login");
    expect(authCompletionDestination("AUTH-008", "SIGNUP")).toBe("/login");
    expect(authCompletionDestination("AUTH-010", "SIGNUP")).toBe("/login");
    expect(authCompletionDestination("AUTH-005", "TWO_FACTOR")).toBeNull();
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

  it("이메일 중복 안내는 활성 계정을 로그인으로, 비활성 계정을 재활성화로 보낸다", () => {
    const activeHtml = renderToStaticMarkup(
      createElement(SignupDuplicateEmailNotice, { accountState: "ACTIVE" }),
    );
    expect(activeHtml).toContain("이미 가입된 이메일");
    expect(activeHtml).toContain('class="civic-form-alert civic-signup-duplicate"');
    expect(activeHtml).toContain('href="/login"');
    expect(activeHtml).toContain("로그인으로 이동");
    expect(activeHtml).not.toContain("계정 재활성화");

    const dormantHtml = renderToStaticMarkup(
      createElement(SignupDuplicateEmailNotice, { accountState: "INACTIVE" }),
    );
    expect(dormantHtml).toContain("이미 가입된 이메일");
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

  it("현재 화면의 대표 행동 문구를 사용한다", () => {
    expect(mainScreenPrimaryActions).toEqual({
      "AUTH-001": "로그인",
      "AUTH-002": "다음으로",
      "AUTH-003": "다음으로",
      "AUTH-004": "가입하기",
      "AUTH-005": "인증하기",
      "AUTH-006": "가입 이메일 인증",
      "AUTH-007": "인증하기",
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
      "A-USER-002": "관리자·권한 편집",
      "A-USER-003": "권한 변경 저장",
      "A-USER-004": "권한 변경 저장",
      "A-USER-005": "대상 사용자 보기",
      "COMMON-001": "관리 업무 선택",
      "COMMON-002": "최신 상태 보기",
      "COMMON-003": "처리 결과 재조회",
      "COMMON-004": "다시 시도",
    });
  });

  it.each(mainScreens)("$id 제품 제목·대표 행동을 렌더링한다", (screen) => {
    const html = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen, adminCurrentUser: fullAdminSession }),
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
    expect(signupHtml).toContain("1/3");
    expect(signupHtml.match(/autocomplete="new-password"/gi)).toHaveLength(2);
    expect(signupHtml).not.toMatch(/autocomplete="current-password"/i);
    expect(loginHtml).toContain("회원가입");
    expect(loginHtml).toContain("비밀번호 재설정");
  });

  it("AUTH-001은 기준 GUI의 로그인 카드와 비밀번호 복구·가입 버튼 배치를 유지한다", () => {
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
    expect(loginHtml).not.toContain("계정 재활성화");
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

  it("인증 코드와 비밀번호 재설정은 최신 카드·안내 구조를 공유한다", () => {
    for (const id of ["AUTH-005", "AUTH-006", "AUTH-007", "AUTH-008"]) {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      const html = renderToStaticMarkup(createElement(MainFunctionalScreen, { screen }));
      expect(html).toContain('class="wf-auth-form" method="post"');
      expect(html).toContain('class="wf-auth-info"');
      if (id === "AUTH-007") {
        expect(html).toContain("인증 코드 입력");
        expect(html).toContain('name="code"');
        expect(html).not.toContain('name="email"');
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
    expect(conflict).toContain("과업 목록으로");

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

  it("가입 단계는 Vote 설문을 계정 설정으로 오인하지 않고 두 필수 동의만 설명한다", () => {
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
    expect(html).toContain('class="wf-card wf-home-welcome"');
    expect(html).toContain("의견을 가다듬고, 나누고, 담아내는 곳");
    expect(html).toContain(
      "자료 속 근거를 찾아보고, 다른 참여자와 이야기하며, 내 의견을 남겨보세요.",
    );
    expect(html).toContain("어떤 점부터 짚어볼까요?");
    expect(html).toContain("AI가 주제 자료에서 관련 내용을 찾아 답변해 드려요.");
    expect(html).toContain("질문하기");
    expect(html).toContain("서로 오가는 이야기");
    expect(html).toContain("관심 있는 주제를 골라 자유롭게 참여해 보세요.");
    expect(html).toContain("토론하기");
    expect(html).toContain("논의에 보태는 내 의견");
    expect(html).toContain("이유까지 담아 생각을 표현해 보세요.\nAI가 이유 작성을 도와드려요.");
    expect(html).toContain("투표하기");
    expect(html).not.toMatch(/[▣◇▤›]/);
    expect(html).not.toContain("오픈 예정");
  });

  it("계정 화면은 보안·비활성화·로그아웃을 한 화면에 제공하고 설문 보기를 노출하지 않는다", () => {
    const renderAccount = (id: string) => {
      const screen = mainScreens.find((item) => item.id === id);
      if (!screen) throw new Error(`${id} missing`);
      return renderToStaticMarkup(
        createElement(MainFunctionalScreen, { screen, adminCurrentUser: fullAdminSession }),
      );
    };

    const hub = renderAccount("U-ACCOUNT-001");
    expect(hub).toContain('data-wireflow-layout="account-hub"');
    expect(hub).toContain('data-wireflow-layout="account-management"');
    expect(hub).toContain("비밀번호 변경");
    expect(hub).toContain("2단계 인증");
    expect(hub).toContain("계정 관리");
    expect(hub).toContain("계정 비활성화");
    expect(hub).not.toContain("내 정보 관리");
    expect(hub).not.toContain("내 설문 보기");
    expect(hub).toContain("로그아웃");

    const management = renderAccount("U-ACCOUNT-002");
    expect(management).toContain('data-wireflow-layout="account-management"');
    expect(management).not.toContain("회원정보 수정");
    expect(management).not.toContain("선호 언어");
    expect(management).not.toContain("AI 답변 상세도");
    expect(management).toContain("비밀번호 변경");
    expect(management).toContain("2단계 인증");
    expect(management).not.toContain("서비스 이용 동의");
    expect(management).toContain("계정 관리");
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
    expect(list).toContain("이메일 검색");
    expect(list).not.toContain("이메일 또는 채팅 이름 검색");
    expect(list).not.toContain("wf-admin-workbench-link");

    const roles = renderAdmin("A-USER-003");
    expect(roles).toContain('name="reason"');
    expect(roles).toContain('aria-label="변경 사유 (필수)"');
    expect(roles).toContain('class="civic-role-reason"');
    expect(roles.match(/name="roles"/g)).toHaveLength(3);
    expect(roles.match(/type="radio"/g)).toHaveLength(3);
    for (const permission of ["문서 관리", "채팅 관리", "과업·투표 관리", "시뮬레이션 실행·관리"]) {
      expect(roles).toContain(permission);
    }
    expect(roles).not.toContain("RAG 관리");
    expect(roles).not.toContain("권한 회수 영향 확인");
    expect(roles.match(/disabled=""/g)).toHaveLength(9);

    const audit = renderAdmin("A-USER-005");
    for (const heading of ["실행자", "대상", "변경 전", "변경 후", "사유", "변경 시각", "작업"]) {
      expect(audit).toContain(`<th>${heading}</th>`);
    }
  });

  it("A-HOME-001은 메뉴를 반복하지 않고 4개 운영 지표로 구성한다", () => {
    const home = mainScreens.find((screen) => screen.id === "A-HOME-001");
    if (!home) throw new Error("A-HOME-001 missing");

    const html = renderToStaticMarkup(
      createElement(MainFunctionalScreen, { screen: home, adminCurrentUser: fullAdminSession }),
    );

    expect(html).toContain('data-wireflow-layout="admin-home"');
    expect(html.match(/class="wf-admin-metric"/g)).toHaveLength(4);
    expect(html).toContain("승인 대기");
    expect(html).toContain("채팅 생성 신청 확인 중");
    expect(html).toContain('aria-labelledby="civic-pending-chat-requests-title"');
    expect(html).toContain("채팅방 승인 대기");
    expect(html).toContain("승인 대기 목록을 확인하고 있습니다.");
    expect(html).toContain("처리 실패");
    expect(html).toContain("확인 중");
    expect(html).toContain("24시간 내 마감");
    expect(html).toContain("시뮬레이션 사용 잔액");
    expect(html).toContain("공용 지갑 잔액 확인 중");
    expect(html).toContain("현재 처리 중");
    expect(html).toContain("처리 현황을 확인하고 있습니다.");
    expect(html).not.toContain('class="wf-card wf-action-card"');
    expect(html).not.toContain("사용자 관리 열기");
    expect(html).not.toContain("문서 관리 열기");
    expect(html).not.toContain("채팅 신청 열기");
    expect(html).not.toContain("과업 관리 열기");
    expect(html).not.toContain("시뮬레이션 열기");
    expect(html).not.toContain("RAG 자료");
    expect(html).not.toContain("오픈 예정");
  });

  it("관리자 홈은 확인이 필요한 문서를 관리 현황 다음 두 번째 영역에 배치한다", () => {
    const html = renderToStaticMarkup(
      createElement(AdminHome, {
        canManageSimulation: false,
        canReadRag: true,
        chatRequestSummary: {
          status: "ready",
          count: 0,
          hasMore: false,
          items: [],
          labels: new Map(),
        },
        ragJobSummary: {
          status: "ready",
          failed: 1,
          active: 0,
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
        taskDeadlineSummary: { status: "forbidden" },
      }),
    );

    expect(html.indexOf("관리 현황")).toBeLessThan(html.indexOf("확인이 필요한 문서"));
    expect(html.indexOf("확인이 필요한 문서")).toBeLessThan(html.indexOf("채팅방 승인 대기"));
    expect(html.indexOf("채팅방 승인 대기")).toBeLessThan(html.indexOf("현재 처리 중"));
  });

  it("A-USER 상세·편집은 최신 tab과 단일 권한 편집 구조를 공유한다", () => {
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
    expect(roles).not.toContain("wf-admin-overlay");
    expect(roles).not.toContain("권한을 회수하시겠습니까?");

    const legacyRevokeRoute = renderAdmin("A-USER-004");
    expect(legacyRevokeRoute).toContain('data-wireflow-screen="A-USER-004"');
    expect(legacyRevokeRoute).toContain('data-wireflow-layout="admin-role-editor"');
    expect(legacyRevokeRoute).toContain("관리자 전환·권한 편집");
    expect(legacyRevokeRoute).not.toContain('role="alertdialog"');
  });
});
