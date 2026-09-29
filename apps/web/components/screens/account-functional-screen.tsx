"use client";

import { sendAuthMessage } from "@/lib/auth/auth-session-events";
import { clearAuthSessionData } from "@/components/auth/auth-session-data";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { VoteSurveySurface } from "@/components/account/vote-survey-surface";
import { LogoutButton } from "@/components/auth/logout-button";
import { WireflowButton, WireflowField } from "@/components/wireflow/wireflow-primitives";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { mainScreenPrimaryActions } from "./main-screen-actions";
import { ScreenFrame } from "./screen-frame";

type Profile = {
  user_id: string;
  email: string;
  role: string;
  account_state: string;
  preferred_language: string;
  rag_answer_detail: string;
  two_factor_enabled: boolean;
  response_version: number;
};

type TwoFactorIntent = "2fa-request" | "2fa-verify" | "2fa-disable";
type SecurityOperation = "password" | TwoFactorIntent;

export type SecurityAccordionState = Readonly<{
  passwordOpen: boolean;
  twoFactorIntent: TwoFactorIntent | null;
}>;

type AccountFeedback = Readonly<{
  deactivation: string;
  load: string;
  password: string;
  twoFactor: string;
}>;

const initialSecurityAccordionState: SecurityAccordionState = Object.freeze({
  passwordOpen: false,
  twoFactorIntent: null,
});

const initialAccountFeedback: AccountFeedback = Object.freeze({
  deactivation: "",
  load: "",
  password: "",
  twoFactor: "",
});

export function togglePasswordAccordion(current: SecurityAccordionState): SecurityAccordionState {
  return { ...current, passwordOpen: !current.passwordOpen };
}

export function toggleTwoFactorAccordion(
  current: SecurityAccordionState,
  nextIntent: TwoFactorIntent,
): SecurityAccordionState {
  return {
    ...current,
    twoFactorIntent: current.twoFactorIntent === null ? nextIntent : null,
  };
}

export function AccountFunctionalScreen({ screen }: Readonly<{ screen: ScreenDefinition }>) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [feedback, setFeedback] = useState<AccountFeedback>(initialAccountFeedback);
  const [busy, setBusy] = useState(false);
  const [securityAccordion, setSecurityAccordion] = useState<SecurityAccordionState>(
    initialSecurityAccordionState,
  );
  const [deactivationRequested, setDeactivationRequested] = useState(false);
  const deactivationOpen = screen.id === "U-ACCOUNT-004" || deactivationRequested;

  useEffect(() => {
    if (screen.id === "U-ACCOUNT-003") return;
    let active = true;
    loadAccountProfile()
      .then((value) => {
        if (!active) return;
        setProfile(value);
      })
      .catch((error: Error) => active && updateFeedback("load", error.message));
    return () => {
      active = false;
    };
  }, [screen.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const operation = data.get("operation");
    const feedbackTarget =
      operation === "password"
        ? "password"
        : operation === "deactivate"
          ? "deactivation"
          : operation === "2fa-request" || operation === "2fa-verify" || operation === "2fa-disable"
            ? "twoFactor"
            : "load";
    if (operation !== "deactivate" && profile === null) {
      updateFeedback(feedbackTarget, "계정 정보를 불러온 뒤 다시 시도해 주세요.");
      return;
    }
    setBusy(true);
    updateFeedback(feedbackTarget, "");
    try {
      if (operation === "password") {
        if (!passwordConfirmationMatches(data)) {
          throw new Error("새 비밀번호 확인이 일치하지 않습니다.");
        }
        await mutation("/api/v1/account/password", "PUT", {
          current_password: data.get("current_password"),
          new_password: data.get("new_password"),
        });
        redirectAfterPasswordChange();
      } else if (operation === "2fa-request") {
        const response = await mutation("/api/v1/account/2fa/enable", "POST", { code: null });
        if (response.status !== 202) {
          throw new Error("인증 코드를 전송하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
        setSecurityAccordion((current) => ({ ...current, twoFactorIntent: "2fa-verify" }));
        updateFeedback("twoFactor", "인증코드가 전송되었습니다.");
      } else if (operation === "2fa-verify") {
        const code = normalizeTwoFactorCode(data.get("code"));
        if (code === null) throw new Error("6자리 인증 코드를 입력해 주세요.");
        await mutation("/api/v1/account/2fa/enable", "POST", { code });
        const updated = await loadAccountProfile();
        setProfile(updated);
        setSecurityAccordion((current) => ({ ...current, twoFactorIntent: null }));
        updateFeedback("twoFactor", "로그인 2차 인증이 설정되었습니다.");
      } else if (operation === "2fa-disable") {
        await mutation("/api/v1/account/2fa/disable", "POST", {
          password: data.get("current_password"),
        });
        redirectAfterPasswordChange();
      } else if (operation === "deactivate") {
        await mutation("/api/v1/account/deactivate", "POST", { password: data.get("password") });
        clearAuthSessionData();
        sendAuthMessage("LOGOUT");
        location.assign("/reactivate");
      }
    } catch (error) {
      updateFeedback(
        feedbackTarget,
        error instanceof Error ? error.message : "요청을 처리하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateFeedback(target: keyof AccountFeedback, message: string) {
    setFeedback((current) => ({ ...current, [target]: message }));
  }

  function togglePasswordPanel() {
    updateFeedback("password", "");
    setSecurityAccordion(togglePasswordAccordion);
  }

  function toggleTwoFactorPanel() {
    if (profile === null) return;
    updateFeedback("twoFactor", "");
    const nextIntent: TwoFactorIntent = profile.two_factor_enabled ? "2fa-disable" : "2fa-request";
    setSecurityAccordion((current) => toggleTwoFactorAccordion(current, nextIntent));
  }

  function openDeactivationDialog() {
    updateFeedback("deactivation", "");
    setDeactivationRequested(true);
  }

  function closeDeactivationDialog() {
    updateFeedback("deactivation", "");
    if (screen.id === "U-ACCOUNT-004") {
      location.assign("/account");
      return;
    }
    setDeactivationRequested(false);
  }

  return (
    <ScreenFrame screen={screen}>
      {screen.id === "U-ACCOUNT-003" ? (
        <VoteSurveySurface />
      ) : (
        <AccountHomeSurface
          busy={busy}
          feedback={feedback}
          onDeactivate={openDeactivationDialog}
          onPasswordToggle={togglePasswordPanel}
          onSubmit={submit}
          onTwoFactorToggle={toggleTwoFactorPanel}
          profile={profile}
          securityAccordion={securityAccordion}
        />
      )}
      {deactivationOpen ? (
        <DeactivationDialog
          busy={busy}
          message={feedback.deactivation}
          onCancel={closeDeactivationDialog}
          onSubmit={submit}
        />
      ) : null}
    </ScreenFrame>
  );
}

function AccountHomeSurface({
  busy,
  feedback,
  onDeactivate,
  onPasswordToggle,
  onSubmit,
  onTwoFactorToggle,
  profile,
  securityAccordion,
}: Readonly<{
  busy: boolean;
  feedback: AccountFeedback;
  onDeactivate: () => void;
  onPasswordToggle: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onTwoFactorToggle: () => void;
  profile: Profile | null;
  securityAccordion: SecurityAccordionState;
}>) {
  return (
    <div className="wf-account-hub" data-wireflow-layout="account-hub">
      <AccountManagementSurface
        busy={busy}
        feedback={feedback}
        onPasswordToggle={onPasswordToggle}
        onSubmit={onSubmit}
        onTwoFactorToggle={onTwoFactorToggle}
        profile={profile}
        securityAccordion={securityAccordion}
      />
      <div className="wf-account-session-actions">
        <div className="wf-account-logout">
          <LogoutButton />
        </div>
        <button
          className="wf-button wf-button-danger wf-account-deactivate-button"
          disabled={busy}
          onClick={onDeactivate}
          type="button"
        >
          계정 비활성화
        </button>
      </div>
    </div>
  );
}

function AccountManagementSurface({
  busy,
  feedback,
  onPasswordToggle,
  onSubmit,
  onTwoFactorToggle,
  profile,
  securityAccordion,
}: Readonly<{
  busy: boolean;
  feedback: AccountFeedback;
  onPasswordToggle: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onTwoFactorToggle: () => void;
  profile: Profile | null;
  securityAccordion: SecurityAccordionState;
}>) {
  const loaded = profile !== null;
  const passwordFormId = "wf-password-security-form";
  const twoFactorFormId = "wf-two-factor-security-form";
  const twoFactorOpen = securityAccordion.twoFactorIntent !== null;
  return (
    <div className="wf-account-management" data-wireflow-layout="account-management">
      <section aria-labelledby="wf-account-security-title" className="wf-account-section">
        <h2 id="wf-account-security-title">보안</h2>
        {feedback.load ? (
          <p aria-live="polite" className="civic-form-message wf-account-load-message">
            {feedback.load}
          </p>
        ) : null}
        <div className="wf-account-security-list">
          <SecurityAction
            actionLabel={securityAccordion.passwordOpen ? "닫기" : "변경하기"}
            controlsId={passwordFormId}
            disabled={busy || !loaded}
            description="비밀번호 변경 시 모든 기기에서 로그아웃됩니다."
            expanded={securityAccordion.passwordOpen}
            onAction={onPasswordToggle}
            title="비밀번호 변경"
          >
            {securityAccordion.passwordOpen ? (
              <SecurityForm
                busy={busy}
                id={passwordFormId}
                intent="password"
                message={feedback.password}
                onSubmit={onSubmit}
              />
            ) : null}
          </SecurityAction>
          <SecurityAction
            actionLabel={
              twoFactorOpen ? "닫기" : profile?.two_factor_enabled ? "해제하기" : "설정하기"
            }
            controlsId={twoFactorFormId}
            disabled={busy || !loaded}
            description="로그인 시 이메일로 받은 6자리 인증번호를 추가로 확인합니다."
            expanded={twoFactorOpen}
            onAction={onTwoFactorToggle}
            statusMessage={twoFactorOpen ? "" : feedback.twoFactor}
            title="로그인 2차 인증"
          >
            {securityAccordion.twoFactorIntent ? (
              <SecurityForm
                busy={busy}
                id={twoFactorFormId}
                intent={securityAccordion.twoFactorIntent}
                message={feedback.twoFactor}
                onSubmit={onSubmit}
              />
            ) : null}
          </SecurityAction>
        </div>
      </section>
    </div>
  );
}

function SecurityAction({
  actionLabel,
  children,
  controlsId,
  description,
  disabled = false,
  expanded,
  onAction,
  statusMessage,
  title,
}: Readonly<{
  actionLabel: string;
  children?: ReactNode;
  controlsId: string;
  description: string;
  disabled?: boolean;
  expanded: boolean;
  onAction: () => void;
  statusMessage?: string;
  title: string;
}>) {
  return (
    <article className={`wf-account-security-card${expanded ? " is-expanded" : ""}`}>
      <div className="wf-account-security-summary">
        <div className="wf-account-security-copy">
          <h3>{title}</h3>
          <p>{description}</p>
          {statusMessage ? (
            <p aria-live="polite" className="civic-form-message wf-account-security-feedback">
              {statusMessage}
            </p>
          ) : null}
        </div>
        <WireflowButton
          aria-controls={controlsId}
          aria-expanded={expanded}
          disabled={disabled}
          onClick={onAction}
          variant="secondary"
        >
          {actionLabel}
        </WireflowButton>
      </div>
      {children}
    </article>
  );
}

function SecurityForm({
  busy,
  id,
  intent,
  message,
  onSubmit,
}: Readonly<{
  busy: boolean;
  id: string;
  intent: SecurityOperation;
  message: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}>) {
  return (
    <form className="wf-security-form" id={id} onSubmit={onSubmit}>
      <input name="operation" type="hidden" value={intent} />
      {message ? (
        <p aria-live="polite" className="civic-form-message">
          {message}
        </p>
      ) : null}
      {intent === "password" || intent === "2fa-disable" ? (
        <WireflowField label="현재 비밀번호" name="current_password" required type="password" />
      ) : null}
      {intent === "password" ? (
        <>
          <WireflowField label="새 비밀번호" name="new_password" required type="password" />
          <WireflowField
            label="새 비밀번호 확인"
            name="new_password_confirmation"
            required
            type="password"
          />
        </>
      ) : null}
      {intent === "2fa-request" ? (
        <p className="wf-account-help">등록된 이메일로 10분 동안 유효한 인증 코드를 보냅니다.</p>
      ) : null}
      {intent === "2fa-verify" ? (
        <WireflowField
          autoComplete="one-time-code"
          inputMode="numeric"
          label="6자리 인증 코드"
          maxLength={6}
          name="code"
          pattern="[0-9]{6}"
          required
        />
      ) : null}
      <WireflowButton disabled={busy} type="submit">
        {busy
          ? "처리 중…"
          : intent === "password"
            ? "비밀번호 변경"
            : intent === "2fa-request"
              ? "인증 코드 받기"
              : intent === "2fa-verify"
                ? "인증 확인"
                : "인증 해제"}
      </WireflowButton>
    </form>
  );
}

function DeactivationDialog({
  busy,
  message,
  onCancel,
  onSubmit,
}: Readonly<{
  busy: boolean;
  message: string;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}>) {
  return (
    <div className="wf-account-overlay" data-wireflow-layout="account-deactivate">
      <div aria-hidden="true" className="wf-account-scrim" />
      <form
        aria-describedby="wf-deactivate-dialog-description"
        aria-labelledby="wf-deactivate-dialog-title"
        aria-modal="true"
        className="wf-account-dialog"
        onSubmit={onSubmit}
        role="alertdialog"
      >
        <input name="operation" type="hidden" value="deactivate" />
        <header>
          <h2 id="wf-deactivate-dialog-title">계정을 비활성화할까요?</h2>
          <button
            aria-label="닫기"
            className="wf-dialog-close"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            <Image alt="" height={24} src="/assets/account/close.png" width={24} />
          </button>
        </header>
        <p id="wf-deactivate-dialog-description">다시 로그인시 계정을 활성화 할 수 있습니다.</p>
        <div className="wf-account-dialog-body">
          <dl className="wf-impact-list">
            <div>
              <dt>보관 데이터</dt>
              <dd>작성한 정보와 활동 기록은 계정을 다시 사용할 수 있도록 보관됩니다.</dd>
            </div>
            <div>
              <dt>로그인 상태</dt>
              <dd>현재 기기를 포함한 모든 기기에서 로그아웃됩니다.</dd>
            </div>
          </dl>
          <WireflowField autoFocus label="비밀번호 확인" name="password" required type="password" />
          {message ? (
            <p aria-live="polite" className="civic-form-message">
              {message}
            </p>
          ) : null}
        </div>
        <div className="wf-dialog-actions">
          <WireflowButton disabled={busy} onClick={onCancel} variant="secondary">
            계정 유지
          </WireflowButton>
          <WireflowButton disabled={busy} type="submit" variant="danger">
            {busy ? "처리 중…" : mainScreenPrimaryActions["U-ACCOUNT-004"]}
          </WireflowButton>
        </div>
      </form>
    </div>
  );
}

export function normalizeTwoFactorCode(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return /^[0-9]{6}$/u.test(code) ? code : null;
}

export function passwordConfirmationMatches(data: FormData): boolean {
  const password = data.get("new_password");
  const confirmation = data.get("new_password_confirmation");
  return typeof password === "string" && password === confirmation;
}

export function redirectAfterPasswordChange(
  navigate: (path: string) => void = (path) => location.assign(path),
): void {
  clearAuthSessionData();
  sendAuthMessage("LOGOUT");
  navigate("/login");
}

export async function loadAccountProfile(
  request: typeof fetch = authenticatedFetch,
): Promise<Profile> {
  const response = await request("/api/v1/account/profile", { cache: "no-store" });
  if (!response.ok) throw new Error("계정 정보를 불러오지 못했습니다.");
  return (await response.json()) as Profile;
}

async function mutation(path: string, method: string, body: unknown) {
  const response = await authenticatedFetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(problem.detail ?? "요청을 처리하지 못했습니다.");
  }
  return response;
}
