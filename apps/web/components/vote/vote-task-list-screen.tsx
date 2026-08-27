"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { votePublishingCompletedList } from "@/lib/vote/vote-publishing-fixtures";
import { useOpenTasksQuery } from "@/lib/vote/vote-queries";
import {
  presentOpenTask,
  type VoteTaskListItemPresentation,
} from "@/lib/vote/vote-task-list-presentation";
import styles from "./vote.module.css";

type VoteTab = "active" | "completed";

export function VoteTaskListScreen() {
  const [tab, setTab] = useState<VoteTab>("active");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const openTasksQuery = useOpenTasksQuery();
  const activeTasks = useMemo(
    () => openTasksQuery.data?.map(presentOpenTask) ?? [],
    [openTasksQuery.data],
  );
  const source: readonly VoteTaskListItemPresentation[] =
    tab === "active" ? activeTasks : votePublishingCompletedList;
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

  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      contentClassName={styles.voteContent!}
      header={<PlatformHeader className={styles.voteHeader!} leading={null} title="투표" />}
    >
      <div className={`${styles.surface} ${styles.listSurface}`}>
        <form className={styles.searchSection} onSubmit={submitSearch} role="search">
          <label className={styles.searchLabel} htmlFor="vote-task-search">
            과업 검색
          </label>
          <div className={styles.searchControl}>
            <span aria-hidden="true" className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              id="vote-task-search"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="과업을 검색해 주세요."
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

        {showingActiveLoading ? (
          <p className={styles.emptyState}>과업 목록을 불러오는 중입니다.</p>
        ) : null}
        {showingActiveError ? (
          <div className={styles.listFeedback} role="alert">
            <p>{getOpenTaskErrorMessage(openTasksQuery.error)}</p>
            <button
              className={styles.listRetryButton}
              onClick={() => void openTasksQuery.refetch()}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : null}
        {!showingActiveLoading && !showingActiveError ? (
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
                    ? "진행 중인 과업이 없습니다."
                    : "완료한 과업이 없습니다."
                  : "검색 결과가 없습니다."}
              </p>
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
        <span className={styles.taskStatus}>{task.statusLabel}</span>
        <h2 className={styles.taskTitle}>{task.title}</h2>
        <p className={styles.taskSupporting}>{task.supportingText}</p>
      </div>
      <Link className={styles.taskAction} href={task.actionHref}>
        {task.actionLabel}
      </Link>
    </li>
  );
}

function getOpenTaskErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인 후 과업 목록을 확인할 수 있습니다.";
    if (error.status === 403) return "과업 목록을 조회할 권한이 없습니다.";
  }
  return "과업 목록을 불러오지 못했습니다.";
}
