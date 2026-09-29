"use client";

import { sendAuthMessage } from "@/lib/auth/auth-session-events";
import { clearAuthSessionData } from "@/components/auth/auth-session-data";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Route } from "next";
import Link from "next/link";
import { storeAnalyticsUserId } from "@/lib/analytics/user-id";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { AuthFormCard, AuthInfo } from "@/components/wireflow/auth-layouts";
import { WireflowButton } from "@/components/wireflow/wireflow-primitives";
import { mainScreenPrimaryActions } from "./main-screen-actions";
import { ScreenFrame } from "./screen-frame";

type SignupDraft = {
  email: string;
  password: string;
  passwordConfirmation: string;
  ageConfirmed: boolean;
  terms: boolean;
  termsCheckedAt: string | null;
  privacy: boolean;
  privacyCheckedAt: string | null;
  acceptanceControls: SignupDocumentId[];
  flowId?: string;
  documents: Partial<Record<SignupDocumentId, SignupDocument>>;
};

type SignupDocumentId = "TERMS" | "ACCOUNT_RAG_PRIVACY";
type SignupDocument = Readonly<{
  document_id: SignupDocumentId;
  document_version: string;
  body_sha256: string;
  path: string;
}>;

const initialDraft: SignupDraft = {
  email: "",
  password: "",
  passwordConfirmation: "",
  ageConfirmed: false,
  terms: false,
  termsCheckedAt: null,
  privacy: false,
  privacyCheckedAt: null,
  acceptanceControls: ["TERMS", "ACCOUNT_RAG_PRIVACY"],
  documents: {},
};

const signupHistorySteps = new Set(["AUTH-002", "AUTH-004", "AUTH-005", "AUTH-006"]);
const defaultSignupPreferences = Object.freeze({
  preferred_language: "ko",
  rag_answer_detail: "balanced",
});
const passwordResetEmailKey = "civic:password-reset:email";
const passwordResetCodeKey = "civic:password-reset:code";
const signupPasswordPattern =
  /^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=])[A-Za-z0-9!@#$%^&*()_+\-=]{8,1024}$/u;
const signupPasswordPolicyMessage =
  "비밀번호는 8~1024자의 영문·숫자·특수문자(!@#$%^&*()_+-=) 조합으로 입력해 주세요.";

export function signupStepFromHistory(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("civicSignupStep" in value)) return null;
  const step = value.civicSignupStep;
  return typeof step === "string" && signupHistorySteps.has(step) ? step : null;
}

export function authStepAfterPopState(value: unknown, entryScreenId: string): string {
  return signupStepFromHistory(value) ?? entryScreenId;
}

export function signupStepForScreen(screenId: string): 1 | 2 | 3 | null {
  if (screenId === "AUTH-002") return 1;
  if (screenId === "AUTH-005" || screenId === "AUTH-006") return 2;
  if (screenId === "AUTH-004") return 3;
  return null;
}

export function AuthFunctionalScreen({
  screen,
  initialSearch = "",
  devQuickLoginEnabled = false,
  onActiveScreenChange,
}: Readonly<{
  screen: ScreenDefinition;
  initialSearch?: string;
  devQuickLoginEnabled?: boolean;
  onActiveScreenChange?: (screenId: string) => void;
}>) {
  const entryRecovery = signupRecovery(screen.id, false);
  const recoveryPathname = entryRecovery?.pathname;
  const [activeId, setActiveId] = useState(screen.id);
  const [verificationKind, setVerificationKind] = useState<"SIGNUP" | "TWO_FACTOR">(() =>
    verificationKindFromSearch(initialSearch),
  );
  const [draft, setDraft] = useState<SignupDraft>(initialDraft);
  const resetEmail = useSyncExternalStore(
    subscribePasswordResetSession,
    readPasswordResetEmail,
    emptyPasswordResetValue,
  );
  const storedResetCode = useSyncExternalStore(
    subscribePasswordResetSession,
    readPasswordResetCode,
    emptyPasswordResetValue,
  );
  const [editedResetCode, setEditedResetCode] = useState<string | null>(null);
  const resetCode =
    editedResetCode ?? passwordResetCodeFromSearch(initialSearch) ?? storedResetCode;
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "info">("info");
  const [duplicateEmailState, setDuplicateEmailState] = useState<DuplicateEmailAccountState | null>(
    null,
  );
  const [loginDeactivated, setLoginDeactivated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [postLoginReturnTo, setPostLoginReturnTo] = useState<string | null>(() =>
    safeReturnTarget(initialSearch),
  );
  const authGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (recoveryPathname) location.replace(recoveryPathname);
  }, [recoveryPathname]);

  useEffect(() => {
    if (signupHistorySteps.has(screen.id)) {
      history.replaceState({ ...history.state, civicSignupStep: screen.id }, "");
    }
    const restoreStep = (event: PopStateEvent) => {
      const nextId = authStepAfterPopState(event.state, screen.id);
      setActiveId(nextId);
      onActiveScreenChange?.(nextId);
    };
    addEventListener("popstate", restoreStep);
    return () => removeEventListener("popstate", restoreStep);
  }, [onActiveScreenChange, screen.id]);

  useEffect(() => {
    resetAuthScrollTop(authGridRef.current);
  }, [activeId]);

  async function completeLogin(response: Response) {
    const returnTo = safeReturnTarget(location.search);
    setPostLoginReturnTo(returnTo);
    if (response.status === 202) {
      setVerificationKind("TWO_FACTOR");
      changeSignupStep(
        "AUTH-005",
        returnTo
          ? `/signup/verify?kind=two-factor&returnTo=${encodeURIComponent(returnTo)}`
          : "/signup/verify?kind=two-factor",
      );
      return;
    }
    clearAuthSessionData();
    sendAuthMessage("LOGIN");
    await redirectToRoleHome(returnTo);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setMessageKind("info");
    setDuplicateEmailState(null);
    setLoginDeactivated(false);
    try {
      if (activeId === "AUTH-001") {
        const data = new FormData(event.currentTarget);
        const response = await api("/api/v1/auth/login", {
          email: data.get("email"),
          password: data.get("password"),
        });
        await completeLogin(response);
      } else if (activeId === "AUTH-002") {
        const passwordProblem = signupPasswordProblem(draft.password, draft.passwordConfirmation);
        if (passwordProblem) throw new Error(passwordProblem);
        if (!draft.ageConfirmed) throw new Error("만 14세 이상 여부를 확인해 주세요.");
        const response = await api("/api/v1/signup/flows", { email: draft.email });
        const body = (await response.json()) as {
          flow_id?: unknown;
          documents?: unknown;
          acceptance_controls?: unknown;
        };
        if (typeof body.flow_id !== "string") {
          throw new Error("가입 흐름 응답이 올바르지 않습니다.");
        }
        const documents = readSignupDocuments(body.documents);
        const acceptanceControls = readSignupAcceptanceControls(body.acceptance_controls);
        const flowId = body.flow_id;
        setDraft((current) => ({ ...current, flowId, documents, acceptanceControls }));
        changeSignupStep("AUTH-005", "/signup/verify");
      } else if (activeId === "AUTH-003") {
        location.replace("/signup/account");
      } else if (activeId === "AUTH-004") {
        const privacyRequired = draft.acceptanceControls.includes("ACCOUNT_RAG_PRIVACY");
        if (
          !draft.flowId ||
          !draft.terms ||
          !draft.termsCheckedAt ||
          (privacyRequired && (!draft.privacy || !draft.privacyCheckedAt))
        ) {
          throw new Error("이메일 인증과 필수 동의를 모두 확인해 주세요.");
        }
        await api(signupCompletionPath(draft.flowId), {
          email: draft.email,
          password: draft.password,
          ...defaultSignupPreferences,
          age_14_confirmed: true,
          terms_evidence: evidence(
            requiredDocument(draft.documents, "TERMS"),
            draft.termsCheckedAt,
          ),
          ...(privacyRequired
            ? {
                privacy_evidence: evidence(
                  requiredDocument(draft.documents, "ACCOUNT_RAG_PRIVACY"),
                  draft.privacyCheckedAt!,
                ),
              }
            : {}),
        });
        location.assign("/login");
      } else if (activeId === "AUTH-005") {
        const data = new FormData(event.currentTarget);
        await api(
          verificationKind === "TWO_FACTOR"
            ? "/api/v1/auth/2fa/verify"
            : "/api/v1/signup/verification/verify",
          { code: data.get("code") },
        );
        if (verificationKind === "TWO_FACTOR") {
          clearAuthSessionData();
          sendAuthMessage("LOGIN");
          await redirectToRoleHome(postLoginReturnTo ?? safeReturnTarget(location.search));
        } else {
          changeSignupStep("AUTH-004", "/signup/consent");
        }
      } else if (activeId === "AUTH-006") {
        changeSignupStep("AUTH-005", "/signup/verify");
      } else if (activeId === "AUTH-007") {
        const data = new FormData(event.currentTarget);
        const code = normalizePasswordResetCode(data.get("code"));
        if (!/^\d{6}$/u.test(code)) throw new Error("6자리 인증 코드를 입력해 주세요.");
        sessionStorage.setItem(passwordResetCodeKey, code);
        location.assign("/password-reset/complete");
      } else if (activeId === "AUTH-009") {
        const data = new FormData(event.currentTarget);
        await api("/api/v1/auth/reactivation/request", {
          email: data.get("email"),
          password: data.get("password"),
        });
        location.assign("/reactivate/complete");
      } else if (activeId === "AUTH-008") {
        const data = new FormData(event.currentTarget);
        if (data.get("new_password") !== data.get("new_password_confirmation")) {
          throw new Error("새 비밀번호 확인이 일치하지 않습니다.");
        }
        await api("/api/v1/auth/password-reset/complete", {
          code: normalizePasswordResetCode(data.get("code")),
          new_password: data.get("new_password"),
        });
        clearAuthSessionData();
        sendAuthMessage("LOGOUT");
        sessionStorage.removeItem(passwordResetEmailKey);
        sessionStorage.removeItem(passwordResetCodeKey);
        location.assign(authCompletionDestination(activeId) ?? "/login");
      } else if (activeId === "AUTH-010") {
        const data = new FormData(event.currentTarget);
        await api("/api/v1/auth/reactivation/complete", { code: data.get("code") });
        location.assign(authCompletionDestination(activeId) ?? "/login");
      }
    } catch (error) {
      const duplicateState = activeId === "AUTH-002" ? duplicateEmailAccountState(error) : null;
      if (duplicateState) {
        setDuplicateEmailState(duplicateState);
      } else if (activeId === "AUTH-001" && isDeactivatedAccountError(error)) {
        setLoginDeactivated(true);
      } else {
        setMessageKind("error");
        setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function quickLogin(account: "USER" | "ADMIN") {
    setBusy(true);
    setMessage("");
    setMessageKind("info");
    try {
      const response = await api("/api/dev/auth/login", { account });
      await completeLogin(response);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "테스트 계정으로 로그인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    setMessage("");
    try {
      await api(
        verificationKind === "TWO_FACTOR"
          ? "/api/v1/auth/2fa/resend"
          : "/api/v1/signup/verification/resend",
        {},
      );
      setMessageKind("info");
      setMessage("최신 인증 코드를 다시 보냈습니다.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "인증 코드를 다시 보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset() {
    const email = draft.email.trim();
    if (!isPasswordResetEmail(email)) {
      setMessageKind("error");
      setMessage("로그인에 사용한 이메일을 먼저 입력해 주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api("/api/v1/auth/password-reset/request", { email });
      sessionStorage.setItem(passwordResetEmailKey, email);
      sessionStorage.removeItem(passwordResetCodeKey);
      location.assign("/password-reset");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "재설정 이메일을 보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function resendPasswordReset() {
    if (!isPasswordResetEmail(resetEmail)) {
      setMessageKind("error");
      setMessage("로그인 화면에서 재설정 이메일을 다시 요청해 주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api("/api/v1/auth/password-reset/request", { email: resetEmail });
      setMessageKind("info");
      setMessage("재설정 이메일을 다시 보냈습니다.");
    } catch (error) {
      setMessageKind("error");
      setMessage(
        error instanceof Error ? error.message : "재설정 이메일을 다시 보내지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  function changeSignupStep(id: string, pathname: string) {
    history.pushState({ ...history.state, civicSignupStep: id }, "", pathname);
    setActiveId(id);
    onActiveScreenChange?.(id);
  }

  const action = mainScreenPrimaryActions[activeId] ?? mainScreenPrimaryActions[screen.id];
  return (
    <ScreenFrame
      {...(activeId === "AUTH-005" && verificationKind === "TWO_FACTOR"
        ? { backHref: "/login" as Route }
        : {})}
      platformHeading="HIDDEN"
      screen={{ ...screen, id: activeId, canonical_title: authTitle(activeId) }}
      signupStep={verificationKind === "SIGNUP" ? signupStepForScreen(activeId) : null}
    >
      <div
        className="civic-auth-grid"
        data-wireflow-layout={activeId === "AUTH-001" ? "auth-login" : "auth-flow"}
        ref={authGridRef}
      >
        {activeId === "AUTH-009" || activeId === "AUTH-010" ? <ReactivationNotes /> : null}
        <AuthFormCard
          key={activeId}
          onSubmit={submit}
          subtitle={authCardSubtitle(activeId, activeId === "AUTH-007" ? resetEmail : draft.email)}
          title={authCardTitle(activeId)}
        >
          {renderFields(activeId, draft, setDraft, resetCode, setEditedResetCode, () =>
            setDuplicateEmailState(null),
          )}
          {activeId === "AUTH-002" && duplicateEmailState ? (
            <SignupDuplicateEmailNotice accountState={duplicateEmailState} />
          ) : null}
          {activeId === "AUTH-001" && loginDeactivated ? <LoginDeactivatedNotice /> : null}
          {message ? (
            messageKind === "error" ? (
              <div aria-live="polite" className="civic-form-alert" role="status">
                <strong>입력 내용을 확인해 주세요</strong>
                <p>{message}</p>
              </div>
            ) : (
              <p aria-live="polite" className="civic-form-message" role="status">
                {message}
              </p>
            )
          ) : null}
          {activeId === "AUTH-004" ? (
            <WireflowButton
              disabled={busy}
              onClick={() => history.back()}
              type="button"
              variant="secondary"
            >
              이전으로
            </WireflowButton>
          ) : null}
          <WireflowButton
            className={activeId === "AUTH-001" ? "civic-auth-submit" : undefined}
            disabled={busy || (activeId === "AUTH-004" && !draft.terms)}
            type="submit"
          >
            {busy ? "처리 중…" : action}
          </WireflowButton>
          {activeId === "AUTH-001" && devQuickLoginEnabled ? (
            <DevQuickLoginActions busy={busy} onLogin={quickLogin} />
          ) : null}
        </AuthFormCard>
        <AuthSupport
          activeId={activeId}
          busy={busy}
          onPasswordReset={requestPasswordReset}
          onPasswordResetResend={resendPasswordReset}
          onResend={resendVerification}
        />
      </div>
    </ScreenFrame>
  );
}

function DevQuickLoginActions({
  busy,
  onLogin,
}: Readonly<{
  busy: boolean;
  onLogin: (account: "USER" | "ADMIN") => void;
}>) {
  return (
    <section aria-label="개발 테스트 로그인" className="civic-dev-quick-login">
      <p>개발 테스트 로그인</p>
      <div className="civic-dev-quick-login-actions">
        <WireflowButton
          disabled={busy}
          onClick={() => onLogin("USER")}
          type="button"
          variant="secondary"
        >
          일반 사용자 테스트 로그인
        </WireflowButton>
        <WireflowButton
          disabled={busy}
          onClick={() => onLogin("ADMIN")}
          type="button"
          variant="secondary"
        >
          관리자 테스트 로그인
        </WireflowButton>
      </div>
    </section>
  );
}

function renderFields(
  id: string,
  draft: SignupDraft,
  setDraft: React.Dispatch<React.SetStateAction<SignupDraft>>,
  resetCode: string,
  setResetCode: (value: string) => void,
  onEmailEdit?: () => void,
) {
  if (id === "AUTH-001") {
    return (
      <>
        <Field
          autoComplete="username"
          enterKeyHint="next"
          label="이메일"
          name="email"
          placeholder="name@example.com"
          type="email"
          value={draft.email}
          onChange={(value) => setDraft((current) => ({ ...current, email: value }))}
        />
        <Field
          autoComplete="current-password"
          enterKeyHint="go"
          label="비밀번호"
          name="password"
          placeholder="비밀번호 입력…"
          type="password"
        />
      </>
    );
  }
  if (id === "AUTH-002") {
    return (
      <>
        <Field
          autoComplete="email"
          enterKeyHint="next"
          help="로그인 시 사용할 이메일 주소 입니다."
          label="이메일"
          name="email"
          placeholder="name@example.com"
          type="email"
          value={draft.email}
          onChange={(value) => {
            onEmailEdit?.();
            setDraft((v) => ({
              email: value,
              password: v.password,
              passwordConfirmation: v.passwordConfirmation,
              ageConfirmed: v.ageConfirmed,
              terms: false,
              termsCheckedAt: null,
              privacy: false,
              privacyCheckedAt: null,
              acceptanceControls: ["TERMS", "ACCOUNT_RAG_PRIVACY"],
              documents: {},
            }));
          }}
        />
        <Field
          autoComplete="new-password"
          enterKeyHint="next"
          help="8자 이상 · 영문·숫자·특수문자 포함"
          label="비밀번호"
          name="password"
          type="password"
          value={draft.password}
          onChange={(value) => setDraft((v) => ({ ...v, password: value }))}
        />
        <Field
          autoComplete="new-password"
          enterKeyHint="done"
          label="비밀번호 확인"
          name="password_confirmation"
          type="password"
          value={draft.passwordConfirmation}
          onChange={(value) => setDraft((v) => ({ ...v, passwordConfirmation: value }))}
        />
        <Check
          label="만 14세 이상입니다"
          checked={draft.ageConfirmed}
          onChange={(checked) => setDraft((v) => ({ ...v, ageConfirmed: checked }))}
        />
      </>
    );
  }
  if (id === "AUTH-004") {
    const terms = draft.documents.TERMS;
    const accountRagPrivacy = draft.documents.ACCOUNT_RAG_PRIVACY;
    const privacyRequired = draft.acceptanceControls.includes("ACCOUNT_RAG_PRIVACY");
    return (
      <fieldset className="civic-consent-fieldset">
        <legend className="sr-only">이용약관 및 개인정보 수집·이용 필수 동의</legend>
        <div className="civic-consent-item">
          <Check
            label="이용약관에 동의합니다"
            required
            checked={draft.terms}
            onChange={(checked) =>
              setDraft((v) => ({
                ...v,
                terms: checked,
                termsCheckedAt: checked ? new Date().toISOString() : null,
              }))
            }
          />
          <LegalDocumentLink
            document={terms}
            hint="전문을 확인한 뒤 동의해 주세요."
            label="서비스 이용약관"
          />
        </div>
        <div className="civic-consent-item">
          {privacyRequired ? (
            <Check
              label="개인정보 수집·이용에 동의합니다"
              required
              checked={draft.privacy}
              onChange={(checked) =>
                setDraft((v) => ({
                  ...v,
                  privacy: checked,
                  privacyCheckedAt: checked ? new Date().toISOString() : null,
                }))
              }
            />
          ) : (
            <p>
              <strong>개인정보 처리 안내</strong>
            </p>
          )}
          <LegalDocumentLink
            document={accountRagPrivacy}
            hint={
              privacyRequired
                ? "수집·이용 목적, 항목, 보유기간과 거부 시 영향을 확인해 주세요."
                : "별도 동의가 아닌 서비스 제공에 필요한 개인정보 처리 안내입니다."
            }
            label={privacyRequired ? "개인정보 수집·이용 동의" : "개인정보 처리 안내"}
          />
        </div>
      </fieldset>
    );
  }
  if (id === "AUTH-005" || id === "AUTH-010")
    return (
      <>
        <Field
          autoComplete="one-time-code"
          enterKeyHint="done"
          inputMode="numeric"
          label="6자리 인증 코드"
          maxLength={6}
          name="code"
          placeholder="000000"
        />
        {id === "AUTH-005" ? (
          <p aria-live="off" className="civic-field-help civic-code-countdown">
            <CodeCountdown />
          </p>
        ) : null}
      </>
    );
  if (id === "AUTH-006")
    return (
      <div className="civic-auth-pending">
        <strong>가입 이메일을 확인해 주세요.</strong>
        <p>메일이 늦게 도착하면 60초 뒤 다시 요청할 수 있습니다.</p>
        <Link href={"/signup/verify" as Route}>인증 코드 입력</Link>
      </div>
    );
  if (id === "AUTH-007")
    return (
      <Field
        autoComplete="one-time-code"
        enterKeyHint="done"
        help={<CodeCountdown />}
        inputMode="numeric"
        label="6자리 인증 코드"
        maxLength={6}
        name="code"
        placeholder="0 0 0 0 0 0"
        value={resetCode}
        onChange={setResetCode}
      />
    );
  if (id === "AUTH-009")
    return (
      <>
        <Field
          autoComplete="username"
          enterKeyHint="next"
          label="이메일"
          name="email"
          placeholder="등록 이메일 입력"
          type="email"
        />
        <Field
          autoComplete="current-password"
          enterKeyHint="go"
          label="비밀번호 확인"
          name="password"
          type="password"
        />
      </>
    );
  if (id === "AUTH-008")
    return (
      <>
        <Field
          autoComplete="one-time-code"
          enterKeyHint="next"
          help="가장 최근에 받은 코드를 입력하세요."
          inputMode="numeric"
          label="6자리 인증 코드"
          maxLength={6}
          name="code"
          placeholder="0 0 0 0 0 0"
          value={resetCode}
          onChange={setResetCode}
        />
        <Field
          autoComplete="new-password"
          enterKeyHint="next"
          help="8자 이상 · 영문·숫자·특수문자 포함"
          label="새 비밀번호"
          name="new_password"
          type="password"
        />
        <Field
          autoComplete="new-password"
          enterKeyHint="done"
          label="새 비밀번호 확인"
          name="new_password_confirmation"
          type="password"
        />
      </>
    );
  return <p>요청 정보를 확인한 뒤 계속 진행하세요.</p>;
}

function AuthSupport({
  activeId,
  busy,
  onPasswordReset,
  onPasswordResetResend,
  onResend,
}: Readonly<{
  activeId: string;
  busy: boolean;
  onPasswordReset: () => void;
  onPasswordResetResend: () => void;
  onResend: () => void;
}>) {
  if (activeId === "AUTH-005" || activeId === "AUTH-006") {
    return (
      <AuthInfo
        actionLabel="코드 재발송"
        body="아래 버튼을 누르면 다시 받을 수 있습니다. 메일함과 스팸함을 확인해 주세요."
        disabled={busy}
        onAction={onResend}
        title="코드가 오지 않았나요?"
      />
    );
  }
  if (activeId === "AUTH-007") {
    return (
      <AuthInfo
        actionLabel="코드 재발송"
        body="아래 버튼을 클릭하여 다시 받을 수 있습니다."
        disabled={busy}
        onAction={onPasswordResetResend}
        title="코드가 오지 않았나요?"
      />
    );
  }
  if (activeId === "AUTH-008") {
    return (
      <AuthInfo
        actionLabel="이메일 재발송"
        body="인증 코드가 만료되었거나 일치하지 않으면 이메일로 다시 받을 수 있습니다."
        disabled={busy}
        onAction={onPasswordResetResend}
        title="새 코드가 필요한가요?"
      />
    );
  }
  if (activeId !== "AUTH-001") return null;
  return (
    <aside aria-label="로그인 보조 행동" className="civic-auth-support civic-auth-support-compact">
      <div className="civic-auth-support-row">
        <WireflowButton
          dataWireflowSlot="auth-reset"
          disabled={busy}
          onClick={onPasswordReset}
          variant="secondary"
        >
          비밀번호 재설정
        </WireflowButton>
        <Link
          className="wf-button wf-button-secondary"
          data-wireflow-slot="auth-signup"
          href={"/signup/account" as Route}
        >
          회원가입
        </Link>
      </div>
    </aside>
  );
}

export type DuplicateEmailAccountState = "ACTIVE" | "INACTIVE";

export function SignupDuplicateEmailNotice({
  accountState,
}: Readonly<{ accountState: DuplicateEmailAccountState }>) {
  return (
    <div aria-live="polite" className="civic-form-alert civic-signup-duplicate" role="status">
      <strong>이미 가입된 이메일</strong>
      {accountState === "INACTIVE" ? (
        <>
          <p>
            대소문자를 무시한 동일 이메일이 있습니다. 비활성화된 계정이니 재활성화 후 이용해 주세요.
          </p>
          <Link
            className="civic-auth-reactivate"
            data-wireflow-slot="signup-reactivate"
            href={"/reactivate" as Route}
          >
            계정 재활성화
          </Link>
        </>
      ) : (
        <>
          <p>사용 중인 계정으로 로그인해 주세요.</p>
          <Link
            className="wf-button wf-button-secondary"
            data-wireflow-slot="signup-login"
            href={"/login" as Route}
          >
            로그인으로 이동
          </Link>
        </>
      )}
    </div>
  );
}

export function LoginDeactivatedNotice() {
  return (
    <div aria-live="polite" className="civic-form-alert civic-login-deactivated" role="status">
      <strong>비활성화된 계정</strong>
      <p>이 계정은 비활성화 상태입니다. 재활성화를 완료하면 다시 로그인할 수 있습니다.</p>
      <Link
        className="civic-auth-reactivate"
        data-wireflow-slot="login-deactivated-reactivate"
        href={"/reactivate" as Route}
      >
        계정 재활성화
      </Link>
    </div>
  );
}

function ReactivationNotes() {
  const notes = [
    { label: "복원 항목", value: "계정·응답·과거 참여 이력" },
    { label: "복원되지 않는 항목", value: "삭제된 정보·이전 로그인 상태" },
    { label: "본인 확인", value: "비밀번호·등록 이메일 인증" },
  ];
  return (
    <div aria-label="재활성화 안내" className="civic-reactivation-notes">
      {notes.map((note) => (
        <div className="civic-reactivation-note" key={note.label}>
          <span>{note.label}</span>
          <strong>{note.value}</strong>
        </div>
      ))}
    </div>
  );
}

function CodeCountdown() {
  const [remaining, setRemaining] = useState(10 * 60);
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");
  return `남은 시간 ${minutes}:${seconds}`;
}

function authTitle(id: string): string {
  return (
    {
      "AUTH-001": "로그인",
      "AUTH-002": "계정 정보",
      "AUTH-003": "계정 정보",
      "AUTH-004": "약관 동의 및 가입 확인",
      "AUTH-005": "이메일 인증",
      "AUTH-006": "이메일 인증",
      "AUTH-007": "비밀번호 재설정",
      "AUTH-008": "새 비밀번호 설정",
      "AUTH-009": "계정 재활성화",
      "AUTH-010": "계정 재활성화",
    }[id] ?? "인증"
  );
}

function authCardTitle(id: string): string {
  if (id === "AUTH-001") return "계정 정보";
  if (id === "AUTH-002") return "필수 입력";
  if (id === "AUTH-003") return "계정 정보 안내";
  if (id === "AUTH-004") return "약관 동의·필수정보 확인";
  if (id === "AUTH-005") return "인증 코드 입력";
  if (id === "AUTH-006") return "인증 대기";
  if (id === "AUTH-007") return "인증 코드 입력";
  if (id === "AUTH-008") return "인증코드 입력";
  if (id === "AUTH-009" || id === "AUTH-010") return "재활성화 본인 확인";
  return "요청 정보";
}

function authCardSubtitle(id: string, email: string): string | undefined {
  if (id !== "AUTH-005" && id !== "AUTH-007") return undefined;
  const masked = maskAuthEmail(email);
  return masked ? `${masked}으로 코드를 전송했습니다.` : "등록 이메일로 코드를 전송했습니다.";
}

export function maskAuthEmail(email: string): string | null {
  const [local, domain] = email.split("@");
  if (!local || !domain) return null;
  return `${local.slice(0, 2)}***@${domain}`;
}

function Field({
  autoComplete,
  enterKeyHint,
  label,
  name,
  type = "text",
  value,
  inputMode,
  maxLength,
  placeholder,
  help,
  onChange,
}: {
  autoComplete?: string;
  enterKeyHint?: "done" | "go" | "next";
  label: string;
  name: string;
  type?: string;
  value?: string;
  inputMode?: "numeric";
  maxLength?: number;
  placeholder?: string;
  help?: ReactNode;
  onChange?: (value: string) => void;
}) {
  const helpId = help ? `civic-auth-${name}-help` : undefined;
  return (
    <label className="civic-field">
      <span>{label}</span>
      <input
        aria-describedby={helpId}
        aria-label={label}
        autoComplete={autoComplete}
        enterKeyHint={enterKeyHint}
        inputMode={inputMode}
        maxLength={maxLength}
        name={name}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        placeholder={placeholder}
        required
        type={type}
        value={onChange ? value : undefined}
      />
      {help ? (
        <small className="civic-field-help" id={helpId}>
          {help}
        </small>
      ) : null}
    </label>
  );
}

export function resetAuthScrollTop(scroller: Pick<HTMLDivElement, "scrollTop"> | null): void {
  if (scroller) scroller.scrollTop = 0;
}

export function isPasswordResetEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

export function signupPasswordProblem(password: string, confirmation: string): string | null {
  if (!signupPasswordPattern.test(password)) return signupPasswordPolicyMessage;
  if (password !== confirmation) return "비밀번호 확인이 일치하지 않습니다.";
  return null;
}

export function passwordResetCodeFromSearch(search: string): string | null {
  const code = normalizePasswordResetCode(new URLSearchParams(search).get("code"));
  return /^\d{6}$/u.test(code) ? code : null;
}

function normalizePasswordResetCode(value: FormDataEntryValue | string | null): string {
  return typeof value === "string" ? value.replace(/\s/gu, "") : "";
}

function subscribePasswordResetSession(): () => void {
  return () => undefined;
}

function readPasswordResetEmail(): string {
  return sessionStorage.getItem(passwordResetEmailKey) ?? "";
}

function readPasswordResetCode(): string {
  return sessionStorage.getItem(passwordResetCodeKey) ?? "";
}

function emptyPasswordResetValue(): string {
  return "";
}

function Check({
  label,
  checked,
  required = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  required?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="civic-check">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>
        {label}
        {required ? <em className="civic-required-badge">필수</em> : null}
      </span>
    </label>
  );
}

export function evidence(document: SignupDocument, checkedAt: string) {
  return {
    document_id: document.document_id,
    document_version: document.document_version,
    body_sha256: document.body_sha256,
    checked_at: checkedAt,
    path: document.path,
  };
}

export function LegalDocumentLink({
  document,
  hint,
  label,
}: Readonly<{ document: SignupDocument | undefined; hint?: string; label: string }>) {
  if (!document) return <p className="civic-help">{label} 문서를 불러오지 못했습니다.</p>;
  return (
    <p className="civic-help">
      {hint ? <span>{hint} </span> : null}
      <a
        aria-label={`${label} 전문 보기`}
        href={document.path}
        rel="noopener noreferrer"
        target="_blank"
      >
        전문 보기
      </a>
    </p>
  );
}

function readSignupDocuments(value: unknown): SignupDraft["documents"] {
  if (!value || typeof value !== "object") {
    throw new Error("가입 문서를 불러오지 못했습니다.");
  }
  const result: SignupDraft["documents"] = {};
  for (const id of ["TERMS", "ACCOUNT_RAG_PRIVACY"] as const) {
    const candidate = (value as Record<string, unknown>)[id];
    if (!candidate || typeof candidate !== "object") {
      throw new Error("가입 문서를 불러오지 못했습니다.");
    }
    const document = candidate as Record<string, unknown>;
    if (
      document.document_id !== id ||
      typeof document.document_version !== "string" ||
      typeof document.body_sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(document.body_sha256) ||
      typeof document.path !== "string" ||
      !document.path.startsWith("/")
    ) {
      throw new Error("가입 문서 응답이 올바르지 않습니다.");
    }
    result[id] = document as unknown as SignupDocument;
  }
  return result;
}

export function readSignupAcceptanceControls(value: unknown): SignupDocumentId[] {
  if (value === undefined) return ["TERMS", "ACCOUNT_RAG_PRIVACY"];
  if (!Array.isArray(value) || value.some((item) => !isSignupDocumentId(item))) {
    throw new Error("가입 동의 항목 응답이 올바르지 않습니다.");
  }
  const controls = [...new Set(value)] as SignupDocumentId[];
  if (!controls.includes("TERMS")) {
    throw new Error("필수 이용약관 동의 항목을 불러오지 못했습니다.");
  }
  return controls;
}

function isSignupDocumentId(value: unknown): value is SignupDocumentId {
  return value === "TERMS" || value === "ACCOUNT_RAG_PRIVACY";
}

function requiredDocument(
  documents: SignupDraft["documents"],
  id: SignupDocumentId,
): SignupDocument {
  const document = documents[id];
  if (!document) throw new Error("가입 문서를 다시 확인해 주세요.");
  return document;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Readonly<Record<string, unknown>>,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function api(path: string, body: unknown): Promise<Response> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiRequestError(
      response.status,
      problem,
      typeof problem.detail === "string" ? problem.detail : "요청을 처리하지 못했습니다.",
    );
  }
  return response;
}

export function duplicateEmailAccountState(error: unknown): DuplicateEmailAccountState | null {
  if (!(error instanceof ApiRequestError) || error.status !== 409) return null;
  return error.problem.account_state === "INACTIVE" ? "INACTIVE" : "ACTIVE";
}

export function isDeactivatedAccountError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.problem.account_state === "INACTIVE";
}

export function safeReturnTarget(search: string): string | null {
  const candidate = new URLSearchParams(search).get("returnTo");
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return null;
  }
  try {
    const base = new URL("https://civic.invalid");
    const target = new URL(candidate, base);
    if (target.origin !== base.origin || target.pathname === "/login") return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function verificationKindFromSearch(search: string): "SIGNUP" | "TWO_FACTOR" {
  return new URLSearchParams(search).get("kind") === "two-factor" ? "TWO_FACTOR" : "SIGNUP";
}

export function authCompletionDestination(screenId: string): "/login" | null {
  if (screenId === "AUTH-008" || screenId === "AUTH-010") return "/login";
  return null;
}

export function signupCompletionPath(flowId: string): string {
  return `/api/v1/signup/flows/${encodeURIComponent(flowId)}/complete`;
}

export function signupRecovery(
  screenId: string,
  hasActiveFlow: boolean,
): { screenId: "AUTH-002"; pathname: "/signup/account" } | null {
  return (screenId === "AUTH-003" || screenId === "AUTH-004") && !hasActiveFlow
    ? { screenId: "AUTH-002", pathname: "/signup/account" }
    : null;
}

async function redirectToRoleHome(returnTo: string | null): Promise<void> {
  const response = await fetch("/api/v1/auth/me", { cache: "no-store" });
  if (!response.ok) throw new Error("로그인 정보를 확인하지 못했습니다.");
  const currentUser = (await response.json()) as {
    user_id?: unknown;
    role?: unknown;
    must_change_password?: unknown;
  };
  storeAnalyticsUserId(currentUser.user_id);
  location.assign(authenticatedDestination(currentUser, returnTo));
}

export function authenticatedDestination(
  currentUser: Readonly<{ role?: unknown; must_change_password?: unknown }>,
  returnTo: string | null,
): string {
  if (currentUser.must_change_password === true) return "/account/security";
  if (returnTo) {
    return returnTo;
  }
  return currentUser.role === "ADMIN" || currentUser.role === "HIGHEST_ADMIN" ? "/admin" : "/home";
}
