"use client";

import type { ReactNode } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import {
  calculateVotePercentage,
  type MyTaskResult,
  type OpinionMapArea,
  type OpinionMapResponse,
} from "@/lib/vote/vote-completed-contracts";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { votePublishingResult } from "@/lib/vote/vote-publishing-fixtures";
import { useTaskResultQuery, voteCompletedApiAvailable } from "@/lib/vote/vote-queries";
import styles from "./vote.module.css";

type VoteResultSource = "api" | "mock";
type VoteResultMockOpinionMapStatus = "AVAILABLE" | "PENDING";
type VoteResultPresentation = Readonly<{
  background: string;
  question: string;
  responseCount: number;
  mySubmission: Readonly<{
    selectedOption: string;
    reason: string;
  }>;
  opinionMap: OpinionMapResponse;
  options: ReadonlyArray<
    Readonly<{
      id: string;
      content: string;
      count: number;
    }>
  >;
}>;

export function VoteTaskResultScreen({
  mockOpinionMapStatus = "AVAILABLE",
  showAiBadges = false,
  source = "api",
  taskId,
}: {
  mockOpinionMapStatus?: VoteResultMockOpinionMapStatus;
  showAiBadges?: boolean;
  source?: VoteResultSource;
  taskId: string;
}) {
  if (source === "mock") {
    return (
      <VoteTaskResultView
        result={presentPublishingResult(mockOpinionMapStatus)}
        showAiBadges={showAiBadges}
        taskId={taskId}
      />
    );
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
  showAiBadges,
  taskId,
}: {
  result: VoteResultPresentation;
  showAiBadges: boolean;
  taskId: string;
}) {
  return (
    <VoteTaskResultShell taskId={taskId}>
      <VoteTaskResultContent result={result} showAiBadges={showAiBadges} />
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

function VoteTaskResultContent({
  result,
  showAiBadges = false,
}: {
  result: VoteResultPresentation;
  showAiBadges?: boolean;
}) {
  const aiSummaryCopyClassName = showAiBadges
    ? `${styles.resultQualitativeCopy} ${styles.resultBadgedCopy}`
    : styles.resultQualitativeCopy;

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
      <div className={styles.resultQualitativeSummary}>
        <section className={styles.resultTaskSummary}>
          <span className={styles.resultSummaryBadge}>내 제출</span>
          <div className={`${styles.resultQualitativeCopy} ${styles.resultBadgedCopy}`}>
            <h3>{result.mySubmission.selectedOption}</h3>
            <p className={styles.resultQualitativeText}>{result.mySubmission.reason}</p>
          </div>
        </section>
        <OpinionMapSummary
          copyClassName={aiSummaryCopyClassName}
          opinionMap={result.opinionMap}
          showAiBadges={showAiBadges}
        />
      </div>
    </>
  );
}

function OpinionMapSummary({
  copyClassName,
  opinionMap,
  showAiBadges,
}: {
  copyClassName: string | undefined;
  opinionMap: OpinionMapResponse;
  showAiBadges: boolean;
}) {
  if (opinionMap.status !== "AVAILABLE") {
    return (
      <section className={styles.resultTaskSummary}>
        <div className={styles.resultQualitativeCopy}>
          {opinionMap.status === "PENDING" ? (
            <h3 className={styles.resultPendingHeading}>
              <span
                aria-hidden="true"
                className={styles.resultPendingSpinner}
                data-opinion-map-spinner="true"
              />
              <span>참여자 의견 요약</span>
            </h3>
          ) : (
            <h3>참여자 의견 요약</h3>
          )}
          <p className={styles.resultQualitativeText} role="status">
            {opinionMap.status === "PENDING"
              ? "참여자들의 의견을 요약하고 있어요."
              : "이번 투표에서는 의견 요약을 제공할 수 없어요."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <OpinionMapAreaSummary
        area={opinionMap.sameChoice}
        copyClassName={copyClassName}
        emptyMessage="같은 선택을 한 참여자 응답이 없어요."
        heading="같은 선택을 한 사람들은 어떤 이유를 들었을까요?"
        showAiBadge={showAiBadges}
      />
      <OpinionMapAreaSummary
        area={opinionMap.otherChoices}
        copyClassName={copyClassName}
        emptyMessage="다른 선택을 한 참여자 응답이 없어요."
        heading="다른 선택을 한 사람들은 어떤 이유를 들었을까요?"
        showAiBadge={showAiBadges}
      />
    </>
  );
}

function OpinionMapAreaSummary({
  area,
  copyClassName,
  emptyMessage,
  heading,
  showAiBadge,
}: {
  area: OpinionMapArea;
  copyClassName: string | undefined;
  emptyMessage: string;
  heading: string;
  showAiBadge: boolean;
}) {
  const body =
    area.status === "AVAILABLE"
      ? area.body
      : area.status === "NO_RESPONSES"
        ? emptyMessage
        : "요약할 수 있는 응답 이유가 충분하지 않아요.";

  return (
    <section className={styles.resultTaskSummary}>
      {showAiBadge ? <span className={styles.resultSummaryBadge}>AI</span> : null}
      <div className={copyClassName}>
        <h3>{heading}</h3>
        <p className={styles.resultQualitativeText}>{body}</p>
      </div>
    </section>
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

function presentPublishingResult(
  opinionMapStatus: VoteResultMockOpinionMapStatus,
): VoteResultPresentation {
  const selectedOption = votePublishingResult.options.find(
    ({ id }) => id === votePublishingResult.mySubmission.selectedOptionId,
  );

  return {
    background: votePublishingResult.title,
    question: votePublishingResult.question,
    responseCount: votePublishingResult.responseCount,
    mySubmission: {
      selectedOption: selectedOption?.content ?? "",
      reason: votePublishingResult.mySubmission.finalReason,
    },
    opinionMap:
      opinionMapStatus === "PENDING"
        ? {
            status: "PENDING",
            sameChoice: null,
            otherChoices: null,
          }
        : {
            status: "AVAILABLE",
            sameChoice: {
              status: "AVAILABLE",
              body: votePublishingResult.qualitativeSummary.sameChoice,
            },
            otherChoices: {
              status: "AVAILABLE",
              body: votePublishingResult.qualitativeSummary.differentChoices,
            },
          },
    options: votePublishingResult.options,
  };
}

function presentApiResult(result: MyTaskResult): VoteResultPresentation {
  const options = [...result.options].sort((left, right) => left.displayOrder - right.displayOrder);

  return {
    background: result.description || result.title,
    question: result.question.content,
    responseCount: result.responseCount,
    mySubmission: {
      selectedOption:
        options.find(({ id }) => id === result.mySubmission.selectedOptionId)?.content ?? "",
      reason: result.mySubmission.finalReason,
    },
    opinionMap: result.opinionMap,
    options: options.map(({ id, content, count }) => ({ id, content, count })),
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
