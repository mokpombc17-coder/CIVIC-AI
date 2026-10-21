"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChatRealtimeTransport } from "@/lib/chat/realtime/chat-realtime-transport";
import type {
  ChatRealtimeDiagnosticEvent,
  ChatRealtimeDiagnosticSnapshot,
} from "@/lib/chat/realtime/diagnostics/chat-realtime-diagnostic-events";
import { downloadChatRealtimeDiagnosticSnapshot } from "@/lib/chat/realtime/diagnostics/chat-realtime-diagnostics-devtools";
import {
  CHAT_REALTIME_DIAGNOSTICS_VISIBLE_EVENT_LIMIT,
  createChatRealtimeDiagnosticEventPreview,
  createChatRealtimeDiagnosticsSummary,
  getVisibleChatRealtimeDiagnosticEvents,
} from "@/lib/chat/realtime/diagnostics/chat-realtime-diagnostics-panel-model";

const REFRESH_INTERVAL_MS = 1_000;

type DiagnosticsTransport = Pick<
  ChatRealtimeTransport,
  "clearDiagnostics" | "getDiagnosticSnapshot"
>;

type Operation = "idle" | "refreshing" | "clearing" | "downloading";

export function ChatRealtimeDiagnosticsPanel({
  transport,
}: Readonly<{ transport: DiagnosticsTransport }>) {
  const panelId = useId();
  const latestRequestRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [operation, setOperation] = useState<Operation>("idle");
  const [snapshot, setSnapshot] = useState<ChatRealtimeDiagnosticSnapshot | null>(null);

  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const request = latestRequestRef.current + 1;
      latestRequestRef.current = request;

      if (!silent) {
        setOperation("refreshing");
      }

      try {
        const nextSnapshot = await transport.getDiagnosticSnapshot();

        if (request === latestRequestRef.current) {
          setSnapshot(nextSnapshot);
          setError(null);
        }
      } catch (cause) {
        if (request === latestRequestRef.current) {
          setError(toErrorMessage(cause));
        }
      } finally {
        if (!silent) {
          setOperation("idle");
        }
      }
    },
    [transport],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const interval = window.setInterval(() => {
      void refresh({ silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isOpen, refresh]);

  const summary = useMemo(
    () => (snapshot ? createChatRealtimeDiagnosticsSummary(snapshot) : null),
    [snapshot],
  );
  const visibleEvents = useMemo(
    () => (snapshot ? getVisibleChatRealtimeDiagnosticEvents(snapshot) : []),
    [snapshot],
  );

  async function clear() {
    setOperation("clearing");

    try {
      await transport.clearDiagnostics();
      await refresh({ silent: true });
      setError(null);
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setOperation("idle");
    }
  }

  async function download() {
    setOperation("downloading");

    try {
      const nextSnapshot = await transport.getDiagnosticSnapshot();
      setSnapshot(nextSnapshot);
      setError(null);
      downloadChatRealtimeDiagnosticSnapshot(nextSnapshot);
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setOperation("idle");
    }
  }

  function togglePanel() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    void refresh();
  }

  return (
    <>
      {isOpen ? (
        <section
          aria-labelledby={`${panelId}-title`}
          className="fixed inset-x-3 top-20 z-[90] flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl sm:right-auto sm:left-4 sm:w-[42rem] sm:max-w-[calc(100vw-2rem)]"
          data-chat-realtime-diagnostics-panel="true"
          id={panelId}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          role="region"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-cyan-400 uppercase">
                Development only
              </p>
              <h2 className="text-base font-bold" id={`${panelId}-title`}>
                채팅 실시간 진단
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <DiagnosticsActionButton
                disabled={operation !== "idle"}
                label={operation === "refreshing" ? "조회 중…" : "새로고침"}
                onClick={() => void refresh()}
              />
              <DiagnosticsActionButton
                disabled={operation !== "idle"}
                label={operation === "clearing" ? "초기화 중…" : "초기화"}
                onClick={() => void clear()}
              />
              <DiagnosticsActionButton
                disabled={operation !== "idle"}
                label={operation === "downloading" ? "저장 중…" : "JSON 저장"}
                onClick={() => void download()}
              />
              <button
                aria-label="실시간 진단 패널 닫기"
                className="flex size-8 items-center justify-center rounded-lg text-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
          </header>

          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-800 bg-slate-900/70 px-4 py-2 text-xs text-slate-300">
            <span>전체 {summary?.totalCount ?? 0}</span>
            <span className="text-red-300">오류 {summary?.errorCount ?? 0}</span>
            <span className="text-amber-300">경고 {summary?.warnCount ?? 0}</span>
            <span>누락 {snapshot?.droppedEventCount ?? 0}</span>
            <span>거절 {snapshot?.rejectedEventCount ?? 0}</span>
            <span className="ml-auto">열린 동안 1초마다 갱신</span>
          </div>

          {error ? (
            <p
              className="border-b border-red-900/70 bg-red-950/60 px-4 py-2 text-sm text-red-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="min-h-40 flex-1 overflow-y-auto p-3">
            {visibleEvents.length > 0 ? (
              <>
                {snapshot &&
                snapshot.events.length > CHAT_REALTIME_DIAGNOSTICS_VISIBLE_EVENT_LIMIT ? (
                  <p className="mb-2 text-xs text-slate-400">
                    UI에는 최근 {CHAT_REALTIME_DIAGNOSTICS_VISIBLE_EVENT_LIMIT}개만 표시합니다.
                    JSON에는 전체 기록이 포함됩니다.
                  </p>
                ) : null}
                <ol className="space-y-2">
                  {visibleEvents.map((event) => (
                    <DiagnosticEventItem event={event} key={event.sequence} />
                  ))}
                </ol>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                {operation === "refreshing"
                  ? "진단 기록을 불러오는 중입니다."
                  : "수집된 진단 기록이 없습니다."}
              </p>
            )}
          </div>
        </section>
      ) : null}

      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        className="fixed top-4 left-4 z-[90] flex h-11 items-center gap-2 rounded-full border border-cyan-400/50 bg-slate-950 px-4 text-sm font-semibold text-cyan-100 shadow-xl transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        data-chat-realtime-diagnostics-trigger="true"
        onClick={togglePanel}
        type="button"
      >
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-cyan-400 shadow-[0_0_10px_currentColor]"
        />
        실시간 진단
        {snapshot ? (
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
            {snapshot.events.length}
          </span>
        ) : null}
      </button>
    </>
  );
}

function DiagnosticsActionButton({
  disabled,
  label,
  onClick,
}: Readonly<{
  disabled: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function DiagnosticEventItem({ event }: Readonly<{ event: ChatRealtimeDiagnosticEvent }>) {
  const preview = createChatRealtimeDiagnosticEventPreview(event);

  return (
    <li>
      <details className="group rounded-xl border border-slate-800 bg-slate-900/80 open:border-slate-700">
        <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 px-3 py-2.5 text-sm marker:hidden">
          <span
            className={`row-span-2 size-2 shrink-0 rounded-full ${getLevelDotClassName(event.level)}`}
          />
          <span className="flex min-w-0 items-center gap-2">
            <code className="truncate text-xs text-slate-100">{event.event}</code>
            <span className="shrink-0 text-[11px] text-slate-500">#{event.sequence}</span>
          </span>
          <time className="text-[11px] text-slate-400" dateTime={event.occurredAt}>
            {formatDiagnosticTime(event.occurredAt)}
          </time>
          <span
            className="col-span-2 col-start-2 truncate text-[11px] text-slate-400"
            title={preview}
          >
            {preview}
          </span>
        </summary>
        <pre className="max-h-64 overflow-auto border-t border-slate-800 bg-slate-950/70 p-3 text-[11px] leading-relaxed text-slate-300">
          {JSON.stringify(event, null, 2)}
        </pre>
      </details>
    </li>
  );
}

function getLevelDotClassName(level: ChatRealtimeDiagnosticEvent["level"]): string {
  switch (level) {
    case "error":
      return "bg-red-400";
    case "warn":
      return "bg-amber-400";
    case "info":
      return "bg-cyan-400";
    case "debug":
      return "bg-slate-500";
  }
}

function formatDiagnosticTime(occurredAt: string): string {
  return new Date(occurredAt).toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "실시간 진단 기록을 처리하지 못했습니다.";
}
