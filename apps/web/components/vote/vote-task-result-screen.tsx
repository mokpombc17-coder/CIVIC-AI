"use client";

import { PlatformPageShell } from "@/components/platform-page-shell";
import { getVoteCompletedApiMode } from "@/lib/vote/vote-completed-api";
import { calculateVotePercentage } from "@/lib/vote/vote-completed-contracts";
import { formatVoteDateTime } from "@/lib/vote/vote-format";
import { useTaskResultQuery } from "@/lib/vote/vote-queries";
import styles from "./vote.module.css";

export function VoteTaskResultScreen({ taskId }: { taskId: string }) {
  const resultQuery = useTaskResultQuery(taskId);
  const result = resultQuery.data;
  const options = result ? [...result.options].sort((a, b) => a.displayOrder - b.displayOrder) : [];

  return (
    <PlatformPageShell
      backAction={{ href: "/vote", ariaLabel: "완료 투표 목록으로" }}
      bottomNavigation={null}
      title="투표 결과"
    >
      <div className={styles.surface}>
        {resultQuery.isPending ? <ResultNotice>투표 결과를 불러오고 있어요.</ResultNotice> : null}
        {resultQuery.isError ? (
          <div className={styles.flow}>
            <div className={`${styles.notice} ${styles.error}`} role="alert">
              <div>
                <p>이 투표 결과를 확인할 수 없어요.</p>
                <button
                  className={styles.secondaryButton}
                  onClick={() => resultQuery.refetch()}
                  type="button"
                >
                  다시 시도
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {result ? (
          <div className={styles.flow}>
            {getVoteCompletedApiMode() === "mock" ? (
              <span className={styles.mockBadge}>결과 API Mock</span>
            ) : null}
            <section className={styles.section}>
              <p className={styles.eyebrow}>결과가 확정되었어요</p>
              <h2 className={styles.heading}>{result.title}</h2>
              <p className={styles.body}>{result.description}</p>
              <p className={styles.responseCount}>
                총 {result.responseCount.toLocaleString("ko-KR")}명이 응답했어요
              </p>
            </section>
            <hr className={styles.divider} />
            <section className={styles.section}>
              <h3 className={styles.heading}>{result.question.content}</h3>
              {result.question.description ? (
                <p className={styles.body}>{result.question.description}</p>
              ) : null}
              <div className={styles.resultBars}>
                {options.map((option) => {
                  const percentage = calculateVotePercentage(option.count, result.responseCount);
                  return (
                    <div
                      key={option.id}
                      className={option.selectedByMe ? styles.myChoice : undefined}
                    >
                      <div className={styles.resultBarHeader}>
                        <span>
                          {option.content}
                          {option.selectedByMe ? " · 내 선택" : ""}
                        </span>
                        <strong>{percentage.toFixed(1)}%</strong>
                      </div>
                      <div
                        aria-label={`${option.content} ${percentage.toFixed(1)}%`}
                        className={styles.track}
                        role="img"
                      >
                        <div
                          className={styles.fill}
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </div>
                      <p className={styles.counter}>{option.count.toLocaleString("ko-KR")}명</p>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className={styles.summary}>
              <div>
                <p className={styles.summaryLabel}>내가 선택한 이유</p>
                <p className={styles.summaryValue}>{result.mySubmission.finalReason}</p>
              </div>
              <div>
                <p className={styles.summaryLabel}>참여 일시</p>
                <p className={styles.summaryValue}>
                  {formatVoteDateTime(result.mySubmission.submittedAt)}
                </p>
              </div>
            </section>
            <p className={styles.body}>
              이 결과는 {formatVoteDateTime(result.finalizedAt)}에 확정되었어요.
            </p>
          </div>
        ) : null}
      </div>
    </PlatformPageShell>
  );
}

function ResultNotice({ children }: { children: string }) {
  return (
    <div className={styles.flow}>
      <div className={styles.notice}>{children}</div>
    </div>
  );
}
