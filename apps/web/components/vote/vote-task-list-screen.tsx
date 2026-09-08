"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { votePublishingCompletedList } from "@/lib/vote/vote-publishing-fixtures";
import {
  flattenCompletedTaskPages,
  useCompletedTasksQuery,
  useOpenTasksQuery,
  voteCompletedApiAvailable,
} from "@/lib/vote/vote-queries";
import {
  presentCompletedTask,
  presentOpenTask,
  sortCompletedTasksByLatest,
  sortOpenTasksByLatest,
  type VoteTaskListItemPresentation,
} from "@/lib/vote/vote-task-list-presentation";
import styles from "./vote.module.css";
import { VoteTaskListLoadingCards } from "./vote-task-list-loading";

type VoteTab = "active" | "completed";
const SHOW_COMPLETED_DESIGN_SAMPLE = process.env.NODE_ENV !== "production";
const VOTE_LOGIN_HREF = "/login?returnTo=%2Fvote";

export function VoteTaskListScreen() {
  const [tab, setTab] = useState<VoteTab>("active");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const openTasksQuery = useOpenTasksQuery();
  const completedTasksQuery = useCompletedTasksQuery(20, tab === "completed");
  const activeTasks = useMemo(
    () => sortOpenTasksByLatest(openTasksQuery.data ?? []).map(presentOpenTask),
    [openTasksQuery.data],
  );
  const actualCompletedTasks = useMemo(
    () =>
      sortCompletedTasksByLatest(flattenCompletedTaskPages(completedTasksQuery.data?.pages)).map(
        presentCompletedTask,
      ),
    [completedTasksQuery.data?.pages],
  );
  const completedTasks = useMemo(
    () => [
      ...(SHOW_COMPLETED_DESIGN_SAMPLE
        ? votePublishingCompletedList.map((task) => ({
            ...task,
            sourceLabel: "디자인 샘플" as const,
          }))
        : []),
      ...actualCompletedTasks,
    ],
    [actualCompletedTasks],
  );
  const source: readonly VoteTaskListItemPresentation[] =
    tab === "active" ? activeTasks : completedTasks;
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  const tasks = useMemo(
    () =>
      source.filter(
        (task) =>
          normalizedQuery.length === 0 ||
          task.title.toLocaleLowerCase("ko-KR").includes(normalizedQuery) ||
          task.supportingText.toLocaleLowerCase("ko-KR").includes(normalizedQuery),
      ),
    [normalizedQuery, source],
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput);
  }

  const showingActiveLoading = tab === "active" && openTasksQuery.isPending;
  const showingActiveError = tab === "active" && openTasksQuery.isError;
  const showingCompletedLoading =
    voteCompletedApiAvailable && tab === "completed" && completedTasksQuery.isPending;
  const showingCompletedError =
    voteCompletedApiAvailable && tab === "completed" && completedTasksQuery.isError;
  const showingBlockingLoading =
    showingActiveLoading || (showingCompletedLoading && completedTasks.length === 0);
  const showingBlockingError =
    showingActiveError || (showingCompletedError && completedTasks.length === 0);

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
        <form className={styles.searchSection} onSubmit={submitSearch} role="search">
          <label className={styles.searchLabel} htmlFor="vote-task-search">
            주제 검색
          </label>
          <div className={styles.searchControl}>
            <span aria-hidden="true" className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              id="vote-task-search"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="주제를 검색해 보세요"
              type="search"
              value={searchInput}
            />
            <button className={styles.searchButton} type="submit">
              검색
            </button>
          </div>
          <div aria-label="투표 상태" className={styles.filterPills} role="tablist">
            <button
              aria-selected={tab === "active"}
              className={styles.filterPill}
              onClick={() => setTab("active")}
              role="tab"
              type="button"
            >
              진행 중
            </button>
            <button
              aria-selected={tab === "completed"}
              className={styles.filterPill}
              onClick={() => setTab("completed")}
              role="tab"
              type="button"
            >
              완료
            </button>
          </div>
        </form>

        {showingBlockingLoading ? (
          <VoteTaskListLoadingCards
            message={
              tab === "active"
                ? "진행 중인 투표를 불러오는 중입니다."
                : "완료한 투표를 불러오는 중입니다."
            }
          />
        ) : null}
        {showingBlockingError ? (
          <VoteListFeedback
            className={styles.listFeedback!}
            error={tab === "active" ? openTasksQuery.error : completedTasksQuery.error}
            message={
              tab === "active"
                ? getOpenTaskErrorMessage(openTasksQuery.error)
                : getCompletedTaskErrorMessage(completedTasksQuery.error)
            }
            onRetry={() =>
              void (tab === "active" ? openTasksQuery.refetch() : completedTasksQuery.refetch())
            }
          />
        ) : null}
        {!showingBlockingLoading && !showingBlockingError ? (
          <>
            <ul className={styles.taskList}>
              {tasks.map((task) => (
                <VoteTaskCard key={task.taskId} task={task} />
              ))}
            </ul>
            {tasks.length === 0 ? (
              <p className={styles.emptyState}>
                {source.length === 0
                  ? tab === "active"
                    ? "진행 중인 투표가 없습니다."
                    : voteCompletedApiAvailable
                      ? "완료된 투표가 없습니다."
                      : "완료한 투표 목록은 아직 준비 중입니다."
                  : "검색 결과가 없습니다."}
              </p>
            ) : null}
            {tab === "completed" && !voteCompletedApiAvailable && completedTasks.length > 0 ? (
              <p className={styles.listInlineStatus}>
                실제 완료한 투표 목록은 아직 준비 중이며, 아래에는 디자인 샘플만 표시됩니다.
              </p>
            ) : null}
            {showingCompletedLoading ? (
              <p className={styles.listInlineStatus}>실제 완료 과업을 불러오는 중입니다.</p>
            ) : null}
            {showingCompletedError ? (
              <VoteListFeedback
                className={styles.listInlineFeedback!}
                error={completedTasksQuery.error}
                message={getCompletedTaskErrorMessage(completedTasksQuery.error)}
                onRetry={() => void completedTasksQuery.refetch()}
              />
            ) : null}
            {tab === "completed" && completedTasksQuery.hasNextPage ? (
              <div className={styles.completedListActions}>
                <button
                  className={styles.listRetryButton}
                  disabled={completedTasksQuery.isFetchingNextPage}
                  onClick={() => void completedTasksQuery.fetchNextPage()}
                  type="button"
                >
                  {completedTasksQuery.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </PlatformShell>
  );
}

function VoteTaskCard({ task }: { task: VoteTaskListItemPresentation }) {
  return (
    <li className={styles.taskCard}>
      <div className={styles.taskCardCopy}>
        <div className={styles.taskBadges}>
          <span className={styles.taskStatus}>{task.statusLabel}</span>
          {task.sourceLabel ? <span className={styles.taskSource}>{task.sourceLabel}</span> : null}
        </div>
        <h2 className={styles.taskTitle}>{task.title}</h2>
        <p className={styles.taskSupporting}>{task.supportingText}</p>
      </div>
      <Link className={styles.taskAction} href={task.actionHref}>
        {task.actionLabel}
      </Link>
    </li>
  );
}

function VoteListFeedback({
  className,
  error,
  message,
  onRetry,
}: {
  className: string;
  error: unknown;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className={className} role="alert">
      <p>{message}</p>
      {isVoteAuthenticationRequired(error) ? (
        <a
          className={styles.listRetryButton!}
          data-navigation-mode="document"
          href={VOTE_LOGIN_HREF}
        >
          로그인하기
        </a>
      ) : (
        <button className={styles.listRetryButton} onClick={onRetry} type="button">
          다시 시도
        </button>
      )}
    </div>
  );
}

function isVoteAuthenticationRequired(error: unknown): boolean {
  return error instanceof VoteApiError && error.status === 401;
}

function getOpenTaskErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인 후 과업 목록을 확인할 수 있습니다.";
    if (error.status === 403) return "과업 목록을 조회할 권한이 없습니다.";
  }
  return "과업 목록을 불러오지 못했습니다.";
}

function getCompletedTaskErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인 후 완료한 과업을 확인할 수 있습니다.";
    if (error.status === 403) return "완료한 과업을 조회할 권한이 없습니다.";
  }
  return "완료한 과업을 불러오지 못했습니다.";
}
