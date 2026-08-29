"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { WireflowButton, WireflowField } from "@/components/wireflow/wireflow-primitives";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { mainScreenPrimaryActions } from "./main-screen-actions";
import { ScreenFrame } from "./screen-frame";

type SurveyAnswers = Readonly<Record<string, unknown>>;
type SurveyAnswerKey =
  | "gender"
  | "address"
  | "region"
  | "birth_year"
  | "marital_status"
  | "housing_type"
  | "household_income"
  | "education"
  | "occupation"
  | "lifestyle"
  | "preferred_media"
  | "moral_orientation"
  | "political_ideology"
  | "supporting_party"
  | "central_government_trust"
  | "local_government_trust";

type Profile = {
  user_id: string;
  email: string;
  role: string;
  account_state: string;
  preferred_language: string;
  rag_answer_detail: string;
  two_factor_enabled: boolean;
  response_version: number;
  questionnaire_answers?: SurveyAnswers;
  survey_answers?: SurveyAnswers;
} & Partial<Record<SurveyAnswerKey, string | number | null>>;

type SecurityIntent = "password" | "2fa" | null;
type ProfileSettings = {
  preferredLanguage: "ko" | "en";
  answerDetail: "concise" | "balanced" | "detailed";
};
type SurveySection = Readonly<{
  title: string;
  items: readonly Readonly<{ label: string; value: string }>[];
}>;
type SurveySectionDefinition = Readonly<{
  title: string;
  items: readonly Readonly<{ key: SurveyAnswerKey; label: string }>[];
}>;

const initialProfileSettings: ProfileSettings = {
  preferredLanguage: "ko",
  answerDetail: "balanced",
};

const surveySectionDefinitions: readonly SurveySectionDefinition[] = Object.freeze([
  {
    title: "기본 정보",
    items: [
      { key: "gender", label: "성별" },
      { key: "address", label: "주소지" },
      { key: "birth_year", label: "출생연도" },
      { key: "marital_status", label: "혼인상태" },
      { key: "housing_type", label: "주거형태" },
    ],
  },
  {
    title: "사회·경제",
    items: [
      { key: "household_income", label: "가구소득" },
      { key: "education", label: "학력" },
      { key: "occupation", label: "직업" },
    ],
  },
  {
    title: "성향·매체",
    items: [
      { key: "lifestyle", label: "생활양식" },
      { key: "preferred_media", label: "선호매체" },
      { key: "moral_orientation", label: "도덕적 성향" },
    ],
  },
  {
    title: "정치·기관 인식",
    items: [
      { key: "political_ideology", label: "정치 성향" },
      { key: "supporting_party", label: "지지정당" },
      { key: "central_government_trust", label: "중앙정부 신뢰도" },
      { key: "local_government_trust", label: "지방정부 신뢰도" },
    ],
  },
]);

export function AccountFunctionalScreen({ screen }: Readonly<{ screen: ScreenDefinition }>) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [securityIntent, setSecurityIntent] = useState<SecurityIntent>(null);
  const [profileSettings, setProfileSettings] = useState(initialProfileSettings);

  useEffect(() => {
    if (screen.id === "U-ACCOUNT-001") return;
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
  }, [screen.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const operation = data.get("operation");
    if (operation !== "deactivate" && profile === null) {
      setMessage("계정 정보를 불러온 뒤 다시 시도해 주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (operation === "profile") {
        const response = await mutation("/api/v1/account/profile", "PATCH", {
          preferred_language: data.get("preferred_language"),
          rag_answer_detail: data.get("rag_answer_detail"),
        });
        const updated = (await response.json()) as Profile;
        setProfile(updated);
        setProfileSettings(readProfileSettings(updated));
        setMessage("변경사항을 저장했습니다.");
      } else if (operation === "password") {
        if (!passwordConfirmationMatches(data)) {
          throw new Error("새 비밀번호 확인이 일치하지 않습니다.");
        }
        await mutation("/api/v1/account/password", "PUT", {
          current_password: data.get("current_password"),
          new_password: data.get("new_password"),
        });
        redirectAfterPasswordChange();
      } else if (operation === "2fa") {
        if (profile === null) throw new Error("계정 보안 상태를 불러온 뒤 다시 시도해 주세요.");
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
      } else if (operation === "deactivate") {
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
      {screen.id === "U-ACCOUNT-001" ? <AccountHubSurface /> : null}
      {screen.id === "U-ACCOUNT-002" || screen.id === "U-ACCOUNT-004" ? (
        <AccountManagementSurface
          busy={busy}
          intent={securityIntent}
          message={message}
          onIntent={setSecurityIntent}
          onProfileSettings={setProfileSettings}
          onSubmit={submit}
          profile={profile}
          settings={profileSettings}
        />
      ) : null}
      {screen.id === "U-ACCOUNT-003" ? <AccountSurveySurface profile={profile} /> : null}
      {screen.id === "U-ACCOUNT-004" ? (
        <DeactivationDialog busy={busy} message={message} onSubmit={submit} />
      ) : null}
    </ScreenFrame>
  );
}

function AccountHubSurface() {
  return (
    <div className="wf-account-hub" data-wireflow-layout="account-hub">
      <nav aria-label="계정 항목" className="wf-account-hub-menu">
        <Link className="wf-account-hub-card" href={"/mypage/profile" as Route}>
          <strong>내 정보 관리</strong>
          <span>회원정보, 비밀번호, 2단계 인증과 서비스 이용 동의를 관리합니다.</span>
        </Link>
        <Link className="wf-account-hub-card" href={"/mypage/survey" as Route}>
          <strong>내 설문 보기</strong>
          <span>가입 시 제출한 설문 응답을 확인합니다.</span>
        </Link>
      </nav>
      <div className="wf-account-logout">
        <LogoutButton />
      </div>
    </div>
  );
}

function AccountManagementSurface({
  busy,
  intent,
  message,
  onIntent,
  onProfileSettings,
  onSubmit,
  profile,
  settings,
}: Readonly<{
  busy: boolean;
  intent: SecurityIntent;
  message: string;
  onIntent: (intent: SecurityIntent) => void;
  onProfileSettings: Dispatch<SetStateAction<ProfileSettings>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  profile: Profile | null;
  settings: ProfileSettings;
}>) {
  const loaded = profile !== null;
  return (
    <div className="wf-account-management" data-wireflow-layout="account-management">
      <form className="wf-account-profile-form" id="wf-account-profile-form" onSubmit={onSubmit}>
        <input name="operation" type="hidden" value="profile" />
        <AccountSection title="회원정보 수정">
          <div className="wf-account-fields">
            <label className="civic-field">
              <span>이메일</span>
              <input placeholder="불러오는 중…" readOnly value={profile?.email ?? ""} />
            </label>
            <label className="civic-field">
              <span>선호 언어</span>
              <select
                disabled={!loaded}
                name="preferred_language"
                onChange={(event) =>
                  onProfileSettings((value) => ({
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
              <span>AI 답변 상세도</span>
              <select
                disabled={!loaded}
                name="rag_answer_detail"
                onChange={(event) =>
                  onProfileSettings((value) => ({
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
          </div>
        </AccountSection>
      </form>

      <section aria-labelledby="wf-account-security-title" className="wf-account-section">
        <h2 id="wf-account-security-title">보안</h2>
        <div className="wf-account-security-list">
          <SecurityAction
            actionLabel="변경하기"
            description="변경하면 모든 기기에서 다시 로그인해야 합니다."
            onAction={() => onIntent(intent === "password" ? null : "password")}
            title="비밀번호 변경"
          />
          <SecurityAction
            actionLabel={profile?.two_factor_enabled ? "인증 해제하기" : "인증 설정하기"}
            disabled={busy || !loaded}
            description={
              profile?.two_factor_enabled
                ? "이메일 코드 인증을 사용하고 있습니다."
                : "이메일 코드를 활용하여 보안을 강화합니다."
            }
            onAction={() => onIntent(intent === "2fa" ? null : "2fa")}
            title="2단계 인증"
          />
        </div>
        {intent ? (
          <SecurityForm
            busy={busy}
            intent={intent}
            onSubmit={onSubmit}
            twoFactorEnabled={profile?.two_factor_enabled === true}
          />
        ) : null}
      </section>

      <section aria-labelledby="wf-account-consent-title" className="wf-account-section">
        <div className="wf-account-panel wf-account-consents">
          <header>
            <h2 id="wf-account-consent-title">서비스 이용 동의</h2>
          </header>
          <label className="wf-account-choice">
            <input checked readOnly type="checkbox" />
            <span>서비스 이용약관 동의</span>
          </label>
          <label className="wf-account-choice">
            <input checked readOnly type="checkbox" />
            <span>계정·RAG 개인정보 수집·이용 동의</span>
          </label>
          {message ? (
            <p aria-live="polite" className="civic-form-message">
              {message}
            </p>
          ) : null}
          <button
            aria-label="변경사항 저장"
            className="wf-button wf-button-primary wf-account-submit"
            disabled={busy || !loaded}
            form="wf-account-profile-form"
            type="submit"
          >
            {!loaded ? "불러오는 중…" : busy ? "처리 중…" : "변경사항 저장"}
          </button>
        </div>
      </section>

      <section aria-labelledby="wf-account-deactivate-title" className="wf-account-notice">
        <InfoIcon />
        <div>
          <h2 id="wf-account-deactivate-title">계정 관리</h2>
          <p>계정 비활성화의 영향과 복원 가능 범위를 확인한 뒤 진행할 수 있습니다.</p>
          <Link className="wf-button wf-button-danger" href={"/mypage/deactivate" as Route}>
            계정 비활성화
          </Link>
        </div>
      </section>
    </div>
  );
}

function AccountSection({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section aria-labelledby="wf-account-profile-title" className="wf-account-section">
      <h2 id="wf-account-profile-title">{title}</h2>
      <div className="wf-account-panel">{children}</div>
    </section>
  );
}

function SecurityAction({
  actionLabel,
  description,
  disabled = false,
  onAction,
  title,
}: Readonly<{
  actionLabel: string;
  description: string;
  disabled?: boolean;
  onAction: () => void;
  title: string;
}>) {
  return (
    <article className="wf-account-security-card">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <WireflowButton disabled={disabled} onClick={onAction} variant="secondary">
        {actionLabel}
      </WireflowButton>
    </article>
  );
}

function SecurityForm({
  busy,
  intent,
  onSubmit,
  twoFactorEnabled,
}: Readonly<{
  busy: boolean;
  intent: Exclude<SecurityIntent, null>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  twoFactorEnabled: boolean;
}>) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const frame = requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const behavior = reduceMotion ? "auto" : "smooth";
      const scroller = form.closest<HTMLElement>('[data-platform-shell-content="true"]');
      if (scroller) {
        const formTop = form.getBoundingClientRect().top;
        const scrollerTop = scroller.getBoundingClientRect().top;
        scroller.scrollTo({
          behavior,
          top: scroller.scrollTop + formTop - scrollerTop - 16,
        });
      } else {
        form.scrollIntoView({ behavior, block: "start" });
      }
      form
        .querySelector<HTMLInputElement>('input:not([type="hidden"])')
        ?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [intent]);

  return (
    <form className="wf-account-panel wf-security-form" onSubmit={onSubmit} ref={formRef}>
      <input name="operation" type="hidden" value={intent} />
      {intent === "password" || twoFactorEnabled ? (
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
      {intent === "2fa" && !twoFactorEnabled ? (
        <WireflowField
          inputMode="numeric"
          label="인증 코드 (처음에는 비워 두고 요청하세요)"
          name="code"
        />
      ) : null}
      <WireflowButton disabled={busy} type="submit">
        {busy ? "처리 중…" : intent === "password" ? "비밀번호 변경" : "설정 저장"}
      </WireflowButton>
    </form>
  );
}

function AccountSurveySurface({ profile }: Readonly<{ profile: Profile | null }>) {
  const sections = buildSurveySections(profile);
  return (
    <div className="wf-account-survey" data-wireflow-layout="account-survey">
      <section className="wf-account-notice wf-account-survey-intro">
        <InfoIcon />
        <div>
          <h2>가입 시 제출한 설문입니다.</h2>
          <p>기존 응답은 확인만 가능하며, 수정하거나 추가로 응답할 수 없습니다.</p>
        </div>
      </section>
      {sections.map((section) => (
        <section className="wf-account-survey-section" key={section.title}>
          <h2>{section.title}</h2>
          <dl>
            {section.items.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function buildSurveySections(profile: Profile | null): readonly SurveySection[] {
  if (!profile || !hasExtendedSurveyAnswers(profile)) {
    return [
      {
        title: "서비스 설정",
        items: [
          {
            label: "선호 언어",
            value: profile ? languageLabel(profile.preferred_language) : "불러오는 중…",
          },
          {
            label: "AI 답변 상세도",
            value: profile ? answerDetailLabel(profile.rag_answer_detail) : "불러오는 중…",
          },
          {
            label: "응답 버전",
            value: profile ? `${profile.response_version}차 응답` : "불러오는 중…",
          },
        ],
      },
    ];
  }
  return surveySectionDefinitions.map((section) => ({
    title: section.title,
    items: section.items.map((item) => ({
      label: item.label,
      value: surveyAnswer(profile, item.key),
    })),
  }));
}

function InfoIcon() {
  return (
    <Image
      alt=""
      className="wf-account-info-icon"
      height={24}
      src="/assets/account/info.png"
      width={24}
    />
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
        aria-labelledby="wf-deactivate-dialog-title"
        aria-modal="true"
        className="wf-account-dialog"
        onSubmit={onSubmit}
        role="alertdialog"
      >
        <input name="operation" type="hidden" value="deactivate" />
        <header>
          <h2 id="wf-deactivate-dialog-title">계정을 비활성화할까요?</h2>
          <Link aria-label="닫기" className="wf-dialog-close" href={"/mypage/profile" as Route}>
            <Image alt="" height={24} src="/assets/account/close.png" width={24} />
          </Link>
        </header>
        <p>다음 내용을 확인한 뒤 비밀번호를 입력하세요.</p>
        <dl className="wf-impact-list">
          <div>
            <dt>비활성화 영향</dt>
            <dd>AI·채팅·투표 정보가 개인 정보에 더 이상 반영되지 않습니다.</dd>
          </div>
          <div>
            <dt>보관 데이터</dt>
            <dd>작성한 정보와 활동 기록은 계정을 다시 사용할 수 있도록 보관됩니다.</dd>
          </div>
          <div>
            <dt>로그인 상태</dt>
            <dd>현재 기기를 포함한 모든 기기에서 로그아웃됩니다.</dd>
          </div>
        </dl>
        <WireflowField label="비밀번호 확인" name="password" required type="password" />
        {message ? (
          <p aria-live="polite" className="civic-form-message">
            {message}
          </p>
        ) : null}
        <div className="wf-dialog-actions">
          <Link className="wf-button wf-button-secondary" href={"/mypage/profile" as Route}>
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

function hasExtendedSurveyAnswers(profile: Profile | null): boolean {
  if (!profile) return false;
  return surveySectionDefinitions.some((section) =>
    section.items.some((item) => rawSurveyAnswer(profile, item.key) !== undefined),
  );
}

function surveyAnswer(profile: Profile, key: SurveyAnswerKey): string {
  const value = rawSurveyAnswer(profile, key);
  if (value === undefined || value === null || value === "") return "응답 없음";
  if (key === "birth_year" && typeof value === "number") return `${value}년`;
  return String(value);
}

function rawSurveyAnswer(profile: Profile, key: SurveyAnswerKey): unknown {
  const direct = profile[key];
  if (direct !== undefined) return direct;
  const nested = profile.survey_answers?.[key] ?? profile.questionnaire_answers?.[key];
  if (nested && typeof nested === "object" && "value" in nested) {
    return (nested as Readonly<{ value?: unknown }>).value;
  }
  if (nested !== undefined) return nested;
  if (key === "address") {
    return (
      profile.region ?? profile.survey_answers?.region ?? profile.questionnaire_answers?.region
    );
  }
  return undefined;
}

function languageLabel(value: string): string {
  return value === "en" ? "English" : "한국어";
}

function answerDetailLabel(value: string): string {
  if (value === "concise") return "간결하게";
  if (value === "detailed") return "상세하게";
  return "균형 있게";
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
