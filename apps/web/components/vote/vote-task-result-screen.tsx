"use client";

import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import { votePublishingResult } from "@/lib/vote/vote-publishing-fixtures";
import styles from "./vote.module.css";

export function VoteTaskResultScreen({ taskId }: { taskId: string }) {
  const responseCount: number = votePublishingResult.responseCount;
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
    >
      <div className={`${styles.surface} ${styles.resultSurface}`} data-task-id={taskId}>
        <section className={styles.resultTaskSummary}>
          <h2>과업</h2>
          <dl className={styles.resultTaskCard}>
            <div>
              <dt>배경</dt>
              <dd>{votePublishingResult.title}</dd>
            </div>
            <div>
              <dt>질의</dt>
              <dd>{votePublishingResult.question}</dd>
            </div>
          </dl>
        </section>
        <div className={styles.resultDivider} />
        <section className={styles.resultMetric}>
          <span>전체 응답자 수</span>
          <strong>{responseCount.toLocaleString("ko-KR")}명</strong>
        </section>
        <section className={styles.resultChartFrame}>
          <figure className={styles.resultChart}>
            <figcaption>
              <span>실제 응답 결과</span>
              <strong>투표 결과</strong>
            </figcaption>
            <ol className={styles.resultOptions}>
              {votePublishingResult.options.map((option) => {
                const percentage = responseCount === 0 ? 0 : (option.count / responseCount) * 100;
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
      </div>
    </PlatformShell>
  );
}
