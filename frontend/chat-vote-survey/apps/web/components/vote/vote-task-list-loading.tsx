import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import styles from "./vote.module.css";

const voteTaskSkeletonKeys = ["first", "second", "third"] as const;

export function VoteTaskListLoading() {
  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      contentClassName={styles.voteContent!}
      header={
        <PlatformHeader
          backAction={{ ariaLabel: "홈으로", href: "/home" }}
          className={styles.voteHeader!}
          title="투표"
        />
      }
      headerSize="compact"
    >
      <div className={`${styles.surface} ${styles.listSurface}`}>
        <VoteTaskListLoadingControls />
        <VoteTaskListLoadingCards />
      </div>
    </PlatformShell>
  );
}

export function VoteTaskListLoadingCards({
  message = "투표 목록을 불러오는 중입니다.",
}: Readonly<{ message?: string }> = {}) {
  return (
    <div aria-busy="true" aria-label={message} data-vote-task-list-loading="true" role="status">
      <ul aria-hidden="true" className={styles.taskList}>
        {voteTaskSkeletonKeys.map((key) => (
          <li className={`${styles.taskCard} ${styles.taskSkeletonCard}`} key={key}>
            <div className={styles.taskCardCopy}>
              <span className={`${styles.taskSkeletonBlock} ${styles.taskSkeletonBadge}`} />
              <span className={`${styles.taskSkeletonBlock} ${styles.taskSkeletonTitle}`} />
              <span className={`${styles.taskSkeletonBlock} ${styles.taskSkeletonSupporting}`} />
            </div>
            <span className={`${styles.taskSkeletonBlock} ${styles.taskSkeletonAction}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function VoteTaskListLoadingControls() {
  return (
    <div aria-hidden="true" className={styles.searchSection}>
      <span className={styles.searchLabel}>주제 검색</span>
      <div className={styles.searchControl}>
        <span className={styles.searchIcon} />
        <span className={`${styles.searchInput} ${styles.searchPlaceholder}`}>
          주제를 검색해 보세요
        </span>
        <span className={`${styles.searchButton} ${styles.searchButtonPlaceholder}`}>검색</span>
      </div>
      <div className={styles.filterPills}>
        <span
          className={`${styles.filterPill} ${styles.filterPillPlaceholder}`}
          data-selected="true"
        >
          진행 중
        </span>
        <span className={`${styles.filterPill} ${styles.filterPillPlaceholder}`}>완료</span>
      </div>
    </div>
  );
}
