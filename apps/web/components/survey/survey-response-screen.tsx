"use client";

import Link from "next/link";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import type {
  SurveyAnswerInput,
  SurveyQuestion,
  SurveyResponseDetail,
} from "@/lib/survey/survey-contracts";
import { useLatestSurveyResponseQuery, useSurveyResponseQuery } from "@/lib/survey/survey-queries";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import styles from "./survey.module.css";

export function SurveyResponseScreen({ responseId }: { responseId?: string }) {
  return responseId ? <SpecificSurveyResponse responseId={responseId} /> : <LatestSurveyResponse />;
}

function LatestSurveyResponse() {
  const query = useLatestSurveyResponseQuery();
  return <SurveyResponseQueryView mode="latest" query={query} />;
}

function SpecificSurveyResponse({ responseId }: { responseId: string }) {
  const query = useSurveyResponseQuery(responseId);
  return <SurveyResponseQueryView mode="specific" query={query} />;
}

function SurveyResponseQueryView({
  mode,
  query,
}: {
  mode: "latest" | "specific";
  query: ReturnType<typeof useLatestSurveyResponseQuery>;
}) {
  return (
    <PlatformShell
      contentClassName={styles.content!}
      header={
        <PlatformHeader
          backAction={{ href: "/survey", ariaLabel: "설문 화면으로 돌아가기" }}
          title="내 설문 응답"
        />
      }
    >
      <div className={`${styles.screen} ${styles.responseScreen}`} data-survey-response-mode={mode}>
        {query.isPending ? <ResponseStatus title="응답을 불러오는 중입니다." /> : null}
        {query.isError ? (
          <ResponseStatus
            description={getResponseErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
            role="alert"
            title="응답을 불러오지 못했습니다."
          />
        ) : null}
        {query.data ? <SurveyResponseContent response={query.data} /> : null}
      </div>
    </PlatformShell>
  );
}

function SurveyResponseContent({ response }: { response: SurveyResponseDetail }) {
  const answers = new Map(response.answers.map((answer) => [answer.questionId, answer]));
  return (
    <div className={styles.sectionFields}>
      <section className={styles.statusCard}>
        <h2>제출한 설문 응답</h2>
        <p>{new Date(response.submittedAt).toLocaleString("ko-KR")} 제출</p>
      </section>
      {response.sections.map((section) => (
        <section className={styles.questionGroup} key={section.sectionKey}>
          <div className={styles.questionGroupHeader}>
            <h3>{section.title}</h3>
          </div>
          <div className={styles.questionList}>
            {section.questions.map((question) => (
              <article className={styles.questionField} key={question.questionId}>
                <p className={styles.questionLabel}>{question.title}</p>
                <ResponseAnswer answer={answers.get(question.questionId)} question={question} />
              </article>
            ))}
          </div>
        </section>
      ))}
      <div className={styles.statusActions}>
        <Link className={`${styles.action} ${styles.primaryAction}`} href="/survey">
          설문으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

function ResponseAnswer({
  answer,
  question,
}: {
  answer: SurveyAnswerInput | undefined;
  question: SurveyQuestion;
}) {
  if (!answer || answer.type !== question.type) return <p>응답 정보 없음</p>;
  switch (answer.type) {
    case "SINGLE_CHOICE":
      return <p>{findOptionLabel(question, answer.selection.optionId)}</p>;
    case "MULTIPLE_CHOICE":
      return (
        <p>
          {answer.selections
            .map((selection) => findOptionLabel(question, selection.optionId))
            .join(", ")}
        </p>
      );
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return <p>{answer.text}</p>;
    case "NUMBER":
      return <p>{answer.number.toLocaleString("ko-KR")}</p>;
    case "SCALE":
      return <p>{answer.scale}</p>;
    case "MATRIX_SINGLE_CHOICE":
      return (
        <dl>
          {answer.itemAnswers.map((itemAnswer) => (
            <div key={itemAnswer.itemId}>
              <dt>{findItemLabel(question, itemAnswer.itemId)}</dt>
              <dd>{findOptionLabel(question, itemAnswer.selection.optionId)}</dd>
            </div>
          ))}
        </dl>
      );
    case "MATRIX_SCALE":
      return (
        <dl>
          {answer.itemAnswers.map((itemAnswer) => (
            <div key={itemAnswer.itemId}>
              <dt>{findItemLabel(question, itemAnswer.itemId)}</dt>
              <dd>{itemAnswer.scale}</dd>
            </div>
          ))}
        </dl>
      );
  }
}

function findOptionLabel(question: SurveyQuestion, optionId: string): string {
  return "options" in question
    ? (question.options.find((option) => option.optionId === optionId)?.label ??
        "알 수 없는 선택지")
    : "알 수 없는 선택지";
}

function findItemLabel(question: SurveyQuestion, itemId: string): string {
  return "items" in question
    ? (question.items.find((item) => item.itemId === itemId)?.itemLabel ?? "알 수 없는 항목")
    : "알 수 없는 항목";
}

function ResponseStatus({
  description,
  onRetry,
  role = "status",
  title,
}: {
  description?: string;
  onRetry?: () => void;
  role?: "alert" | "status";
  title: string;
}) {
  return (
    <section className={styles.statusCard} role={role}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      <div className={styles.statusActions}>
        {onRetry ? (
          <button
            className={`${styles.action} ${styles.primaryAction}`}
            onClick={onRetry}
            type="button"
          >
            다시 시도
          </button>
        ) : null}
        <Link
          className={`${styles.action} ${onRetry ? styles.secondaryAction : styles.primaryAction}`}
          href="/survey"
        >
          설문으로 돌아가기
        </Link>
      </div>
    </section>
  );
}

function getResponseErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인 후 응답을 확인할 수 있습니다.";
    if (error.status === 403) return "응답을 조회할 권한이 없습니다.";
    if (error.code === "SURVEY_RESPONSE_NOT_FOUND") return "제출한 설문 응답이 없습니다.";
  }
  return "잠시 후 다시 시도해 주세요.";
}
