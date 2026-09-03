"use client";

import type { ReactNode } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import { calculateVotePercentage, type MyTaskResult } from "@/lib/vote/vote-completed-contracts";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { votePublishingResult } from "@/lib/vote/vote-publishing-fixtures";
import { useTaskResultQuery, voteCompletedApiAvailable } from "@/lib/vote/vote-queries";
import styles from "./vote.module.css";

type VoteResultSource = "api" | "mock";
type VoteResultPresentation = Readonly<{
  background: string;
  question: string;
  responseCount: number;
  sourceLabel: "디자인 샘플" | "실제 응답 결과";
  options: ReadonlyArray<
    Readonly<{
      id: string;
      content: string;
      count: number;
    }>
  >;
}>;

export function VoteTaskResultScreen({
  source = "api",
  taskId,
}: {
  source?: VoteResultSource;
  taskId: string;
}) {
  if (source === "mock") {
    return <VoteTaskResultView result={presentPublishingResult()} taskId={taskId} />;
  }

  return <ApiVoteTaskResult taskId={taskId} />;
}

function ApiVoteTaskResult({ taskId }: { taskId: string }) {
  const resultQuery = useTaskResultQuery(taskId);

  return (
    <VoteTaskResultShell taskId={taskId}>
      {!voteCompletedApiAvailable ? (
        <ResultFeedback message="투표 결과 기능은 아직 준비 중입니다." />
      ) : null}
      {voteCompletedApiAvailable && resultQuery.isPending ? (
        <ResultFeedback message="투표 결과를 불러오는 중입니다." />
      ) : null}
      {voteCompletedApiAvailable && resultQuery.isError ? (
        <ResultFeedback
          message={getTaskResultErrorMessage(resultQuery.error)}
          onRetry={() => void resultQuery.refetch()}
        />
      ) : null}
      {voteCompletedApiAvailable && resultQuery.data ? (
        <VoteTaskResultContent result={presentApiResult(resultQuery.data)} />
      ) : null}
    </VoteTaskResultShell>
  );
}

function VoteTaskResultView({
  result,
  taskId,
}: {
  result: VoteResultPresentation;
  taskId: string;
}) {
  return (
    <VoteTaskResultShell taskId={taskId}>
      <VoteTaskResultContent result={result} />
    </VoteTaskResultShell>
  );
}

function VoteTaskResultShell({ children, taskId }: { children: ReactNode; taskId: string }) {
  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      contentClassName={styles.voteContent!}
      header={
        <PlatformHeader
          backAction={{ href: "/vote", ariaLabel: "완료 투표 목록으로" }}
          title="투표 결과보기"
        />
      }
      headerSize="compact"
    >
      <div className={`${styles.surface} ${styles.resultSurface}`} data-task-id={taskId}>
        {children}
      </div>
    </PlatformShell>
  );
}

function VoteTaskResultContent({ result }: { result: VoteResultPresentation }) {
  return (
    <>
      <section className={styles.resultTaskSummary}>
        <h2>주제</h2>
        <dl className={styles.resultTaskCard}>
          <div>
            <dt>배경</dt>
            <dd>{result.background}</dd>
          </div>
          <div>
            <dt>질문</dt>
            <dd>{result.question}</dd>
          </div>
        </dl>
      </section>
      <div className={styles.resultDivider} />
      <section className={styles.resultMetric}>
        <span>전체 응답자 수</span>
        <strong>{result.responseCount.toLocaleString("ko-KR")}명</strong>
      </section>
      <section className={styles.resultChartFrame}>
        <figure className={styles.resultChart}>
          <figcaption>
            <span>{result.sourceLabel}</span>
            <strong>투표 결과</strong>
          </figcaption>
          <ol className={styles.resultOptions}>
            {result.options.map((option) => {
              const percentage = calculateVotePercentage(option.count, result.responseCount);
              return (
                <li className={styles.resultOption} key={option.id}>
                  <div className={styles.resultOptionHeader}>
                    <span>{option.content}</span>
                    <strong>
                      {option.count.toLocaleString("ko-KR")}명 · {percentage.toFixed(1)}%
                    </strong>
                  </div>
                  <div className={styles.resultTrack}>
                    <span style={{ width: `${percentage}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
        </figure>
      </section>
    </>
  );
}

function ResultFeedback({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div aria-live="polite" className={styles.listFeedback} role={onRetry ? "alert" : "status"}>
      <p>{message}</p>
      {onRetry ? (
        <button className={styles.listRetryButton} onClick={onRetry} type="button">
          다시 시도
        </button>
      ) : null}
    </div>
  );
}

function presentPublishingResult(): VoteResultPresentation {
  return {
    background: votePublishingResult.title,
    question: votePublishingResult.question,
    responseCount: votePublishingResult.responseCount,
    sourceLabel: "디자인 샘플",
    options: votePublishingResult.options,
  };
}

function presentApiResult(result: MyTaskResult): VoteResultPresentation {
  return {
    background: result.description || result.title,
    question: result.question.content,
    responseCount: result.responseCount,
    sourceLabel: "실제 응답 결과",
    options: [...result.options]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map(({ id, content, count }) => ({ id, content, count })),
  };
}

function getTaskResultErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인 후 투표 결과를 확인할 수 있습니다.";
    if (error.status === 403) return "투표 결과를 조회할 권한이 없습니다.";
    if (error.code === "TASK_RESULT_NOT_FOUND") return "확인할 수 있는 투표 결과가 없습니다.";
    if (error.code === "TASK_RESULT_VIEW_INTEGRITY_FAILURE") {
      return "투표 결과를 표시할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    }
  }
  return "투표 결과를 불러오지 못했습니다.";
}
