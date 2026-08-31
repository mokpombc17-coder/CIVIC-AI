"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { WireflowButton } from "@/components/wireflow/wireflow-primitives";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import {
  buildVoteSurveySubmission,
  orderedSurveyOptions,
  orderedSurveyQuestions,
  resolveVoteSurveySubmissionAttempt,
  surveyFieldName,
  surveyOtherFieldName,
  type VoteCurrentSurvey,
  type VoteSurveyQuestion,
  type VoteSurveyRule,
  type VoteSurveySubmissionAttempt,
} from "@/lib/vote/participant-survey";

const voteSurveyRequestTimeoutMs = 15_000;

type SurveyQuestionSection = Readonly<{
  title: string;
  questions: readonly VoteSurveyQuestion[];
}>;

const surveyInputSectionRules: readonly Readonly<{ title: string; pattern: RegExp }>[] = [
  {
    title: "일반 개인정보",
    pattern: /출생|만 나이|성별|주소지|행정구역|거주 지역/u,
  },
  {
    title: "가구 정보",
    pattern: /혼인|가족 구성|가구원|자녀/u,
  },
  {
    title: "생활 · 경제",
    pattern: /주거형태|주택|직업|학력|가구\s*소득|건강 상태|종교/u,
  },
  {
    title: "가치 · 정치 성향",
    pattern: /도덕|정치 성향|지지정당|정치.*관심/u,
  },
  {
    title: "미디어 · 의견 성향",
    pattern: /선호매체|뉴스.*경로|의견.*(고집|유지)|소득.*만족/u,
  },
  {
    title: "사회 · 기관 신뢰",
    pattern: /감정적 거리|호감|사회.*신뢰|지방정부.*신뢰|중앙정부.*신뢰/u,
  },
  {
    title: "매체 이용 · 정보 습관",
    pattern: /매체별.*시간|TV|라디오|SNS|OTT|관심 주제 콘텐츠|동영상 콘텐츠|정보 실천|생활양식/u,
  },
];

export function VoteSurveySurface() {
  const [survey, setSurvey] = useState<VoteCurrentSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const submissionAttempt = useRef<VoteSurveySubmissionAttempt | null>(null);

  useEffect(() => {
    let active = true;
    loadVoteSurvey()
      .then((loadedSurvey) => {
        if (!active) return;
        setSurvey(loadedSurvey);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSurvey(null);
        setMessage(errorMessage(error, "설문을 불러오지 못했습니다."));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [reloadVersion]);

  useEffect(() => {
    if (survey?.submitted) location.replace("/account");
  }, [survey?.submitted]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!survey || survey.submitted) return;
    setSubmitting(true);
    setMessage("");
    try {
      const submission = buildVoteSurveySubmission(survey, new FormData(event.currentTarget));
      const attempt = resolveVoteSurveySubmissionAttempt(submissionAttempt.current, submission);
      submissionAttempt.current = attempt;
      await submitVoteSurvey(submission, attempt.key);
      submissionAttempt.current = null;
      location.assign("/account");
    } catch (error) {
      setMessage(errorMessage(error, "설문을 제출하지 못했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <SurveyStatus message="현재 설문을 불러오는 중입니다…" tone="loading" />;
  }
  if (!survey) {
    return (
      <SurveyStatus
        actionLabel="다시 불러오기"
        message={message}
        onAction={() => reloadSurvey(setLoading, setMessage, setReloadVersion)}
        tone="error"
      />
    );
  }
  if (survey.submitted) {
    return <SurveyStatus message="계정 화면으로 이동하고 있습니다…" tone="loading" />;
  }

  const sections = groupSurveyQuestions(survey.content.questions);
  return (
    <form
      className="wf-account-survey wf-vote-survey-form"
      data-wireflow-layout="account-survey"
      onSubmit={submit}
    >
      <header className="sr-only">
        <h2>{survey.content.name}</h2>
        {survey.content.description ? <p>{survey.content.description}</p> : null}
        <p>{surveyRequirementMessage(survey)}</p>
      </header>
      {sections.map((section) => (
        <section className="wf-vote-survey-section" key={section.title}>
          <h2>{section.title}</h2>
          <div className="wf-vote-survey-questions">
            {section.questions.map((question) => (
              <VoteSurveyQuestionField
                disabled={submitting}
                key={question.id}
                question={question}
              />
            ))}
          </div>
        </section>
      ))}
      {message ? (
        <div aria-live="polite" className="civic-form-alert" role="status">
          <strong>응답을 확인해 주세요</strong>
          <p>{message}</p>
        </div>
      ) : null}
      <WireflowButton className="wf-vote-survey-submit" disabled={submitting} type="submit">
        {submitting ? "제출 중…" : "설문 최종 제출"}
      </WireflowButton>
      <p className="wf-vote-survey-final-notice">
        최종 제출 후에는 현재 회차의 응답을 수정하거나 다시 제출할 수 없습니다.
      </p>
    </form>
  );
}

function VoteSurveyQuestionField({
  disabled,
  question,
}: Readonly<{
  disabled: boolean;
  question: VoteSurveyQuestion;
}>) {
  const legendId = `survey-question-${question.id}`;
  return (
    <fieldset aria-labelledby={legendId} className="wf-vote-survey-question" disabled={disabled}>
      <legend id={legendId}>
        {question.prompt}
        {question.required ? <span className="sr-only">(필수)</span> : null}
      </legend>
      {question.description ? <p>{question.description}</p> : null}
      <VoteSurveyAnswerField question={question} />
    </fieldset>
  );
}

function VoteSurveyAnswerField({ question }: Readonly<{ question: VoteSurveyQuestion }>) {
  const inputName = surveyFieldName(question.id, fieldKind(question));
  if (question.type === "SINGLE_CHOICE") {
    return <VoteSurveySingleChoice inputName={inputName} question={question} />;
  }
  if (question.type === "MULTIPLE_CHOICE") {
    return (
      <div className="wf-vote-survey-options">
        {orderedSurveyOptions(question.options).map((option) => (
          <div className="wf-vote-survey-option" key={option.id}>
            <label>
              <input name={inputName} type="checkbox" value={option.id} />
              <span>{option.label}</span>
            </label>
            {option.kind === "OTHER" ? (
              <input
                aria-label={`${question.prompt} 기타 내용`}
                name={surveyOtherFieldName(question.id, option.id)}
                placeholder="기타 내용을 입력해 주세요"
                type="text"
              />
            ) : null}
          </div>
        ))}
        <p className="wf-vote-survey-rule">{multipleChoiceRuleLabel(question.rule)}</p>
      </div>
    );
  }
  if (question.type === "SHORT_TEXT") {
    return (
      <input
        aria-label={question.prompt}
        maxLength={question.rule.maxLength ?? undefined}
        name={inputName}
        placeholder="응답을 입력해 주세요"
        required={question.required}
        type="text"
      />
    );
  }
  if (question.type === "LONG_TEXT") {
    return (
      <textarea
        aria-label={question.prompt}
        maxLength={question.rule.maxLength ?? undefined}
        name={inputName}
        placeholder="응답을 입력해 주세요"
        required={question.required}
        rows={5}
      />
    );
  }
  if (question.type === "NUMBER") {
    return (
      <input
        aria-label={question.prompt}
        inputMode={question.rule.decimalAllowed === false ? "numeric" : "decimal"}
        max={question.rule.maximum ?? undefined}
        min={question.rule.minimum ?? undefined}
        name={inputName}
        required={question.required}
        step={numberStep(question.rule)}
        type="number"
      />
    );
  }

  const values = scaleValues(question.rule);
  if (values.length === 0) {
    return (
      <input
        aria-label={question.prompt}
        inputMode="numeric"
        max={question.rule.maximum ?? undefined}
        min={question.rule.minimum ?? undefined}
        name={inputName}
        required={question.required}
        step={1}
        type="number"
      />
    );
  }
  return (
    <div className="wf-vote-survey-scale">
      <div>
        {values.map((value) => (
          <label key={value}>
            <input name={inputName} type="radio" value={value} />
            <span>{value}</span>
          </label>
        ))}
      </div>
      <p>
        <span>{question.rule.minimumLabel ?? "낮음"}</span>
        <span>{question.rule.maximumLabel ?? "높음"}</span>
      </p>
    </div>
  );
}

function VoteSurveySingleChoice({
  inputName,
  question,
}: Readonly<{ inputName: string; question: VoteSurveyQuestion }>) {
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const options = orderedSurveyOptions(question.options);
  const selectedOption = options.find((option) => option.id === selectedOptionId);
  return (
    <div className="wf-vote-survey-single-choice">
      <select
        aria-label={question.prompt}
        name={inputName}
        onChange={(event) => setSelectedOptionId(event.currentTarget.value)}
        required={question.required}
        value={selectedOptionId}
      >
        <option disabled value="">
          선택
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {selectedOption?.kind === "OTHER" ? (
        <input
          aria-label={`${question.prompt} 기타 내용`}
          name={surveyOtherFieldName(question.id, selectedOption.id)}
          placeholder="기타 내용을 입력해 주세요"
          required
          type="text"
        />
      ) : null}
    </div>
  );
}

function SurveyStatus({
  actionLabel,
  message,
  onAction,
  tone,
}: Readonly<{
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  tone: "error" | "loading";
}>) {
  return (
    <div className="wf-account-survey" data-wireflow-layout="account-survey">
      <section aria-live="polite" className={`wf-account-notice wf-vote-survey-status is-${tone}`}>
        <div>
          <h2>{tone === "loading" ? "설문 확인 중" : "설문을 표시할 수 없습니다"}</h2>
          <p>{message}</p>
          {actionLabel && onAction ? (
            <WireflowButton onClick={onAction} variant="secondary">
              {actionLabel}
            </WireflowButton>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export async function loadVoteSurvey(
  request: typeof fetch = authenticatedFetch,
  timeoutMs: number = voteSurveyRequestTimeoutMs,
): Promise<VoteCurrentSurvey> {
  const currentResponse = await requestWithTimeout(
    request,
    "/api/v1/me/surveys/current",
    { cache: "no-store" },
    timeoutMs,
  );
  if (!currentResponse.ok) {
    throw new Error(await responseProblem(currentResponse, "현재 설문을 불러오지 못했습니다."));
  }
  return (await currentResponse.json()) as VoteCurrentSurvey;
}

async function submitVoteSurvey(
  submission: ReturnType<typeof buildVoteSurveySubmission>,
  idempotencyKey: string,
  request: typeof fetch = authenticatedFetch,
  timeoutMs: number = voteSurveyRequestTimeoutMs,
): Promise<void> {
  const response = await requestWithTimeout(
    request,
    "/api/v1/me/survey-responses",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(submission),
    },
    timeoutMs,
  );
  if (!response.ok) {
    throw new Error(await responseProblem(response, "설문을 최종 제출하지 못했습니다."));
  }
}

async function responseProblem(response: Response, fallback: string): Promise<string> {
  const problem = (await response.json().catch(() => null)) as Readonly<{
    detail?: unknown;
    violations?: readonly Readonly<{ message?: unknown }>[];
  }> | null;
  const violation = problem?.violations?.find(
    (item) => typeof item.message === "string" && item.message.trim(),
  )?.message;
  if (typeof violation === "string") return violation;
  return typeof problem?.detail === "string" && problem.detail.trim() ? problem.detail : fallback;
}

function fieldKind(question: VoteSurveyQuestion): "number" | "scale" | "selection" | "text" {
  if (question.type === "NUMBER") return "number";
  if (question.type === "SCALE") return "scale";
  if (question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE") return "selection";
  return "text";
}

export function groupSurveyQuestions(
  questions: readonly VoteSurveyQuestion[],
): readonly SurveyQuestionSection[] {
  const fallbackTitle = "설문 항목";
  const groups = new Map<string, VoteSurveyQuestion[]>();

  for (const question of orderedSurveyQuestions(questions)) {
    const title =
      surveyInputSectionRules.find((rule) => rule.pattern.test(question.prompt))?.title ??
      fallbackTitle;
    const group = groups.get(title);
    if (group) group.push(question);
    else groups.set(title, [question]);
  }

  return [...surveyInputSectionRules.map((rule) => rule.title), fallbackTitle].flatMap((title) => {
    const groupedQuestions = groups.get(title);
    return groupedQuestions ? [{ title, questions: groupedQuestions }] : [];
  });
}

function surveyRequirementMessage(survey: VoteCurrentSurvey): string {
  if (survey.eligibility.surveyRequirement === "REQUIRED") {
    return "서비스 이용을 계속하려면 모든 질문에 응답해 주세요.";
  }
  return "응답 내용은 최종 제출되며, 제출 후에는 수정할 수 없습니다.";
}

function multipleChoiceRuleLabel(rule: VoteSurveyRule): string {
  const minimum = rule.minimumSelections ?? 1;
  const maximum = rule.maximumSelections;
  return typeof maximum === "number"
    ? `${minimum}개 이상 ${maximum}개 이하 선택`
    : `${minimum}개 이상 선택`;
}

function numberStep(rule: VoteSurveyRule): number | "any" {
  if (rule.decimalAllowed === false) return 1;
  const scale = rule.decimalScale;
  if (typeof scale !== "number" || scale < 0 || scale > 10) return "any";
  return 10 ** -scale;
}

function scaleValues(rule: VoteSurveyRule): readonly number[] {
  const minimum = rule.minimum;
  const maximum = rule.maximum;
  if (
    typeof minimum !== "number" ||
    typeof maximum !== "number" ||
    !Number.isInteger(minimum) ||
    !Number.isInteger(maximum) ||
    maximum < minimum ||
    maximum - minimum > 20
  ) {
    return [];
  }
  return Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function requestWithTimeout(
  request: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await request(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("설문 응답 시간이 초과되었습니다. 다시 시도해 주세요.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function reloadSurvey(
  setLoading: (value: boolean) => void,
  setMessage: (value: string) => void,
  setReloadVersion: (update: (value: number) => number) => void,
): void {
  setLoading(true);
  setMessage("");
  setReloadVersion((value) => value + 1);
}
