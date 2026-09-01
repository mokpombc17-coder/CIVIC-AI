"use client";

import Link from "next/link";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import {
  getSurveyQuestionLabel,
  sortSurveyGroups,
  sortSurveyOptions,
  sortSurveyQuestions,
  sortSurveySections,
  type SurveyQuestion,
  type SurveyResponseDetail,
} from "@/lib/survey/survey-contracts";
import { useLatestSurveyResponseQuery, useSurveyResponseQuery } from "@/lib/survey/survey-queries";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import styles from "./survey.module.css";

const RESPONSE_LOGIN_HREF = {
  pathname: "/login",
  query: { returnTo: "/survey/responses/latest" },
} as const;

export function SurveyResponseScreen({ responseId }: { responseId?: string }) {
  const latestQuery = useLatestSurveyResponseQuery(responseId === undefined);
  const detailQuery = useSurveyResponseQuery(responseId ?? "", responseId !== undefined);
  const query = responseId === undefined ? latestQuery : detailQuery;

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
      <div className={`${styles.screen} ${styles.responseScreen}`}>
        {query.isPending ? <ResponseStatus title="응답을 불러오고 있습니다." /> : null}
        {query.isError ? (
          <ResponseError error={query.error} onRetry={() => void query.refetch()} />
        ) : null}
        {query.data ? <SurveyResponseContent detail={query.data} /> : null}
      </div>
    </PlatformShell>
  );
}

function SurveyResponseContent({ detail }: { detail: SurveyResponseDetail }) {
  const answers = new Map(detail.answers.map((answer) => [answer.questionId, answer]));

  return (
    <div className={styles.responseContent}>
      <header className={styles.responseHeader}>
        <h2>{detail.content.name}</h2>
        <p>{new Date(detail.submittedAt).toLocaleString("ko-KR")} 제출</p>
      </header>
      {sortSurveySections(detail.content.sections).map((section) => (
        <section className={styles.responseSection} key={section.sectionKey}>
          <h3>{section.title}</h3>
          {sortSurveyGroups(section.groups).map((group) => (
            <div className={styles.responseGroup} key={group.groupKey}>
              <h4>{group.title}</h4>
              <dl>
                {sortSurveyQuestions(group.questions).map((question) => (
                  <div key={question.itemKey}>
                    <dt>{getSurveyQuestionLabel(group, question)}</dt>
                    <dd>{formatStoredAnswer(question, answers.get(question.questionId))}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      ))}
      <Link className={`${styles.action} ${styles.primaryAction}`} href="/survey">
        돌아가기
      </Link>
    </div>
  );
}

function formatStoredAnswer(
  question: SurveyQuestion,
  answer: SurveyResponseDetail["answers"][number] | undefined,
): string {
  if (!answer) return "응답을 확인할 수 없습니다.";
  switch (answer.type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return answer.text ?? "응답을 확인할 수 없습니다.";
    case "NUMBER":
      return answer.number === null ? "응답을 확인할 수 없습니다." : String(answer.number);
    case "SCALE":
      return answer.scale === null ? "응답을 확인할 수 없습니다." : String(answer.scale);
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE": {
      const options = new Map(
        sortSurveyOptions(question.options).map((option) => [option.optionId, option]),
      );
      const labels = answer.selections.map((selection) => {
        const option = options.get(selection.optionId);
        if (!option) return "선택지를 확인할 수 없습니다.";
        return option.kind === "OTHER" && selection.inputText
          ? `${option.label}: ${selection.inputText}`
          : option.label;
      });
      return labels.length > 0 ? labels.join(", ") : "응답을 확인할 수 없습니다.";
    }
  }
}

function ResponseError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const authenticationRequired = error instanceof VoteApiError && error.status === 401;
  const notFound =
    error instanceof VoteApiError &&
    (error.status === 404 || error.code === "SURVEY_RESPONSE_NOT_FOUND");
  const title = authenticationRequired
    ? "로그인이 필요합니다."
    : notFound
      ? "제출한 설문 응답이 없습니다."
      : "설문 응답을 불러오지 못했습니다.";

  return (
    <ResponseStatus
      action={
        authenticationRequired ? (
          <Link className={`${styles.action} ${styles.primaryAction}`} href={RESPONSE_LOGIN_HREF}>
            로그인하기
          </Link>
        ) : notFound ? (
          <Link className={`${styles.action} ${styles.primaryAction}`} href="/survey">
            설문으로 돌아가기
          </Link>
        ) : (
          <button
            className={`${styles.action} ${styles.primaryAction}`}
            onClick={onRetry}
            type="button"
          >
            다시 시도
          </button>
        )
      }
      role="alert"
      title={title}
    />
  );
}

function ResponseStatus({
  action,
  role = "status",
  title,
}: {
  action?: React.ReactNode;
  role?: "alert" | "status";
  title: string;
}) {
  return (
    <section className={styles.statusCard} role={role}>
      <h2>{title}</h2>
      {action ? <div className={styles.statusActions}>{action}</div> : null}
    </section>
  );
}
