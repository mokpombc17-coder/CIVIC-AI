"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import {
  votePublishingActiveList,
  votePublishingCompletedList,
  type VotePublishingListItem,
} from "@/lib/vote/vote-publishing-fixtures";
import styles from "./vote.module.css";

type VoteTab = "active" | "completed";

export function VoteTaskListScreen() {
  const [tab, setTab] = useState<VoteTab>("active");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const source = tab === "active" ? votePublishingActiveList : votePublishingCompletedList;
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

        <ul className={styles.taskList}>
          {tasks.map((task) => (
            <VoteTaskCard key={task.taskId} task={task} />
          ))}
        </ul>
        {tasks.length === 0 ? <p className={styles.emptyState}>검색 결과가 없습니다.</p> : null}
      </div>
    </PlatformShell>
  );
}

function VoteTaskCard({ task }: { task: VotePublishingListItem }) {
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
