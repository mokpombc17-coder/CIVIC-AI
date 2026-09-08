import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import styles from "./vote.module.css";

const voteTaskOptionSkeletonKeys = ["first", "second", "third", "fourth"] as const;
const voteTaskInfoSkeletonKeys = ["background", "question", "deadline"] as const;

export function VoteTaskScreenLoading() {
  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      contentClassName={styles.voteContent!}
      header={
        <PlatformHeader
          backAction={{ ariaLabel: "투표 목록으로", href: "/vote" }}
          className={styles.voteHeader!}
          title="투표 참여하기"
        />
      }
      headerSize="compact"
    >
      <VoteTaskScreenLoadingContent />
    </PlatformShell>
  );
}

export function VoteTaskScreenLoadingContent() {
  return (
    <div
      aria-busy="true"
      aria-label="투표 상세를 불러오는 중입니다."
      className={`${styles.surface} ${styles.flowSurface}`}
      data-vote-task-screen-loading="true"
      role="status"
    >
      <div className={styles.progressBlock}>
        <p className={styles.progressLabel}>
          <span>1/4</span>
          <strong>투표 확인</strong>
        </p>
        <div aria-hidden="true" className={styles.progressBars}>
          {[1, 2, 3, 4].map((segment) => (
            <span
              className={styles.progressBar}
              data-state={segment === 1 ? "current" : "upcoming"}
              key={segment}
            />
          ))}
        </div>
      </div>

      <div aria-hidden="true" className={styles.flowBody}>
        <section className={styles.flowSection}>
          <h2 className={styles.sectionTitle}>주제</h2>
          <dl className={`${styles.infoCard} ${styles.overviewInfoCard}`}>
            {voteTaskInfoSkeletonKeys.map((key, index) => (
              <div className={styles.infoRow} key={key}>
                <dt>
                  <span
                    className={`${styles.taskSkeletonBlock} ${styles.taskDetailSkeletonInfoLabel}`}
                  />
                </dt>
                <dd>
                  <span
                    className={`${styles.taskSkeletonBlock} ${styles.taskDetailSkeletonInfoCopy}`}
                    data-size={index === 1 ? "long" : "default"}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.flowSection}>
          <h2 className={styles.sectionTitle}>응답 선택지</h2>
          <div className={styles.overviewOptions}>
            {voteTaskOptionSkeletonKeys.map((key, index) => (
              <div
                className={styles.overviewOption}
                data-vote-task-option-skeleton="true"
                key={key}
              >
                <span>응답 선택지 {index + 1}</span>
                <span
                  className={`${styles.taskSkeletonBlock} ${styles.taskDetailSkeletonOptionCopy}`}
                  data-size={index % 2 === 0 ? "long" : "default"}
                />
              </div>
            ))}
          </div>
        </section>

        <span
          className={`${styles.taskSkeletonBlock} ${styles.taskDetailSkeletonAction}`}
          data-vote-task-action-skeleton="true"
        />
      </div>
    </div>
  );
}
