"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformLoadMoreButton, PlatformShell } from "@/components/platform-shell";
import { useFeatureFailureAnalytics } from "@/components/use-feature-failure-analytics";
import { usePressFeedbackNavigation } from "@/components/use-press-feedback-navigation";
import { getFeatureFailureDetails } from "@/lib/analytics/feature-failure-analytics";
import { isVoteAuthenticationRequired, VoteApiError } from "@/lib/vote/vote-fetch";
import { votePublishingCompletedList } from "@/lib/vote/vote-publishing-fixtures";
import {
  flattenCompletedTaskPages,
  useCompletedTasksQuery,
  useOpenTasksQuery,
  useTaskSearchQuery,
  voteCompletedApiAvailable,
  voteQueryKeys,
} from "@/lib/vote/vote-queries";
import {
  presentCompletedTask,
  presentOpenTask,
  presentSearchTask,
  sortCompletedTasksByLatest,
  sortOpenTasksUnsubmittedFirst,
  type VoteTaskListItemPresentation,
} from "@/lib/vote/vote-task-list-presentation";
import {
  getVoteLoginHref,
  getVoteTaskListHref,
  getVoteTaskSearchHref,
  type VoteTaskListTab,
  type VoteTaskListView,
} from "@/lib/vote/vote-task-list-navigation";
import styles from "./vote.module.css";
import { VoteTaskListLoadingCards } from "./vote-task-list-loading";

const SHOW_COMPLETED_DESIGN_SAMPLE = process.env.NODE_ENV !== "production";

export function VoteTaskListScreen({
  initialQuery = "",
  initialTab = "active",
  initialView,
}: {
  initialQuery?: string;
  initialTab?: VoteTaskListTab;
  initialView?: VoteTaskListView;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tab = initialTab;
  const query = initialQuery.trim();
  const hasSearchQuery = query.length > 0;
  const view = initialView ?? (hasSearchQuery ? "search" : "list");
  const showingSearchResults = view === "search";
  const failureAnalytics = useFeatureFailureAnalytics(
    "vote",
    showingSearchResults ? "task-list:search" : `task-list:${tab}`,
  );
  const [searchInput, setSearchInput] = useState(query);
  const openTasksQuery = useOpenTasksQuery(!showingSearchResults && tab === "active");
  const completedTasksQuery = useCompletedTasksQuery(
    20,
    !showingSearchResults && tab === "completed",
  );
  const searchTasksQuery = useTaskSearchQuery(query, 20, hasSearchQuery);
  const activeTasks = useMemo(
    () => sortOpenTasksUnsubmittedFirst(openTasksQuery.data ?? []).map(presentOpenTask),
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
  const searchTasks = useMemo(
    () =>
      flattenCompletedTaskPages(searchTasksQuery.data?.pages).map((task) =>
        presentSearchTask(task),
      ),
    [searchTasksQuery.data?.pages],
  );
  const tasks: readonly VoteTaskListItemPresentation[] = showingSearchResults
    ? searchTasks
    : tab === "active"
      ? activeTasks
      : completedTasks;

  function selectTab(nextTab: VoteTaskListTab) {
    if (!showingSearchResults && nextTab === tab) return;

    router.replace(getVoteTaskListHref(nextTab, query), { scroll: false });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = searchInput.trim();
    if (nextQuery.length === 0) {
      if (hasSearchQuery) {
        router.replace(
          showingSearchResults ? getVoteTaskSearchHref(tab, "") : getVoteTaskListHref(tab),
          { scroll: false },
        );
      }
      return;
    }
    if (nextQuery === query && showingSearchResults) {
      void searchTasksQuery.refetch();
      return;
    }
    router.replace(getVoteTaskSearchHref(tab, nextQuery), { scroll: false });
  }

  function changeSearchInput(value: string) {
    setSearchInput(value);
    if (hasSearchQuery && value.trim().length === 0) {
      router.replace(
        showingSearchResults ? getVoteTaskSearchHref(tab, "") : getVoteTaskListHref(tab),
        { scroll: false },
      );
    }
  }

  function selectSearchResults() {
    if (showingSearchResults) {
      void searchTasksQuery.refetch();
      return;
    }
    router.replace(getVoteTaskSearchHref(tab, query), { scroll: false });
  }

  const showingActiveLoading = tab === "active" && openTasksQuery.isPending;
  const showingActiveError = tab === "active" && openTasksQuery.isError;
  const showingSearchLoading = showingSearchResults && hasSearchQuery && searchTasksQuery.isPending;
  const showingSearchError = showingSearchResults && hasSearchQuery && searchTasksQuery.isError;
  const showingCompletedLoading =
    !showingSearchResults &&
    voteCompletedApiAvailable &&
    tab === "completed" &&
    completedTasksQuery.isPending;
  const showingCompletedError =
    !showingSearchResults &&
    voteCompletedApiAvailable &&
    tab === "completed" &&
    completedTasksQuery.isError;
  const showingBlockingLoading = showingSearchResults
    ? showingSearchLoading
    : showingActiveLoading || (showingCompletedLoading && completedTasks.length === 0);
  const showingBlockingError = showingSearchResults
    ? showingSearchError && searchTasks.length === 0
    : showingActiveError || (showingCompletedError && completedTasks.length === 0);
  const visibleListError = showingSearchResults
    ? searchTasksQuery.isError
    : tab === "active"
      ? openTasksQuery.isError
      : showingCompletedError;
  const visibleListErrorValue = showingSearchResults
    ? searchTasksQuery.error
    : tab === "active"
      ? openTasksQuery.error
      : completedTasksQuery.error;
  const visibleListFailureCount = showingSearchResults
    ? searchTasksQuery.failureCount
    : tab === "active"
      ? openTasksQuery.failureCount
      : completedTasksQuery.failureCount;
  const visibleListSuccess = showingSearchResults
    ? searchTasksQuery.isSuccess
    : tab === "active"
      ? openTasksQuery.isSuccess
      : completedTasksQuery.isSuccess;
  const listSurface = showingSearchResults
    ? "search_task_list"
    : tab === "active"
      ? "active_task_list"
      : "completed_task_list";

  useEffect(() => {
    if (visibleListError) {
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(visibleListErrorValue, "api", "vote_list_load_failed"),
        incidentKey: "screen-load",
        operation: "screen_load",
        retryCount: Math.max(0, visibleListFailureCount - 1),
        surface: listSurface,
      });
      return;
    }
    if (visibleListSuccess) failureAnalytics.trackRecovered("screen-load");
  }, [
    failureAnalytics,
    listSurface,
    visibleListError,
    visibleListErrorValue,
    visibleListFailureCount,
    visibleListSuccess,
  ]);

  function retryVisibleTaskList() {
    failureAnalytics.trackRecoveryAttempt("screen-load", "user_retry");
    if (
      showingSearchResults &&
      searchTasksQuery.error instanceof VoteApiError &&
      searchTasksQuery.error.code === "INVALID_CURSOR"
    ) {
      void queryClient.resetQueries({ queryKey: voteQueryKeys.taskSearch(query), exact: true });
      return;
    }
    void (showingSearchResults
      ? searchTasksQuery.refetch()
      : tab === "active"
        ? openTasksQuery.refetch()
        : completedTasksQuery.refetch());
  }

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
              maxLength={200}
              onChange={(event) => changeSearchInput(event.target.value)}
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
              aria-selected={!showingSearchResults && tab === "active"}
              className={styles.filterPill}
              onClick={() => selectTab("active")}
              role="tab"
              type="button"
            >
              진행 중
            </button>
            <button
              aria-selected={!showingSearchResults && tab === "completed"}
              className={styles.filterPill}
              onClick={() => selectTab("completed")}
              role="tab"
              type="button"
            >
              완료
            </button>
            <button
              aria-selected={showingSearchResults}
              className={styles.filterPill}
              onClick={selectSearchResults}
              role="tab"
              type="button"
            >
              검색 결과
            </button>
          </div>
        </form>

        {showingBlockingLoading ? (
          <VoteTaskListLoadingCards
            message={
              showingSearchResults
                ? "투표 검색 결과를 불러오는 중입니다."
                : tab === "active"
                  ? "진행 중인 투표를 불러오는 중입니다."
                  : "완료한 투표를 불러오는 중입니다."
            }
          />
        ) : null}
        {showingBlockingError ? (
          <VoteListFeedback
            className={styles.listFeedback!}
            error={visibleListErrorValue}
            message={
              showingSearchResults
                ? getSearchTaskErrorMessage(searchTasksQuery.error)
                : tab === "active"
                  ? getOpenTaskErrorMessage(openTasksQuery.error)
                  : getCompletedTaskErrorMessage(completedTasksQuery.error)
            }
            onRetry={retryVisibleTaskList}
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
              !showingSearchResults && tab === "completed" && !voteCompletedApiAvailable ? (
                <VoteTaskListEmptyState
                  description="준비가 끝나면 여기에서 확인할 수 있어요."
                  icon="completed"
                  message="완료한 투표 목록은 아직 준비 중이에요"
                />
              ) : showingSearchResults ? (
                <VoteTaskListEmptyState
                  description="다른 검색어로 다시 찾아보세요."
                  icon="search"
                  message="검색어와 일치하는 투표가 없어요"
                />
              ) : tab === "active" ? (
                <VoteTaskListEmptyState
                  description="새 투표가 열리면 여기에서 참여할 수 있어요."
                  icon="active"
                  message="현재 참여 가능한 투표가 없어요"
                />
              ) : (
                <VoteTaskListEmptyState
                  description="참여한 투표의 결과만 확인할 수 있어요."
                  icon="completed"
                  message="아직 확인할 수 있는 투표 결과가 없어요"
                />
              )
            ) : null}
            {!showingSearchResults &&
            tab === "completed" &&
            !voteCompletedApiAvailable &&
            completedTasks.length > 0 ? (
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
                onRetry={retryVisibleTaskList}
              />
            ) : null}
            {showingSearchError && searchTasks.length > 0 ? (
              <VoteListFeedback
                className={styles.listInlineFeedback!}
                error={searchTasksQuery.error}
                message={getSearchTaskErrorMessage(searchTasksQuery.error)}
                onRetry={retryVisibleTaskList}
              />
            ) : null}
            {showingSearchResults ? (
              <PlatformLoadMoreButton
                hasNextPage={searchTasksQuery.hasNextPage}
                isFetching={searchTasksQuery.isFetchingNextPage}
                label="더 보기"
                onClick={() => void searchTasksQuery.fetchNextPage()}
              />
            ) : tab === "completed" ? (
              <PlatformLoadMoreButton
                hasNextPage={completedTasksQuery.hasNextPage}
                isFetching={completedTasksQuery.isFetchingNextPage}
                label="더 보기"
                onClick={() => void completedTasksQuery.fetchNextPage()}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </PlatformShell>
  );
}

function VoteTaskListEmptyState({
  description,
  icon,
  message,
}: Readonly<{
  description: string;
  icon: "active" | "completed" | "search";
  message: string;
}>) {
  return (
    <div className={styles.voteEmptyState} data-vote-task-empty-state={icon}>
      <span aria-hidden="true" className={styles.voteEmptyStateVisual}>
        <svg className={styles.voteEmptyStateIcon} fill="none" viewBox="0 0 20 20">
          {icon === "active" ? (
            <>
              <rect
                height="13"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.7"
                width="13"
                x="3.5"
                y="3.5"
              />
              <circle cx="7.5" cy="8" r="1" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M10.5 8h3m-6 4h-1m4 0h3"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.7"
              />
              <circle cx="7.5" cy="12" r="1" stroke="currentColor" strokeWidth="1.5" />
            </>
          ) : icon === "completed" ? (
            <path
              d="M4.5 15.5v-5m5.5 5v-11m5.5 11v-8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
            />
          ) : (
            <>
              <circle cx="8.5" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="m12 12 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            </>
          )}
        </svg>
      </span>
      <p className={styles.voteEmptyStateCopy}>
        <span className={styles.voteEmptyStateMessage}>{message}</span>
        <span className={styles.voteEmptyStateDescription}>{description}</span>
      </p>
    </div>
  );
}

function VoteTaskCard({ task }: { task: VoteTaskListItemPresentation }) {
  const pressNavigation = usePressFeedbackNavigation(task.actionHref);

  return (
    <li aria-disabled={task.actionHref ? undefined : true} className={styles.taskCard}>
      {task.actionHref ? (
        <Link
          aria-label={`${task.title} ${task.actionLabel}`}
          className={`${styles.taskCardLink} select-none [-webkit-touch-callout:none]`}
          draggable={false}
          href={task.actionHref}
          {...pressNavigation}
          title={task.title}
        />
      ) : null}
      <div className={styles.taskCardSurface}>
        <div className={styles.taskCardCopy}>
          <div className={styles.taskBadges}>
            <span className={styles.taskStatus}>{task.statusLabel}</span>
            {task.sourceLabel ? (
              <span className={styles.taskSource}>{task.sourceLabel}</span>
            ) : null}
          </div>
          <h2 className={styles.taskTitle}>{task.title}</h2>
          <p className={styles.taskSupporting}>{task.supportingText}</p>
        </div>
        <span
          aria-hidden="true"
          className={styles.taskAction}
          data-disabled={task.actionHref ? undefined : true}
        >
          {task.actionLabel}
        </span>
      </div>
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
          href={getVoteLoginHref("/vote")}
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

function getSearchTaskErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인 후 투표를 검색할 수 있습니다.";
    if (error.code === "INVALID_CURSOR") {
      return "검색 결과가 변경되었습니다. 처음부터 다시 불러와 주세요.";
    }
    if (error.code === "INVALID_REQUEST") return "검색어를 다시 확인해 주세요.";
  }
  return "투표 검색 결과를 불러오지 못했습니다.";
}
