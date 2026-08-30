"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Route } from "next";
import Link from "next/link";
import { WireflowButton } from "@/components/wireflow/wireflow-primitives";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import {
  buildVoteSurveySubmission,
  formatStoredSurveyAnswer,
  orderedSurveyOptions,
  orderedSurveyQuestions,
  resolveVoteSurveySubmissionAttempt,
  surveyFieldName,
  surveyOtherFieldName,
  type VoteCurrentSurvey,
  type VoteSurveyQuestion,
  type VoteSurveyResponseDetail,
  type VoteSurveyRule,
  type VoteSurveySubmissionAttempt,
} from "@/lib/vote/participant-survey";

const voteSurveyRequestTimeoutMs = 15_000;

export function VoteSurveySurface() {
  const [survey, setSurvey] = useState<VoteCurrentSurvey | null>(null);
  const [response, setResponse] = useState<VoteSurveyResponseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const submissionAttempt = useRef<VoteSurveySubmissionAttempt | null>(null);

  useEffect(() => {
    let active = true;
    loadVoteSurvey()
      .then((loaded) => {
        if (!active) return;
        setSurvey(loaded.survey);
        setResponse(loaded.response);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSurvey(null);
        setResponse(null);
        setMessage(errorMessage(error, "Vote 설문을 불러오지 못했습니다."));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [reloadVersion]);

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
      setLoading(true);
      setReloadVersion((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error, "설문을 제출하지 못했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <SurveyStatus message="Vote 서버에서 현재 설문을 불러오는 중입니다…" tone="loading" />;
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
    if (!response) {
      return (
        <SurveyStatus
          actionLabel="다시 불러오기"
          message={message || "제출한 설문 응답을 불러오지 못했습니다."}
          onAction={() => reloadSurvey(setLoading, setMessage, setReloadVersion)}
          tone="error"
        />
      );
    }
    return <SubmittedVoteSurvey response={response} />;
  }

  const questions = orderedSurveyQuestions(survey.content.questions);
  return (
    <form
      className="wf-account-survey wf-vote-survey-form"
      data-wireflow-layout="account-survey"
      onSubmit={submit}
    >
      <section className="wf-account-notice wf-account-survey-intro">
        <div>
          <h2>Vote 서버의 현재 설문입니다.</h2>
          <p>{surveyRequirementMessage(survey)}</p>
        </div>
      </section>
      <header className="wf-vote-survey-heading">
        <p>
          {survey.round.roundNumber}차 설문 · {questions.length}개 질문
        </p>
        <h2>{survey.content.name}</h2>
        {survey.content.description ? <p>{survey.content.description}</p> : null}
      </header>
      <div className="wf-vote-survey-questions">
        {questions.map((question, index) => (
          <VoteSurveyQuestionField
            disabled={submitting}
            index={index + 1}
            key={question.id}
            question={question}
          />
        ))}
      </div>
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
  index,
  question,
}: Readonly<{
  disabled: boolean;
  index: number;
  question: VoteSurveyQuestion;
}>) {
  const legendId = `survey-question-${question.id}`;
  return (
    <fieldset aria-labelledby={legendId} className="wf-vote-survey-question" disabled={disabled}>
      <legend id={legendId}>
        <span>{index}</span>
        {question.prompt}
        {question.required ? <b aria-label="필수">필수</b> : null}
      </legend>
      {question.description ? <p>{question.description}</p> : null}
      <VoteSurveyAnswerField question={question} />
    </fieldset>
  );
}

function VoteSurveyAnswerField({ question }: Readonly<{ question: VoteSurveyQuestion }>) {
  const inputName = surveyFieldName(question.id, fieldKind(question));
  if (question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE") {
    const inputType = question.type === "SINGLE_CHOICE" ? "radio" : "checkbox";
    return (
      <div className="wf-vote-survey-options">
        {orderedSurveyOptions(question.options).map((option) => (
          <div className="wf-vote-survey-option" key={option.id}>
            <label>
              <input name={inputName} type={inputType} value={option.id} />
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
        {question.type === "MULTIPLE_CHOICE" ? (
          <p className="wf-vote-survey-rule">{multipleChoiceRuleLabel(question.rule)}</p>
        ) : null}
      </div>
    );
  }
  if (question.type === "SHORT_TEXT") {
    return (
      <input
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

function SubmittedVoteSurvey({ response }: Readonly<{ response: VoteSurveyResponseDetail }>) {
  const answers = new Map(response.answers.map((answer) => [answer.questionId, answer]));
  return (
    <div className="wf-account-survey" data-wireflow-layout="account-survey">
      <section className="wf-account-notice wf-account-survey-intro">
        <div>
          <h2>Vote 설문 제출이 완료되었습니다.</h2>
          <p>당시 적용된 질문과 최종 응답을 읽기 전용으로 표시합니다.</p>
        </div>
      </section>
      <header className="wf-vote-survey-heading">
        <p>
          {response.roundNumber}차 설문 · {formatSubmittedAt(response.submittedAt)} 제출
        </p>
        <h2>{response.content.name}</h2>
        {response.content.description ? <p>{response.content.description}</p> : null}
      </header>
      <section className="wf-account-survey-section">
        <h2>내 응답</h2>
        <dl>
          {orderedSurveyQuestions(response.content.questions).map((question) => (
            <div key={question.id}>
              <dt>{question.prompt}</dt>
              <dd>{formatStoredSurveyAnswer(question, answers.get(question.id))}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Link className="wf-button wf-button-primary wf-vote-survey-home" href={"/home" as Route}>
        홈으로 이동
      </Link>
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
): Promise<Readonly<{ survey: VoteCurrentSurvey; response: VoteSurveyResponseDetail | null }>> {
  const currentResponse = await requestWithTimeout(
    request,
    "/api/v1/me/surveys/current",
    { cache: "no-store" },
    timeoutMs,
  );
  if (!currentResponse.ok) {
    throw new Error(
      await responseProblem(currentResponse, "현재 Vote 설문을 불러오지 못했습니다."),
    );
  }
  const survey = (await currentResponse.json()) as VoteCurrentSurvey;
  if (!survey.submitted) return { survey, response: null };

  const latestResponse = await requestWithTimeout(
    request,
    "/api/v1/me/survey-responses/latest",
    { cache: "no-store" },
    timeoutMs,
  );
  if (!latestResponse.ok) {
    throw new Error(
      await responseProblem(latestResponse, "제출한 Vote 설문을 불러오지 못했습니다."),
    );
  }
  return { survey, response: (await latestResponse.json()) as VoteSurveyResponseDetail };
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

function surveyRequirementMessage(survey: VoteCurrentSurvey): string {
  if (survey.eligibility.surveyRequirement === "REQUIRED") {
    return "서비스 이용을 계속하려면 모든 질문에 응답해 주세요.";
  }
  return "응답 내용은 Vote 서버에 최종 제출되며, 제출 후에는 수정할 수 없습니다.";
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

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
      throw new Error("Vote 서버 응답 시간이 초과되었습니다. 다시 시도해 주세요.");
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
