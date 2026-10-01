"use client";

import { sendAuthMessage } from "@/lib/auth/auth-session-events";
import { clearAuthSessionData } from "@/components/auth/auth-session-data";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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

export type PasswordResetStep = "EMAIL" | "CODE" | "PASSWORD";

export type PasswordResetSchedule = Readonly<{ expiresAt: string; resendAvailableAt: string }>;

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
const signupPasswordPattern =
  /^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=])[A-Za-z0-9!@#$%^&*()_+\-=]{8,1024}$/u;
const signupPasswordPolicyMessage =
  "비밀번호는 8~1024자의 영문·숫자·특수문자(!@#$%^&*()_+-=) 조합으로 입력해 주세요.";

export type AuthErrorOperation =
  | "LOGIN"
  | "QUICK_LOGIN"
  | "SIGNUP_START"
  | "SIGNUP_VERIFY"
  | "SIGNUP_COMPLETE"
  | "TWO_FACTOR_VERIFY"
  | "VERIFICATION_RESEND"
  | "PASSWORD_RESET_REQUEST"
  | "PASSWORD_RESET_RESEND"
  | "PASSWORD_RESET_CODE"
  | "PASSWORD_RESET_COMPLETE"
  | "REACTIVATION_REQUEST"
  | "REACTIVATION_COMPLETE";

class AuthUserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthUserFacingError";
  }
}

export function signupStepFromHistory(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("civicSignupStep" in value)) return null;
  const step = value.civicSignupStep;
  return typeof step === "string" && signupHistorySteps.has(step) ? step : null;
}

export function authStepAfterPopState(value: unknown, entryScreenId: string): string {
  if (value && typeof value === "object" && "civicAuthStep" in value) {
    if (value.civicAuthStep === "AUTH-007") return "AUTH-007";
  }
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
  const entryScreenId = screen.id === "AUTH-008" ? "AUTH-007" : screen.id;
  const [activeId, setActiveId] = useState(entryScreenId);
  const [verificationKind, setVerificationKind] = useState<"SIGNUP" | "TWO_FACTOR">(() =>
    verificationKindFromSearch(initialSearch),
  );
  const [draft, setDraft] = useState<SignupDraft>(initialDraft);
  const [passwordResetStep, setPasswordResetStep] = useState<PasswordResetStep>("EMAIL");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  // 원본 이메일 대신 서버가 돌려준 가린 이메일과 일정으로 이후 단계를 표시한다.
  const [resetMaskedEmail, setResetMaskedEmail] = useState("");
  const [resetSchedule, setResetSchedule] = useState<PasswordResetSchedule | null>(null);
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
    if (screen.id !== "AUTH-008") return;
    history.replaceState(history.state, "", "/password-reset");
    onActiveScreenChange?.("AUTH-007");
  }, [onActiveScreenChange, screen.id]);

  useEffect(() => {
    if (signupHistorySteps.has(screen.id)) {
      history.replaceState({ ...history.state, civicSignupStep: screen.id }, "");
    }
    const restoreStep = (event: PopStateEvent) => {
      const nextId = authStepAfterPopState(event.state, entryScreenId);
      setActiveId(nextId);
      onActiveScreenChange?.(nextId);
    };
    addEventListener("popstate", restoreStep);
    return () => removeEventListener("popstate", restoreStep);
  }, [entryScreenId, onActiveScreenChange, screen.id]);

  useEffect(() => {
    resetAuthScrollTop(authGridRef.current);
  }, [activeId, passwordResetStep]);

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
        if (passwordProblem) throw new AuthUserFacingError(passwordProblem);
        if (!draft.ageConfirmed) {
          throw new AuthUserFacingError("만 14세 이상 여부를 확인해 주세요.");
        }
        const response = await api("/api/v1/signup/flows", { email: draft.email });
        const body = (await response.json()) as {
          flow_id?: unknown;
          documents?: unknown;
          acceptance_controls?: unknown;
        };
        if (typeof body.flow_id !== "string") {
          throw new AuthUserFacingError(
            "회원가입을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          );
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
          throw new AuthUserFacingError("이메일 인증과 필수 동의를 모두 확인해 주세요.");
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
        if (passwordResetStep === "EMAIL") {
          const email = resetEmail.trim();
          if (!isPasswordResetEmail(email)) {
            throw new AuthUserFacingError("로그인에 사용한 이메일을 입력해 주세요.");
          }
          const response = await api("/api/v1/auth/password-reset/request", { email });
          const started = readPasswordResetResponse(await response.json().catch(() => null));
          setResetEmail(email);
          setResetMaskedEmail(started.maskedEmail ?? maskAuthEmail(email) ?? "");
          setResetSchedule(started.schedule);
          setResetCode("");
          setPasswordResetStep("CODE");
        } else if (passwordResetStep === "CODE") {
          const code = normalizePasswordResetCode(data.get("code"));
          if (!/^\d{6}$/u.test(code)) {
            throw new AuthUserFacingError("6자리 인증 코드를 입력해 주세요.");
          }
          await api("/api/v1/auth/password-reset/verify", { code });
          setPasswordResetStep("PASSWORD");
        } else {
          const newPassword = String(data.get("new_password") ?? "");
          const newPasswordConfirmation = String(data.get("new_password_confirmation") ?? "");
          const passwordProblem = signupPasswordProblem(newPassword, newPasswordConfirmation);
          if (passwordProblem) throw new AuthUserFacingError(passwordProblem);
          // 인증번호는 verify 단계에서 서버가 확인했고, 완료 요청은 auth flow 쿠키로 식별한다.
          await api("/api/v1/auth/password-reset/complete", { new_password: newPassword });
          clearAuthSessionData();
          sendAuthMessage("LOGOUT");
          location.assign("/login");
        }
      } else if (activeId === "AUTH-009") {
        const data = new FormData(event.currentTarget);
        await api("/api/v1/auth/reactivation/request", {
          email: data.get("email"),
          password: data.get("password"),
        });
        location.assign("/reactivate/complete");
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
        const operation =
          activeId === "AUTH-007"
            ? passwordResetOperation(passwordResetStep)
            : authErrorOperation(activeId, verificationKind);
        if (activeId === "AUTH-007") {
          const nextStep = passwordResetStepAfterError(operation, error);
          if (nextStep) movePasswordResetStep(nextStep);
        }
        setMessageKind("error");
        setMessage(authErrorMessage(error, operation));
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
      setMessage(authErrorMessage(error, "QUICK_LOGIN"));
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
      setMessage(authErrorMessage(error, "VERIFICATION_RESEND"));
    } finally {
      setBusy(false);
    }
  }

  // 로그인 화면의 이메일은 URL이나 브라우저 저장소를 거치지 않고 화면 상태로만 넘긴다.
  function openPasswordReset() {
    setResetEmail(draft.email.trim());
    movePasswordResetStep("EMAIL");
    setMessage("");
    setMessageKind("info");
    history.pushState({ ...history.state, civicAuthStep: "AUTH-007" }, "", "/password-reset");
    setActiveId("AUTH-007");
    onActiveScreenChange?.("AUTH-007");
  }

  async function resendPasswordReset() {
    setBusy(true);
    setMessage("");
    try {
      const response = await api("/api/v1/auth/password-reset/resend", {});
      const resent = readPasswordResetResponse(await response.json().catch(() => null));
      if (resent.schedule) setResetSchedule(resent.schedule);
      setResetCode("");
      setMessageKind("info");
      setMessage("인증번호를 다시 보냈습니다.");
    } catch (error) {
      const nextStep = passwordResetStepAfterError("PASSWORD_RESET_RESEND", error);
      if (nextStep) movePasswordResetStep(nextStep);
      setMessageKind("error");
      setMessage(authErrorMessage(error, "PASSWORD_RESET_RESEND"));
    } finally {
      setBusy(false);
    }
  }

  function movePasswordResetStep(step: PasswordResetStep) {
    setResetCode("");
    if (step === "EMAIL") {
      setResetMaskedEmail("");
      setResetSchedule(null);
    }
    setPasswordResetStep(step);
  }

  function changePasswordResetEmail() {
    movePasswordResetStep("EMAIL");
    setMessage("");
    setMessageKind("info");
  }

  function changeSignupStep(id: string, pathname: string) {
    history.pushState({ ...history.state, civicSignupStep: id }, "", pathname);
    setActiveId(id);
    onActiveScreenChange?.(id);
  }

  const isPasswordReset = activeId === "AUTH-007";
  const action = isPasswordReset
    ? passwordResetAction(passwordResetStep)
    : (mainScreenPrimaryActions[activeId] ?? mainScreenPrimaryActions[screen.id]);
  const cardTitle = isPasswordReset
    ? passwordResetCardTitle(passwordResetStep)
    : authCardTitle(activeId);
  const cardSubtitle = isPasswordReset
    ? passwordResetCardSubtitle(passwordResetStep, resetMaskedEmail)
    : authCardSubtitle(activeId, draft.email);
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
          key={isPasswordReset ? `${activeId}-${passwordResetStep}` : activeId}
          onSubmit={submit}
          subtitle={cardSubtitle}
          title={cardTitle}
        >
          {activeId === "AUTH-002" && duplicateEmailState ? (
            <SignupDuplicateEmailNotice accountState={duplicateEmailState} />
          ) : null}
          {activeId === "AUTH-001" && loginDeactivated ? <LoginDeactivatedNotice /> : null}
          {message ? (
            messageKind === "error" ? (
              <div aria-live="polite" className="civic-form-alert" role="status">
                <strong>확인해 주세요</strong>
                <p>{message}</p>
              </div>
            ) : (
              <p aria-live="polite" className="civic-form-message" role="status">
                {message}
              </p>
            )
          ) : null}
          {isPasswordReset ? (
            <PasswordResetFields
              code={resetCode}
              email={resetEmail}
              expiresAt={resetSchedule?.expiresAt ?? null}
              onCodeChange={setResetCode}
              onEmailChange={setResetEmail}
              step={passwordResetStep}
            />
          ) : (
            renderFields(activeId, draft, setDraft, () => setDuplicateEmailState(null))
          )}
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
          {isPasswordReset && passwordResetStep === "CODE" ? (
            <WireflowButton
              disabled={busy}
              onClick={changePasswordResetEmail}
              type="button"
              variant="secondary"
            >
              이메일 변경
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
        {isPasswordReset && passwordResetStep === "EMAIL" ? (
          <p className="civic-password-reset-signup">
            아직 계정이 없으신가요?{" "}
            <Link data-wireflow-slot="password-reset-signup" href={"/signup/account" as Route}>
              회원가입
            </Link>
          </p>
        ) : null}
        <AuthSupport
          activeId={activeId}
          busy={busy}
          onPasswordReset={openPasswordReset}
          onPasswordResetResend={resendPasswordReset}
          onResend={resendVerification}
          passwordResetResendAvailableAt={resetSchedule?.resendAvailableAt ?? null}
          passwordResetStep={passwordResetStep}
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
  return <p>요청 정보를 확인한 뒤 계속 진행하세요.</p>;
}

export function PasswordResetFields({
  code,
  email,
  expiresAt = null,
  onCodeChange,
  onEmailChange,
  step,
}: Readonly<{
  code: string;
  email: string;
  expiresAt?: string | null;
  onCodeChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  step: PasswordResetStep;
}>) {
  if (step === "EMAIL") {
    return (
      <Field
        autoComplete="email"
        enterKeyHint="go"
        help="비밀번호를 재설정할 계정의 이메일을 입력해 주세요."
        label="이메일"
        name="email"
        placeholder="name@example.com"
        type="email"
        value={email}
        onChange={onEmailChange}
      />
    );
  }

  if (step === "CODE") {
    return (
      <>
        <Field
          autoComplete="email"
          enterKeyHint="next"
          label="이메일"
          name="email"
          readOnly
          type="email"
          value={email}
        />
        <Field
          autoComplete="one-time-code"
          enterKeyHint="done"
          help={expiresAt ? <ExpiryCountdown expiresAt={expiresAt} /> : <CodeCountdown />}
          inputMode="numeric"
          label="6자리 인증번호"
          maxLength={6}
          name="code"
          placeholder="000000"
          value={code}
          onChange={onCodeChange}
        />
      </>
    );
  }

  return (
    <>
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
}

function AuthSupport({
  activeId,
  busy,
  onPasswordReset,
  onPasswordResetResend,
  onResend,
  passwordResetResendAvailableAt,
  passwordResetStep,
}: Readonly<{
  activeId: string;
  busy: boolean;
  onPasswordReset: () => void;
  onPasswordResetResend: () => void;
  onResend: () => void;
  passwordResetResendAvailableAt: string | null;
  passwordResetStep: PasswordResetStep;
}>) {
  const resendWait = useSecondsUntil(passwordResetResendAvailableAt);
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
  if (activeId === "AUTH-007" && passwordResetStep === "CODE") {
    return (
      <AuthInfo
        actionLabel={resendWait > 0 ? `코드 재발송 (${resendWait}초)` : "코드 재발송"}
        body="아래 버튼을 클릭하여 다시 받을 수 있습니다."
        disabled={busy || resendWait > 0}
        onAction={onPasswordResetResend}
        title="코드가 오지 않았나요?"
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
          <p>비활성화된 계정에 사용 중인 이메일입니다. 계정을 재활성화해 주세요.</p>
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
          <p>기존 계정으로 로그인해 주세요.</p>
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
      <p>비활성화된 계정입니다. 계정을 재활성화한 후 로그인해 주세요.</p>
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

function ExpiryCountdown({ expiresAt }: Readonly<{ expiresAt: string }>) {
  const remaining = useSecondsUntil(expiresAt);
  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");
  return `남은 시간 ${minutes}:${seconds}`;
}

function useSecondsUntil(target: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const tick = () => setNow(Date.now());
    // 대상 시각이 바뀌면 다음 1초를 기다리지 않고 남은 시간을 바로 다시 계산한다.
    const immediate = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(immediate);
      clearInterval(timer);
    };
  }, [target]);
  return secondsUntil(target, now);
}

export function secondsUntil(target: string | null | undefined, now: number): number {
  const at = target ? Date.parse(target) : Number.NaN;
  return Number.isNaN(at) ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
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
  if (id === "AUTH-007") return "이메일 입력";
  if (id === "AUTH-008") return "새 비밀번호 설정";
  if (id === "AUTH-009" || id === "AUTH-010") return "재활성화 본인 확인";
  return "요청 정보";
}

function authCardSubtitle(id: string, email: string): string | undefined {
  if (id !== "AUTH-005") return undefined;
  const masked = maskAuthEmail(email);
  return masked ? `${masked}으로 코드를 전송했습니다.` : "등록 이메일로 코드를 전송했습니다.";
}

export function passwordResetAction(step: PasswordResetStep): string {
  if (step === "EMAIL") return "인증번호 받기";
  if (step === "CODE") return "인증번호 확인";
  return "비밀번호 변경";
}

export function passwordResetCardTitle(step: PasswordResetStep): string {
  if (step === "EMAIL") return "이메일 입력";
  if (step === "CODE") return "인증번호 입력";
  return "새 비밀번호 설정";
}

function passwordResetCardSubtitle(step: PasswordResetStep, masked: string): string | undefined {
  if (step === "EMAIL") return "비밀번호를 재설정할 계정을 확인합니다.";
  if (step === "CODE") {
    return masked ? `${masked}으로 인증번호를 전송했습니다.` : undefined;
  }
  return masked ? `${masked} 이메일 인증을 완료했습니다.` : "이메일 인증을 완료했습니다.";
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
  readOnly = false,
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
  readOnly?: boolean;
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
        readOnly={readOnly}
        required
        type={type}
        value={onChange || readOnly ? value : undefined}
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
    throw new AuthUserFacingError("가입 문서를 불러오지 못했습니다.");
  }
  const result: SignupDraft["documents"] = {};
  for (const id of ["TERMS", "ACCOUNT_RAG_PRIVACY"] as const) {
    const candidate = (value as Record<string, unknown>)[id];
    if (!candidate || typeof candidate !== "object") {
      throw new AuthUserFacingError("가입 문서를 불러오지 못했습니다.");
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
      throw new AuthUserFacingError("가입 문서 응답이 올바르지 않습니다.");
    }
    result[id] = document as unknown as SignupDocument;
  }
  return result;
}

export function readSignupAcceptanceControls(value: unknown): SignupDocumentId[] {
  if (value === undefined) return ["TERMS", "ACCOUNT_RAG_PRIVACY"];
  if (!Array.isArray(value) || value.some((item) => !isSignupDocumentId(item))) {
    throw new AuthUserFacingError("가입 동의 항목 응답이 올바르지 않습니다.");
  }
  const controls = [...new Set(value)] as SignupDocumentId[];
  if (!controls.includes("TERMS")) {
    throw new AuthUserFacingError("필수 이용약관 동의 항목을 불러오지 못했습니다.");
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
  if (!document) throw new AuthUserFacingError("가입 문서를 다시 확인해 주세요.");
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
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, { code: "NETWORK_ERROR" }, "인증 요청에 실패했습니다.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as unknown;
    const problem =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    throw new ApiRequestError(response.status, problem, "인증 요청에 실패했습니다.");
  }
  return response;
}

export function authErrorMessage(error: unknown, operation: AuthErrorOperation): string {
  if (error instanceof AuthUserFacingError) return error.message;
  if (!(error instanceof ApiRequestError)) return authOperationFallback(operation);

  const code = authProblemCode(error.problem);
  if (error.status === 0 || code === "NETWORK_ERROR") {
    return "네트워크 연결을 확인한 후 다시 시도해 주세요.";
  }
  if (code === "PASSWORD_RESET_RESEND_COOLDOWN" || code === "PASSWORD_RESET_RESEND_LIMIT") {
    return sendLimitMessage(error.problem, code);
  }
  if (error.status === 429 || codeContains(code, "RATE_LIMIT", "TOO_MANY")) {
    if (operation === "LOGIN") {
      return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    }
    if (
      operation === "SIGNUP_VERIFY" ||
      operation === "TWO_FACTOR_VERIFY" ||
      operation === "PASSWORD_RESET_CODE"
    ) {
      return "인증 시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.";
    }
    if (operation === "VERIFICATION_RESEND") {
      return "인증번호를 이미 보냈습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (error.status >= 500) {
    return "서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (operation === "LOGIN") {
    if (code === "ACCOUNT_DEACTIVATED") {
      return "비활성화된 계정입니다. 계정을 재활성화한 후 로그인해 주세요.";
    }
    if (
      error.status === 401 ||
      error.status === 403 ||
      codeContains(code, "CREDENTIAL", "INVALID_LOGIN")
    ) {
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    }
  }

  if (operation === "SIGNUP_START" && (error.status === 400 || error.status === 422)) {
    return "올바른 이메일 주소를 입력해 주세요.";
  }

  if (operation === "PASSWORD_RESET_CODE") {
    if (code === "PASSWORD_RESET_ATTEMPTS_EXCEEDED") {
      return "인증번호를 5회 잘못 입력했습니다. 인증번호를 다시 받아 주세요.";
    }
    if (code === "PASSWORD_RESET_EXPIRED") {
      return "인증번호가 만료되었습니다. 인증번호를 다시 받아 주세요.";
    }
  }

  if (
    operation === "SIGNUP_VERIFY" ||
    operation === "TWO_FACTOR_VERIFY" ||
    operation === "PASSWORD_RESET_CODE"
  ) {
    if (error.status === 410 || codeContains(code, "EXPIRED")) {
      return "인증번호가 만료되었습니다. 새 인증번호를 받아 주세요.";
    }
    if (
      error.status === 400 ||
      error.status === 401 ||
      error.status === 404 ||
      error.status === 422 ||
      codeContains(
        code,
        "INVALID_CODE",
        "CODE_INVALID",
        "INVALID_VERIFICATION",
        "VERIFICATION_CODE_INVALID",
        "VERIFICATION_FAILED",
      )
    ) {
      return "인증번호가 올바르지 않습니다. 다시 확인해 주세요.";
    }
  }

  if (operation === "SIGNUP_COMPLETE") {
    if (codeContains(code, "PASSWORD")) return signupPasswordPolicyMessage;
    if (codeContains(code, "CONSENT", "TERMS", "PRIVACY", "ACCEPTANCE")) {
      return "이메일 인증과 필수 동의를 모두 확인해 주세요.";
    }
    if (
      error.status === 404 ||
      error.status === 410 ||
      codeContains(code, "FLOW_EXPIRED", "FLOW_NOT_FOUND", "INVALID_FLOW", "INVALID_STATE")
    ) {
      return "회원가입 시간이 만료되었습니다. 처음부터 다시 진행해 주세요.";
    }
  }

  if (
    (operation === "PASSWORD_RESET_REQUEST" || operation === "PASSWORD_RESET_RESEND") &&
    (error.status === 400 || error.status === 422 || codeContains(code, "INVALID_EMAIL"))
  ) {
    return "올바른 이메일 주소를 입력해 주세요.";
  }

  if (operation === "PASSWORD_RESET_COMPLETE") {
    if (codeContains(code, "PASSWORD_POLICY")) return signupPasswordPolicyMessage;
    if (code === "PASSWORD_REUSED") {
      return "기존 비밀번호와 다른 비밀번호를 사용해 주세요. 인증번호를 다시 받아 진행해 주세요.";
    }
    if (code === "PASSWORD_RESET_NOT_VERIFIED") {
      return "인증번호 확인이 필요합니다. 인증번호를 입력해 주세요.";
    }
    if (error.status === 401 || error.status === 410) {
      return "인증 유효 시간이 지났습니다. 인증번호를 다시 받아 주세요.";
    }
  }

  if (operation === "PASSWORD_RESET_RESEND" && error.status === 401) {
    return "재설정 요청이 만료되었습니다. 이메일을 다시 입력해 주세요.";
  }

  return authOperationFallback(operation);
}

function authErrorOperation(
  screenId: string,
  verificationKind: "SIGNUP" | "TWO_FACTOR",
): AuthErrorOperation {
  if (screenId === "AUTH-001") return "LOGIN";
  if (screenId === "AUTH-002") return "SIGNUP_START";
  if (screenId === "AUTH-004") return "SIGNUP_COMPLETE";
  if (screenId === "AUTH-005") {
    return verificationKind === "TWO_FACTOR" ? "TWO_FACTOR_VERIFY" : "SIGNUP_VERIFY";
  }
  if (screenId === "AUTH-007") return "PASSWORD_RESET_CODE";
  if (screenId === "AUTH-008") return "PASSWORD_RESET_COMPLETE";
  if (screenId === "AUTH-009") return "REACTIVATION_REQUEST";
  if (screenId === "AUTH-010") return "REACTIVATION_COMPLETE";
  return "SIGNUP_START";
}

function passwordResetOperation(step: PasswordResetStep): AuthErrorOperation {
  if (step === "EMAIL") return "PASSWORD_RESET_REQUEST";
  if (step === "CODE") return "PASSWORD_RESET_CODE";
  return "PASSWORD_RESET_COMPLETE";
}

function authOperationFallback(operation: AuthErrorOperation): string {
  if (operation === "LOGIN") return "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (operation === "QUICK_LOGIN") return "테스트 계정으로 로그인하지 못했습니다.";
  if (operation === "SIGNUP_START") {
    return "회원가입을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (operation === "SIGNUP_VERIFY" || operation === "TWO_FACTOR_VERIFY") {
    return "인증번호를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (operation === "SIGNUP_COMPLETE") {
    return "회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (operation === "VERIFICATION_RESEND") {
    return "인증번호를 다시 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (operation === "PASSWORD_RESET_REQUEST") {
    return "재설정 이메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (operation === "PASSWORD_RESET_RESEND") {
    return "재설정 이메일을 다시 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (operation === "PASSWORD_RESET_CODE") {
    return "인증번호를 확인하지 못했습니다. 다시 시도해 주세요.";
  }
  if (operation === "PASSWORD_RESET_COMPLETE") {
    return "비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (operation === "REACTIVATION_REQUEST") {
    return "계정 재활성화를 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "계정을 재활성화하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function authProblemCode(problem: Readonly<Record<string, unknown>>): string {
  const candidate = problem.code ?? problem.error_code;
  return typeof candidate === "string" ? candidate.trim().toUpperCase() : "";
}

export function readPasswordResetResponse(value: unknown): Readonly<{
  maskedEmail: string | null;
  schedule: PasswordResetSchedule | null;
}> {
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const maskedEmail = typeof body.masked_email === "string" ? body.masked_email : null;
  const schedule =
    typeof body.expires_at === "string" && typeof body.resend_available_at === "string"
      ? { expiresAt: body.expires_at, resendAvailableAt: body.resend_available_at }
      : null;
  return { maskedEmail, schedule };
}

// 실패 후 이동할 단계. 재설정 요청이 소진됐으면 이메일부터, 인증 상태만 잃었으면 인증번호부터 다시 진행한다.
export function passwordResetStepAfterError(
  operation: AuthErrorOperation,
  error: unknown,
): PasswordResetStep | null {
  if (!(error instanceof ApiRequestError) || error.status !== 401) return null;
  const code = authProblemCode(error.problem);
  if (operation === "PASSWORD_RESET_RESEND") return "EMAIL";
  if (operation !== "PASSWORD_RESET_COMPLETE" || code === "PASSWORD_POLICY") return null;
  return code === "PASSWORD_REUSED" ? "EMAIL" : "CODE";
}

function sendLimitMessage(problem: Readonly<Record<string, unknown>>, code: string): string {
  const wait = secondsUntil(
    typeof problem.retry_at === "string" ? problem.retry_at : null,
    Date.now(),
  );
  if (code === "PASSWORD_RESET_RESEND_LIMIT") {
    return `인증번호 요청 횟수를 초과했습니다. ${Math.max(1, Math.ceil(wait / 60))}분 후에 다시 시도해 주세요.`;
  }
  return `${Math.max(1, wait)}초 후에 다시 받을 수 있습니다.`;
}

function codeContains(code: string, ...fragments: string[]): boolean {
  return fragments.some((fragment) => code.includes(fragment));
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
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/me", { cache: "no-store" });
  } catch {
    throw new AuthUserFacingError("네트워크 연결을 확인한 후 다시 시도해 주세요.");
  }
  if (!response.ok) {
    throw new AuthUserFacingError("로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.");
  }
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
