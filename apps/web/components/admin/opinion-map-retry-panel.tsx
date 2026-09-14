"use client";

import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { formatAdminDate } from "@/lib/admin/user-admin";
import {
  mergeOpinionMapUnavailableItems,
  opinionMapFailureMessage,
  requestOpinionMapRetry,
  requestOpinionMapUnavailablePage,
  type OpinionMapUnavailableItem,
} from "@/lib/admin/opinion-map-generation";

export type OpinionMapRetryPanelState =
  | Readonly<{ status: "loading" }>
  | Readonly<{
      status: "ready";
      items: readonly OpinionMapUnavailableItem[];
      nextCursor: string | null;
    }>
  | Readonly<{ status: "unavailable"; message: string }>;

export function OpinionMapRetryPanel({
  request = authenticatedFetch,
}: Readonly<{ request?: typeof fetch }>) {
  const [state, setState] = useState<OpinionMapRetryPanelState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState("");
  const [retryingTaskIds, setRetryingTaskIds] = useState<ReadonlySet<string>>(new Set());
  const retryLocks = useRef(new Set<string>());

  async function loadInitial() {
    try {
      const page = await requestOpinionMapUnavailablePage(undefined, request);
      setState({ status: "ready", items: page.items, nextCursor: page.nextCursor });
    } catch (error) {
      setState({ status: "unavailable", message: errorMessage(error) });
    }
  }

  useEffect(() => {
    let cancelled = false;
    void requestOpinionMapUnavailablePage(undefined, request)
      .then((page) => {
        if (!cancelled) {
          setState({ status: "ready", items: page.items, nextCursor: page.nextCursor });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "unavailable", message: errorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  async function retry(taskId: string) {
    if (retryLocks.current.has(taskId)) return;
    retryLocks.current.add(taskId);
    setRetryingTaskIds(new Set(retryLocks.current));
    setNotice("");
    try {
      const result = await requestOpinionMapRetry(taskId, request);
      const page = await requestOpinionMapUnavailablePage(undefined, request);
      setState({ status: "ready", items: page.items, nextCursor: page.nextCursor });
      setNotice(
        result.action === "UNCHANGED"
          ? "이미 상태가 변경되어 최신 목록을 확인했습니다."
          : "정성 요약 생성을 다시 요청했습니다.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      retryLocks.current.delete(taskId);
      setRetryingTaskIds(new Set(retryLocks.current));
    }
  }

  async function loadMore() {
    if (state.status !== "ready" || !state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setNotice("");
    try {
      const page = await requestOpinionMapUnavailablePage(state.nextCursor, request);
      setState({
        status: "ready",
        items: mergeOpinionMapUnavailableItems(state.items, page.items),
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <OpinionMapRetryPanelView
      loadingMore={loadingMore}
      notice={notice}
      onLoadMore={() => void loadMore()}
      onReload={() => {
        setNotice("");
        setState({ status: "loading" });
        void loadInitial();
      }}
      onRetry={(taskId) => void retry(taskId)}
      retryingTaskIds={retryingTaskIds}
      state={state}
    />
  );
}

export function OpinionMapRetryPanelView({
  state,
  retryingTaskIds,
  loadingMore,
  notice,
  onRetry,
  onLoadMore,
  onReload,
}: Readonly<{
  state: OpinionMapRetryPanelState;
  retryingTaskIds: ReadonlySet<string>;
  loadingMore: boolean;
  notice: string;
  onRetry: (taskId: string) => void;
  onLoadMore: () => void;
  onReload: () => void;
}>) {
  if (state.status === "loading" || (state.status === "ready" && state.items.length === 0)) {
    return null;
  }

  return (
    <section
      aria-labelledby="civic-opinion-map-retry-title"
      className="civic-home-section civic-opinion-map-retry-panel"
    >
      <header className="civic-home-section-header">
        <h2 id="civic-opinion-map-retry-title">
          정성 요약 생성 실패
          {state.status === "ready" ? (
            <span className="civic-home-section-count">
              {state.items.length}건{state.nextCursor ? "+" : ""}
            </span>
          ) : null}
        </h2>
      </header>
      {state.status === "unavailable" ? (
        <>
          <p aria-live="polite" className="civic-home-empty" role="status">
            실패 목록을 불러오지 못했습니다. {state.message}
          </p>
          <div className="civic-opinion-map-retry-footer">
            <button className="civic-opinion-map-retry-button" onClick={onReload} type="button">
              다시 불러오기
            </button>
          </div>
        </>
      ) : (
        <>
          <ul className="civic-home-list">
            {state.items.map((item) => {
              const retrying = retryingTaskIds.has(item.taskId);
              return (
                <li className="civic-home-row" key={item.taskId}>
                  <div className="civic-home-row-copy">
                    <strong>{item.taskTitle}</strong>
                    <small>
                      {opinionMapFailureMessage(item.lastErrorCode)} · {item.attemptCount}회 시도 ·{" "}
                      {formatAdminDate(item.failedAt)}
                    </small>
                  </div>
                  <button
                    aria-label={`${item.taskTitle} 정성 요약 재시도`}
                    className="civic-opinion-map-retry-button"
                    disabled={!item.canRetry || retrying}
                    onClick={() => onRetry(item.taskId)}
                    type="button"
                  >
                    {retrying ? "재시도 중" : item.canRetry ? "재시도" : "재시도 불가"}
                  </button>
                </li>
              );
            })}
          </ul>
          {state.nextCursor ? (
            <div className="civic-opinion-map-retry-footer">
              <button
                className="civic-opinion-map-retry-button"
                disabled={loadingMore}
                onClick={onLoadMore}
                type="button"
              >
                {loadingMore ? "불러오는 중" : "더 보기"}
              </button>
            </div>
          ) : null}
        </>
      )}
      {notice ? (
        <p aria-live="polite" className="civic-opinion-map-retry-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
}
