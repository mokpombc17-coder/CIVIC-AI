"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Route } from "next";
import Link from "next/link";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { AuthFormCard, AuthInfo, AuthSupportCard } from "@/components/wireflow/auth-layouts";
import { WireflowButton } from "@/components/wireflow/wireflow-primitives";
import { mainScreenPrimaryActions } from "./main-screen-actions";
import { ScreenFrame } from "./screen-frame";

type SignupDraft = {
  email: string;
  password: string;
  passwordConfirmation: string;
  ageConfirmed: boolean;
  preferredLanguage: "ko" | "en";
  answerDetail: "concise" | "balanced" | "detailed";
  terms: boolean;
  privacy: boolean;
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
  preferredLanguage: "ko",
  answerDetail: "balanced",
  terms: false,
  privacy: false,
  documents: {},
};

const signupHistorySteps = new Set(["AUTH-002", "AUTH-003", "AUTH-004", "AUTH-005", "AUTH-006"]);

export function signupStepFromHistory(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("civicSignupStep" in value)) return null;
  const step = value.civicSignupStep;
  return typeof step === "string" && signupHistorySteps.has(step) ? step : null;
}

export function authStepAfterPopState(value: unknown, entryScreenId: string): string {
  return signupStepFromHistory(value) ?? entryScreenId;
}

export function AuthFunctionalScreen({
  screen,
  initialSearch = "",
}: Readonly<{ screen: ScreenDefinition; initialSearch?: string }>) {
  const entryRecovery = signupRecovery(screen.id, false);
  const recoveryPathname = entryRecovery?.pathname;
  const [activeId, setActiveId] = useState(screen.id);
  const [verificationKind, setVerificationKind] = useState<"SIGNUP" | "TWO_FACTOR">(() =>
    verificationKindFromSearch(initialSearch),
  );
  const [draft, setDraft] = useState<SignupDraft>(initialDraft);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [postLoginReturnTo, setPostLoginReturnTo] = useState<string | null>(() =>
    safeReturnTarget(initialSearch),
  );

  useEffect(() => {
    if (recoveryPathname) location.replace(recoveryPathname);
  }, [recoveryPathname]);

  useEffect(() => {
    if (signupHistorySteps.has(screen.id)) {
      history.replaceState({ ...history.state, civicSignupStep: screen.id }, "");
    }
    const restoreStep = (event: PopStateEvent) => {
      setActiveId(authStepAfterPopState(event.state, screen.id));
    };
    addEventListener("popstate", restoreStep);
    return () => removeEventListener("popstate", restoreStep);
  }, [screen.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (activeId === "AUTH-001") {
        const data = new FormData(event.currentTarget);
        const response = await api("/api/v1/auth/login", {
          email: data.get("email"),
          password: data.get("password"),
        });
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
        } else {
          await redirectToRoleHome(returnTo);
        }
      } else if (activeId === "AUTH-002") {
        if (draft.password !== draft.passwordConfirmation) {
          throw new Error("비밀번호 확인이 일치하지 않습니다.");
        }
        if (!draft.ageConfirmed) throw new Error("만 14세 이상 여부를 확인해 주세요.");
        const response = await api("/api/v1/signup/flows", { email: draft.email });
        const body = (await response.json()) as { flow_id?: unknown; documents?: unknown };
        if (typeof body.flow_id !== "string")
          throw new Error("가입 흐름 응답이 올바르지 않습니다.");
        const flowId = body.flow_id;
        const documents = readSignupDocuments(body.documents);
        setDraft((current) => ({ ...current, flowId, documents }));
        changeSignupStep("AUTH-003", "/signup/profile");
      } else if (activeId === "AUTH-003") {
        changeSignupStep("AUTH-004", "/signup/consent");
      } else if (activeId === "AUTH-004") {
        if (!draft.flowId || !draft.terms || !draft.privacy) {
          throw new Error("가입 흐름과 두 필수 동의를 모두 확인해 주세요.");
        }
        await api(signupCompletionPath(draft.flowId), {
          email: draft.email,
          password: draft.password,
          preferred_language: draft.preferredLanguage,
          rag_answer_detail: draft.answerDetail,
          age_14_confirmed: true,
          terms_evidence: evidence(requiredDocument(draft.documents, "TERMS")),
          privacy_evidence: evidence(requiredDocument(draft.documents, "ACCOUNT_RAG_PRIVACY")),
        });
        changeSignupStep("AUTH-006", "/signup/pending");
      } else if (activeId === "AUTH-005") {
        const data = new FormData(event.currentTarget);
        await api(
          verificationKind === "TWO_FACTOR"
            ? "/api/v1/auth/2fa/verify"
            : "/api/v1/signup/verification/verify",
          { code: data.get("code") },
        );
        if (verificationKind === "TWO_FACTOR") {
          await redirectToRoleHome(postLoginReturnTo ?? safeReturnTarget(location.search));
        } else {
          location.assign(authCompletionDestination(activeId, verificationKind) ?? "/login");
        }
      } else if (activeId === "AUTH-006") {
        changeSignupStep("AUTH-005", "/signup/verify");
      } else if (activeId === "AUTH-007" || activeId === "AUTH-009") {
        const data = new FormData(event.currentTarget);
        const prefix = activeId === "AUTH-007" ? "password-reset" : "reactivation";
        await api(`/api/v1/auth/${prefix}/request`, {
          email: data.get("email"),
          ...(activeId === "AUTH-009" ? { password: data.get("password") } : {}),
        });
        location.assign(
          activeId === "AUTH-007" ? "/password-reset/complete" : "/reactivate/complete",
        );
      } else if (activeId === "AUTH-008") {
        const data = new FormData(event.currentTarget);
        if (data.get("new_password") !== data.get("new_password_confirmation")) {
          throw new Error("새 비밀번호 확인이 일치하지 않습니다.");
        }
        await api("/api/v1/auth/password-reset/complete", {
          code: data.get("code"),
          new_password: data.get("new_password"),
        });
        location.assign(authCompletionDestination(activeId, verificationKind) ?? "/login");
      } else if (activeId === "AUTH-010") {
        const data = new FormData(event.currentTarget);
        await api("/api/v1/auth/reactivation/complete", { code: data.get("code") });
        location.assign(authCompletionDestination(activeId, verificationKind) ?? "/login");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
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
      setMessage("최신 인증 코드를 다시 보냈습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "인증 코드를 다시 보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function changeSignupStep(id: string, pathname: string) {
    history.pushState({ ...history.state, civicSignupStep: id }, "", pathname);
    setActiveId(id);
  }

  const action = mainScreenPrimaryActions[activeId] ?? mainScreenPrimaryActions[screen.id];
  return (
    <ScreenFrame
      {...(activeId === "AUTH-005" && verificationKind === "TWO_FACTOR"
        ? { backHref: "/login" as Route }
        : {})}
      platformHeading={activeId === screen.id ? "HIDDEN" : "SECONDARY"}
      screen={{ ...screen, id: activeId, canonical_title: authTitle(activeId) }}
    >
      <div
        className="civic-auth-grid"
        data-wireflow-layout={activeId === "AUTH-001" ? "auth-login" : "auth-flow"}
      >
        <AuthFormCard onSubmit={submit} title={authCardTitle(activeId)}>
          {renderFields(activeId, draft, setDraft)}
          {message ? (
            <p aria-live="polite" className="civic-form-message" role="status">
              {message}
            </p>
          ) : null}
          <WireflowButton
            className={activeId === "AUTH-001" ? "civic-auth-submit" : undefined}
            disabled={busy}
            type="submit"
          >
            {busy ? "처리 중…" : action}
          </WireflowButton>
        </AuthFormCard>
        <AuthSupport activeId={activeId} busy={busy} onResend={resendVerification} />
      </div>
    </ScreenFrame>
  );
}

function renderFields(
  id: string,
  draft: SignupDraft,
  setDraft: React.Dispatch<React.SetStateAction<SignupDraft>>,
) {
  if (id === "AUTH-001") {
    return (
      <>
        <Field label="이메일" name="email" placeholder="name@example.com" type="email" />
        <Field label="비밀번호" name="password" placeholder="비밀번호 입력" type="password" />
      </>
    );
  }
  if (id === "AUTH-002") {
    return (
      <>
        <Field
          label="이메일"
          name="email"
          type="email"
          value={draft.email}
          onChange={(value) => setDraft((v) => ({ ...v, email: value }))}
        />
        <Field
          label="비밀번호"
          name="password"
          type="password"
          value={draft.password}
          onChange={(value) => setDraft((v) => ({ ...v, password: value }))}
        />
        <Field
          label="비밀번호 확인"
          name="password_confirmation"
          type="password"
          value={draft.passwordConfirmation}
          onChange={(value) => setDraft((v) => ({ ...v, passwordConfirmation: value }))}
        />
        <p className="civic-help">영문·숫자·허용 특수문자를 포함해 8자 이상 입력하세요.</p>
        <Check
          label="만 14세 이상입니다"
          checked={draft.ageConfirmed}
          onChange={(checked) => setDraft((v) => ({ ...v, ageConfirmed: checked }))}
        />
      </>
    );
  }
  if (id === "AUTH-003") {
    return (
      <>
        <SelectField
          label="선호 언어"
          value={draft.preferredLanguage}
          options={["ko", "en"]}
          onChange={(value) => setDraft((v) => ({ ...v, preferredLanguage: value as "ko" | "en" }))}
        />
        <SelectField
          label="RAG 답변 상세도"
          value={draft.answerDetail}
          options={["concise", "balanced", "detailed"]}
          onChange={(value) =>
            setDraft((v) => ({ ...v, answerDetail: value as SignupDraft["answerDetail"] }))
          }
        />
        <p className="civic-help">만 14세 이상임을 확인하고 다음 단계로 이동합니다.</p>
      </>
    );
  }
  if (id === "AUTH-004") {
    const terms = draft.documents.TERMS;
    const privacy = draft.documents.ACCOUNT_RAG_PRIVACY;
    return (
      <fieldset className="civic-consent-fieldset">
        <legend>필수 동의 2건</legend>
        <ConsentDocumentLink document={terms} label="서비스 이용약관" />
        <Check
          label="이용약관에 동의합니다"
          checked={draft.terms}
          onChange={(checked) => setDraft((v) => ({ ...v, terms: checked }))}
        />
        <ConsentDocumentLink document={privacy} label="계정·RAG 개인정보 수집·이용" />
        <Check
          label="계정·RAG 개인정보 처리에 동의합니다"
          checked={draft.privacy}
          onChange={(checked) => setDraft((v) => ({ ...v, privacy: checked }))}
        />
      </fieldset>
    );
  }
  if (id === "AUTH-005" || id === "AUTH-010")
    return <Field label="인증 코드" name="code" inputMode="numeric" />;
  if (id === "AUTH-006")
    return (
      <div className="civic-auth-pending">
        <strong>가입 이메일을 확인해 주세요.</strong>
        <p>메일이 늦게 도착하면 60초 뒤 다시 요청할 수 있습니다.</p>
        <Link href={"/signup/verify" as Route}>인증 코드 입력</Link>
      </div>
    );
  if (id === "AUTH-007") return <Field label="가입 이메일" name="email" type="email" />;
  if (id === "AUTH-009")
    return (
      <>
        <Field label="가입 이메일" name="email" type="email" />
        <Field label="현재 비밀번호" name="password" type="password" />
        <p className="civic-help">
          등록 이메일 인증까지 완료하면 기존 계정 데이터가 다시 연결됩니다.
        </p>
      </>
    );
  if (id === "AUTH-008")
    return (
      <>
        <Field label="인증 코드" name="code" inputMode="numeric" />
        <Field label="새 비밀번호" name="new_password" type="password" />
        <Field label="새 비밀번호 확인" name="new_password_confirmation" type="password" />
      </>
    );
  return <p>요청 정보를 확인한 뒤 계속 진행하세요.</p>;
}

function AuthSupport({
  activeId,
  busy,
  onResend,
}: Readonly<{ activeId: string; busy: boolean; onResend: () => void }>) {
  if (activeId === "AUTH-005" || activeId === "AUTH-006") {
    return (
      <AuthInfo
        actionLabel="코드 재발송"
        body="메일함과 스팸함을 확인하세요. 60초 뒤 다시 받을 수 있습니다."
        disabled={busy}
        onAction={onResend}
        title="코드가 오지 않았나요?"
      />
    );
  }
  if (activeId === "AUTH-008") {
    return (
      <AuthInfo
        actionHref={"/password-reset" as Route}
        actionLabel="이메일 재발송"
        body="인증 코드가 만료되었거나 일치하지 않으면 이메일로 다시 받을 수 있습니다."
        title="새 코드가 필요한가요?"
      />
    );
  }
  if (activeId !== "AUTH-001") return null;
  return (
    <aside aria-label="로그인 보조 행동" className="civic-auth-support">
      <AuthSupportCard
        badge="복구"
        description="등록 이메일로 인증 코드 발송"
        href={"/password-reset" as Route}
        linkLabel="비밀번호 재설정"
        slot="auth-reset"
        title="비밀번호 재설정"
      />
      <AuthSupportCard
        badge="신규"
        description="계정 정보부터 입력"
        href={"/signup/account" as Route}
        linkLabel="회원가입"
        slot="auth-signup"
        title="회원가입"
      />
    </aside>
  );
}

function authTitle(id: string): string {
  return (
    {
      "AUTH-001": "로그인",
      "AUTH-002": "계정 정보",
      "AUTH-003": "개인정보·설문 입력",
      "AUTH-004": "필수 동의 및 가입 확인",
      "AUTH-005": "이메일 인증",
      "AUTH-006": "이메일 인증",
      "AUTH-007": "비밀번호 재설정 요청",
      "AUTH-008": "새 비밀번호 설정",
      "AUTH-009": "계정 재활성화",
      "AUTH-010": "계정 재활성화",
    }[id] ?? "인증"
  );
}

function authCardTitle(id: string): string {
  if (id === "AUTH-001") return "계정 정보";
  if (id === "AUTH-002") return "필수 입력";
  if (id === "AUTH-003") return "응답 설정";
  if (id === "AUTH-004") return "필수 동의";
  if (id === "AUTH-006") return "인증 대기";
  if (id === "AUTH-005" || id === "AUTH-006") return "인증 코드 입력";
  if (id === "AUTH-007") return "등록 이메일";
  if (id === "AUTH-008") return "비밀번호 재설정";
  if (id === "AUTH-009" || id === "AUTH-010") return "재활성화 본인 확인";
  return "요청 정보";
}

function Field({
  label,
  name,
  type = "text",
  value,
  inputMode,
  placeholder,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string;
  inputMode?: "numeric";
  placeholder?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="civic-field">
      <span>{label}</span>
      <input
        autoComplete={
          type === "password" ? "current-password" : name === "email" ? "email" : "one-time-code"
        }
        inputMode={inputMode}
        name={name}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        placeholder={placeholder}
        required
        type={type}
        value={onChange ? value : undefined}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="civic-field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="civic-check">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function evidence(document: SignupDocument) {
  return {
    document_id: document.document_id,
    document_version: document.document_version,
    body_sha256: document.body_sha256,
    accepted_at: new Date().toISOString(),
    path: document.path,
  };
}

function ConsentDocumentLink({
  document,
  label,
}: Readonly<{ document: SignupDocument | undefined; label: string }>) {
  if (!document) return <p className="civic-help">{label} 문서를 불러오지 못했습니다.</p>;
  return (
    <p className="civic-help">
      <a href={document.path} rel="noopener noreferrer" target="_blank">
        {label} 전문 보기
      </a>{" "}
      <span>버전 {document.document_version}</span>
    </p>
  );
}

function readSignupDocuments(value: unknown): SignupDraft["documents"] {
  if (!value || typeof value !== "object") {
    throw new Error("필수 동의 문서를 불러오지 못했습니다.");
  }
  const result: SignupDraft["documents"] = {};
  for (const id of ["TERMS", "ACCOUNT_RAG_PRIVACY"] as const) {
    const candidate = (value as Record<string, unknown>)[id];
    if (!candidate || typeof candidate !== "object") {
      throw new Error("필수 동의 문서를 불러오지 못했습니다.");
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
      throw new Error("필수 동의 문서 응답이 올바르지 않습니다.");
    }
    result[id] = document as unknown as SignupDocument;
  }
  return result;
}

function requiredDocument(
  documents: SignupDraft["documents"],
  id: SignupDocumentId,
): SignupDocument {
  const document = documents[id];
  if (!document) throw new Error("필수 동의 문서를 다시 확인해 주세요.");
  return document;
}

async function api(path: string, body: unknown): Promise<Response> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(problem.detail ?? "요청을 처리하지 못했습니다.");
  }
  return response;
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

export function authCompletionDestination(
  screenId: string,
  verificationKind: "SIGNUP" | "TWO_FACTOR",
): "/login" | null {
  if (screenId === "AUTH-005" && verificationKind === "SIGNUP") return "/login";
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
    role?: unknown;
    must_change_password?: unknown;
  };
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
