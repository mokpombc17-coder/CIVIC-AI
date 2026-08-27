"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getVoteCompletedApiMode } from "@/lib/vote/vote-completed-api";
import { formatVoteDate, formatVoteDateTime } from "@/lib/vote/vote-format";
import {
  flattenCompletedTaskPages,
  useCompletedTasksQuery,
  useOpenTasksQuery,
} from "@/lib/vote/vote-queries";
import { getVoteTaskApiMode } from "@/lib/vote/vote-task-mock-api";
import styles from "./vote.module.css";

type VoteTab = "active" | "completed";

export function VoteTaskListScreen() {
  const [tab, setTab] = useState<VoteTab>("active");
  const [query, setQuery] = useState("");
  const openTasks = useOpenTasksQuery();
  const completedTasks = useCompletedTasksQuery();
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  const filteredOpenTasks = useMemo(
    () =>
      (openTasks.data ?? []).filter(
        (task) =>
          normalizedQuery.length === 0 ||
          task.title.toLocaleLowerCase("ko-KR").includes(normalizedQuery) ||
          task.description?.toLocaleLowerCase("ko-KR").includes(normalizedQuery),
      ),
    [normalizedQuery, openTasks.data],
  );
  const completedItems = flattenCompletedTaskPages(completedTasks.data?.pages);

  return (
    <div className={styles.surface}>
      <div className={styles.stack}>
        {tab === "active" ? (
          <>
            {getVoteTaskApiMode() === "mock" ? (
              <span className={styles.mockBadge}>Task API Persona-ready Mock</span>
            ) : null}
            <input
              aria-label="진행 중인 투표 검색"
              className={styles.search}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="투표 제목이나 내용을 검색해 보세요"
              type="search"
              value={query}
            />
          </>
        ) : getVoteCompletedApiMode() === "mock" ? (
          <span className={styles.mockBadge}>완료·결과 API Mock</span>
        ) : null}

        <div aria-label="투표 상태" className={styles.tabs} role="tablist">
          <button
            aria-controls="active-vote-panel"
            aria-selected={tab === "active"}
            className={styles.tab}
            onClick={() => setTab("active")}
            role="tab"
            type="button"
          >
            진행 중
          </button>
          <button
            aria-controls="completed-vote-panel"
            aria-selected={tab === "completed"}
            className={styles.tab}
            onClick={() => setTab("completed")}
            role="tab"
            type="button"
          >
            완료
          </button>
        </div>

        {tab === "active" ? (
          <section aria-labelledby="active-tab" id="active-vote-panel" role="tabpanel">
            {openTasks.isPending ? (
              <VoteNotice>진행 중인 투표를 불러오고 있어요.</VoteNotice>
            ) : null}
            {openTasks.isError ? (
              <VoteFailure
                message="진행 중인 투표를 불러오지 못했어요."
                retry={() => openTasks.refetch()}
              />
            ) : null}
            {!openTasks.isPending && !openTasks.isError && filteredOpenTasks.length === 0 ? (
              <VoteNotice>
                {normalizedQuery ? "검색 결과가 없어요." : "지금 참여할 수 있는 투표가 없어요."}
              </VoteNotice>
            ) : null}
            {filteredOpenTasks.length > 0 ? (
              <ul aria-label="진행 중인 투표" className={styles.list}>
                {filteredOpenTasks.map((task) => (
                  <li key={task.taskId}>
                    <article className={styles.card}>
                      <div>
                        <h2 className={styles.cardTitle}>{task.title}</h2>
                        {task.description ? (
                          <p className={styles.cardDescription}>{task.description}</p>
                        ) : null}
                      </div>
                      <dl className={styles.meta}>
                        <div className={styles.metaRow}>
                          <dt>마감</dt>
                          <dd>{formatVoteDateTime(task.closesAt)}</dd>
                        </div>
                        {task.submission.submittedAt ? (
                          <div className={styles.metaRow}>
                            <dt>참여</dt>
                            <dd>{formatVoteDateTime(task.submission.submittedAt)}</dd>
                          </div>
                        ) : null}
                      </dl>
                      <Link className={styles.cardAction} href={`/vote/${task.taskId}`}>
                        {task.submission.submitted ? "참여 완료 보기" : "참여하기"}
                      </Link>
                    </article>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : (
          <section id="completed-vote-panel" role="tabpanel">
            {completedTasks.isPending ? (
              <VoteNotice>완료한 투표를 불러오고 있어요.</VoteNotice>
            ) : null}
            {completedTasks.isError ? (
              <VoteFailure
                message="완료한 투표를 불러오지 못했어요."
                retry={() => completedTasks.refetch()}
              />
            ) : null}
            {!completedTasks.isPending && !completedTasks.isError && completedItems.length === 0 ? (
              <VoteNotice>결과가 확정된 완료 투표가 없어요.</VoteNotice>
            ) : null}
            {completedItems.length > 0 ? (
              <ul aria-label="완료한 투표" className={styles.list}>
                {completedItems.map((task) => (
                  <li key={task.taskId}>
                    <article className={styles.card}>
                      <div>
                        <h2 className={styles.cardTitle}>{task.title}</h2>
                        <p className={styles.cardDescription}>{task.description}</p>
                      </div>
                      <dl className={styles.meta}>
                        <div className={styles.metaRow}>
                          <dt>마감일</dt>
                          <dd>{formatVoteDate(task.closedAt)}</dd>
                        </div>
                        <div className={styles.metaRow}>
                          <dt>내 참여일</dt>
                          <dd>{formatVoteDate(task.mySubmission.submittedAt)}</dd>
                        </div>
                      </dl>
                      <Link
                        className={`${styles.cardAction} ${styles.completedAction}`}
                        href={`/vote/${task.taskId}/result`}
                      >
                        결과보기
                      </Link>
                    </article>
                  </li>
                ))}
              </ul>
            ) : null}
            {completedTasks.hasNextPage ? (
              <button
                className={styles.secondaryButton}
                disabled={completedTasks.isFetchingNextPage}
                onClick={() => completedTasks.fetchNextPage()}
                type="button"
              >
                {completedTasks.isFetchingNextPage ? "불러오는 중…" : "완료 투표 더 보기"}
              </button>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}

function VoteNotice({ children }: { children: string }) {
  return <div className={styles.notice}>{children}</div>;
}

function VoteFailure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className={`${styles.notice} ${styles.error}`} role="alert">
      <div>
        <p>{message}</p>
        <button className={styles.secondaryButton} onClick={retry} type="button">
          다시 시도
        </button>
      </div>
    </div>
  );
}
