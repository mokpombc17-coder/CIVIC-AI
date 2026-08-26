"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Route } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { AccountTabs } from "@/components/wireflow/participant-layouts";
import { WireflowActionCard } from "@/components/wireflow/wireflow-blocks";
import {
  WireflowButton,
  WireflowCard,
  WireflowField,
} from "@/components/wireflow/wireflow-primitives";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { mainScreenPrimaryActions } from "./main-screen-actions";
import { ScreenFrame } from "./screen-frame";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

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

type SecurityIntent = "password" | "2fa" | null;
type ProfileSettings = {
  preferredLanguage: "ko" | "en";
  answerDetail: "concise" | "balanced" | "detailed";
};

const initialProfileSettings: ProfileSettings = {
  preferredLanguage: "ko",
  answerDetail: "balanced",
};

export function AccountFunctionalScreen({ screen }: Readonly<{ screen: ScreenDefinition }>) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [securityIntent, setSecurityIntent] = useState<SecurityIntent>(null);
  const [profileSettings, setProfileSettings] = useState(initialProfileSettings);

  useEffect(() => {
    let active = true;
    loadAccountProfile()
      .then((value) => {
        if (!active) return;
        setProfile(value);
        setProfileSettings(readProfileSettings(value));
      })
      .catch((error: Error) => active && setMessage(error.message));
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((screen.id === "U-ACCOUNT-001" || screen.id === "U-ACCOUNT-002") && profile === null) {
      setMessage("계정 정보를 불러온 뒤 다시 시도해 주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      if (screen.id === "U-ACCOUNT-001" || screen.id === "U-ACCOUNT-002") {
        const response = await mutation("/api/v1/account/profile", "PATCH", {
          preferred_language: data.get("preferred_language"),
          rag_answer_detail: data.get("rag_answer_detail"),
        });
        const updated = (await response.json()) as Profile;
        setProfile(updated);
        setProfileSettings(readProfileSettings(updated));
        setMessage("새 응답 버전으로 저장했습니다.");
      } else if (screen.id === "U-ACCOUNT-003") {
        const intent = data.get("intent");
        if (intent === "password") {
          if (!passwordConfirmationMatches(data)) {
            throw new Error("새 비밀번호 확인이 일치하지 않습니다.");
          }
          await mutation("/api/v1/account/password", "PUT", {
            current_password: data.get("current_password"),
            new_password: data.get("new_password"),
          });
          redirectAfterPasswordChange();
          return;
        } else {
          if (profile === null) {
            throw new Error("계정 보안 상태를 불러온 뒤 다시 시도해 주세요.");
          }
          await mutation(
            `/api/v1/account/2fa/${profile.two_factor_enabled ? "disable" : "enable"}`,
            "POST",
            profile.two_factor_enabled
              ? { password: data.get("current_password") }
              : { code: normalizeTwoFactorCode(data.get("code")) },
          );
          const updated = await loadAccountProfile();
          setProfile(updated);
          setProfileSettings(readProfileSettings(updated));
          setMessage("2단계 인증 설정 요청을 처리했습니다.");
        }
      } else if (screen.id === "U-ACCOUNT-004") {
        await mutation("/api/v1/account/deactivate", "POST", { password: data.get("password") });
        location.assign("/reactivate");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenFrame screen={screen}>
      {screen.id === "U-ACCOUNT-003" ? (
        <SecuritySurface
          busy={busy}
          intent={securityIntent}
          message={message}
          onIntent={setSecurityIntent}
          onSubmit={submit}
          profile={profile}
        />
      ) : (
        <ProfileSurface
          busy={busy}
          loaded={profile !== null}
          message={message}
          onSubmit={submit}
          settings={profileSettings}
          onSettings={setProfileSettings}
          validation={screen.id === "U-ACCOUNT-002"}
        />
      )}
      {screen.id === "U-ACCOUNT-004" ? (
        <DeactivationDialog busy={busy} message={message} onSubmit={submit} />
      ) : null}
    </ScreenFrame>
  );
}

export function normalizeTwoFactorCode(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function passwordConfirmationMatches(data: FormData): boolean {
  const password = data.get("new_password");
  const confirmation = data.get("new_password_confirmation");
  return typeof password === "string" && password === confirmation;
}

export function redirectAfterPasswordChange(
  navigate: (path: string) => void = (path) => location.assign(path),
): void {
  navigate("/login");
}

export async function loadAccountProfile(
  request: typeof fetch = authenticatedFetch,
): Promise<Profile> {
  const response = await request("/api/v1/account/profile", { cache: "no-store" });
  if (!response.ok) throw new Error("계정 정보를 불러오지 못했습니다.");
  return (await response.json()) as Profile;
}

export function readProfileSettings(profile: Profile): ProfileSettings {
  return {
    preferredLanguage: profile.preferred_language === "en" ? "en" : "ko",
    answerDetail:
      profile.rag_answer_detail === "concise" || profile.rag_answer_detail === "detailed"
        ? profile.rag_answer_detail
        : "balanced",
  };
}

function ProfileSurface({
  busy,
  loaded,
  message,
  onSubmit,
  onSettings,
  settings,
  validation,
}: Readonly<{
  busy: boolean;
  loaded: boolean;
  message: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSettings: React.Dispatch<React.SetStateAction<ProfileSettings>>;
  settings: ProfileSettings;
  validation: boolean;
}>) {
  return (
    <div
      className="wf-account-surface"
      data-wireflow-layout="account-profile"
      data-wireflow-state={validation ? "validation-error" : "ready"}
    >
      <AccountTabs active="profile" />
      <form className="wf-account-form" onSubmit={onSubmit}>
        <WireflowCard className="wf-account-card" title="개인정보·설문 설정">
          <label className="civic-field">
            <span>선호 언어</span>
            <select
              disabled={!loaded}
              name="preferred_language"
              onChange={(event) =>
                onSettings((value) => ({
                  ...value,
                  preferredLanguage: event.target.value as ProfileSettings["preferredLanguage"],
                }))
              }
              value={settings.preferredLanguage}
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="civic-field">
            <span>답변 상세도</span>
            <select
              disabled={!loaded}
              name="rag_answer_detail"
              onChange={(event) =>
                onSettings((value) => ({
                  ...value,
                  answerDetail: event.target.value as ProfileSettings["answerDetail"],
                }))
              }
              value={settings.answerDetail}
            >
              <option value="concise">간결하게</option>
              <option value="balanced">균형 있게</option>
              <option value="detailed">상세하게</option>
            </select>
          </label>
          <p className="wf-account-help">
            가입 당시 확정된 필수 문항과 동의는 유지하며, 여기서는 현재 서비스 설정만 변경합니다.
          </p>
          {validation ? (
            <p className="wf-field-error" role="alert">
              입력 내용을 확인한 뒤 다시 저장해 주세요.
            </p>
          ) : null}
          {message ? (
            <p aria-live="polite" className="civic-form-message">
              {message}
            </p>
          ) : null}
          <WireflowButton
            aria-label={validation ? "필수 정보·동의 저장" : "변경사항 저장"}
            className="wf-account-submit"
            disabled={busy || !loaded}
            type="submit"
          >
            {!loaded
              ? "불러오는 중…"
              : busy
                ? "처리 중…"
                : validation
                  ? "필수 정보·동의 저장"
                  : "변경사항 저장"}
          </WireflowButton>
        </WireflowCard>
      </form>
    </div>
  );
}

function SecuritySurface({
  busy,
  intent,
  message,
  onIntent,
  onSubmit,
  profile,
}: Readonly<{
  busy: boolean;
  intent: SecurityIntent;
  message: string;
  onIntent: (intent: SecurityIntent) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  profile: Profile | null;
}>) {
  return (
    <div className="wf-account-surface" data-wireflow-layout="account-security">
      <AccountTabs active="security" />
      <div className="wf-account-security">
        <label className="sr-only">
          <span>변경 작업</span>
          <select
            name="security_intent_picker"
            onChange={(event) => onIntent(event.target.value as Exclude<SecurityIntent, null>)}
            value={intent ?? ""}
          >
            <option disabled value="">
              변경 작업 선택
            </option>
            <option disabled={profile === null} value="2fa">
              2단계 인증 변경
            </option>
            <option value="password">비밀번호 변경</option>
          </select>
        </label>
        <WireflowCard className="wf-account-status-card">
          <span>2단계 인증 이메일</span>
          <strong>{maskEmail(profile?.email)}</strong>
        </WireflowCard>
        <WireflowCard className="wf-account-status-card">
          <span>최근 변경</span>
          <strong>{profile ? "계정 보안 상태 확인 완료" : "확인 중"}</strong>
        </WireflowCard>
        <div className="wf-account-actions">
          <WireflowActionCard
            action={
              <WireflowButton onClick={() => onIntent("password")} variant="secondary">
                비밀번호 변경
              </WireflowButton>
            }
            badge="비밀번호"
            description="변경 후 모든 기기에서 다시 로그인"
            title="비밀번호 변경"
          />
          <WireflowActionCard
            action={
              <WireflowButton
                disabled={busy || profile === null}
                onClick={() => onIntent("2fa")}
                variant="secondary"
              >
                {profile?.two_factor_enabled ? "2단계 인증 해제" : "2단계 인증 활성화"}
              </WireflowButton>
            }
            badge="선택"
            description={
              profile?.two_factor_enabled
                ? "사용 중 · 이메일 코드 인증"
                : "사용 안 함 · 이메일 코드로 활성화"
            }
            title="2단계 인증"
          />
        </div>
        {intent ? (
          <form className="wf-card wf-security-form" onSubmit={onSubmit}>
            <input name="intent" type="hidden" value={intent} />
            {intent === "password" || profile?.two_factor_enabled ? (
              <WireflowField
                label="현재 비밀번호"
                name="current_password"
                required
                type="password"
              />
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
            {intent === "2fa" && !profile?.two_factor_enabled ? (
              <WireflowField
                inputMode="numeric"
                label="인증 코드 (처음 요청할 때는 비워 두세요)"
                name="code"
              />
            ) : null}
            <WireflowButton disabled={busy || (intent === "2fa" && profile === null)} type="submit">
              {busy ? "처리 중…" : intent === "password" ? "비밀번호 변경" : "설정 저장"}
            </WireflowButton>
          </form>
        ) : null}
        {message ? (
          <p aria-live="polite" className="civic-form-message">
            {message}
          </p>
        ) : null}
        <LogoutButton />
      </div>
    </div>
  );
}

function DeactivationDialog({
  busy,
  message,
  onSubmit,
}: Readonly<{
  busy: boolean;
  message: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}>) {
  return (
    <div className="wf-account-overlay" data-wireflow-layout="account-deactivate">
      <div aria-hidden="true" className="wf-account-scrim" />
      <form
        aria-labelledby="wf-deactivate-title"
        aria-modal="true"
        className="wf-account-dialog"
        onSubmit={onSubmit}
        role="alertdialog"
      >
        <header>
          <h2 id="wf-deactivate-title">계정을 비활성화하시겠습니까?</h2>
          <Link aria-label="닫기" className="wf-dialog-close" href={"/account" as Route}>
            ×
          </Link>
        </header>
        <p>영향을 확인한 뒤 비밀번호를 입력하세요.</p>
        <dl className="wf-impact-list">
          <div>
            <dt>비활성화 영향</dt>
            <dd>CIVIC AI 데이터 활용·개인 AI 갱신 중단</dd>
          </div>
          <div>
            <dt>보관 데이터</dt>
            <dd>기간 없이 유지 · 재활성화 시 다시 연결</dd>
          </div>
          <div>
            <dt>로그인 상태</dt>
            <dd>모든 기기에서 즉시 로그아웃</dd>
          </div>
        </dl>
        <label className="civic-check-row wf-deactivate-confirmation">
          <input name="confirmed" required type="checkbox" />
          <span>현재 활성 기능 이용이 중단되고 모든 기기에서 로그아웃되는 것을 확인했습니다.</span>
        </label>
        <WireflowField label="현재 비밀번호 확인" name="password" required type="password" />
        {message ? (
          <p aria-live="polite" className="civic-form-message">
            {message}
          </p>
        ) : null}
        <div className="wf-dialog-actions">
          <Link className="wf-button wf-button-secondary" href={"/account" as Route}>
            계정 유지
          </Link>
          <WireflowButton disabled={busy} type="submit" variant="danger">
            {busy ? "처리 중…" : mainScreenPrimaryActions["U-ACCOUNT-004"]}
          </WireflowButton>
        </div>
      </form>
    </div>
  );
}

function maskEmail(email: string | undefined): string {
  if (!email) return "확인 중";
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
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
