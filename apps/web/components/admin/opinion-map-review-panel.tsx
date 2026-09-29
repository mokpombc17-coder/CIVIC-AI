"use client";

import { useEffect, useRef, useState } from "react";
import { ConsoleStatus } from "@/components/admin/console/console-ui";
import {
  OPINION_MAP_RUN_POLL_INTERVAL_MS,
  OPINION_MAP_RUN_POLL_TIMEOUT_MS,
  findActiveOpinionMapRun,
  hasOpinionMapRunPollingTimedOut,
  isOpinionMapRunActive,
  opinionMapFailureMessage,
  requestOpinionMapGeneration,
  requestOpinionMapGenerationRuns,
  requestOpinionMapRegeneration,
  requestOpinionMapRetry,
  type OpinionMapArea,
  type OpinionMapGeneration,
  type OpinionMapGenerationRun,
  type OpinionMapGenerationStatus,
} from "@/lib/admin/opinion-map-generation";
import { formatAdminDate } from "@/lib/admin/user-admin";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type OpinionMapReviewPanelState =
  | Readonly<{ status: "loading" }>
  | Readonly<{
      status: "ready";
      generation: OpinionMapGeneration;
      runs: readonly OpinionMapGenerationRun[];
      historyError: string;
      pollingTimedOut: boolean;
    }>
  | Readonly<{ status: "unavailable"; message: string }>;

type OpinionMapAction = "generate" | "regenerate" | null;
type PollTarget = Readonly<{ runId: string; requestedAt: string }>;

export function OpinionMapReviewPanel({
  taskId,
  request = authenticatedFetch,
}: Readonly<{ taskId: string; request?: typeof fetch }>) {
  const [state, setState] = useState<OpinionMapReviewPanelState>({ status: "loading" });
  const [action, setAction] = useState<OpinionMapAction>(null);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [pollTarget, setPollTarget] = useState<PollTarget | null>(null);
  const actionLock = useRef(false);
  const regenerationKey = useRef<string | null>(null);

  useEffect(() => {
    regenerationKey.current = null;
  }, [taskId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      requestOpinionMapGeneration(taskId, request, controller.signal),
      requestOpinionMapGenerationRuns(taskId, request, controller.signal),
    ]).then(([generationResult, runsResult]) => {
      if (controller.signal.aborted) return;
      if (generationResult.status === "rejected") {
        setPollTarget(null);
        setState({ status: "unavailable", message: errorMessage(generationResult.reason) });
        return;
      }

      const runs = runsResult.status === "fulfilled" ? runsResult.value.runs : [];
      const activeRun = findActiveOpinionMapRun(runs);
      setPollTarget(
        activeRun ? { runId: activeRun.runId, requestedAt: activeRun.requestedAt } : null,
      );
      setState({
        status: "ready",
        generation: generationResult.value,
        runs,
        historyError: runsResult.status === "rejected" ? errorMessage(runsResult.reason) : "",
        pollingTimedOut: activeRun ? hasOpinionMapRunPollingTimedOut(activeRun) : false,
      });
    });
    return () => controller.abort();
  }, [request, revision, taskId]);

  useEffect(() => {
    if (!pollTarget || state.status !== "ready" || state.pollingTimedOut) return;
    const remainingMs = Math.max(
      0,
      Date.parse(pollTarget.requestedAt) + OPINION_MAP_RUN_POLL_TIMEOUT_MS - Date.now(),
    );
    if (remainingMs === 0) {
      setState((current) =>
        current.status === "ready" ? { ...current, pollingTimedOut: true } : current,
      );
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => {
        if (hasOpinionMapRunPollingTimedOut(pollTarget)) {
          setState((current) =>
            current.status === "ready" ? { ...current, pollingTimedOut: true } : current,
          );
          return;
        }
        void pollRun(controller.signal);
      },
      Math.min(OPINION_MAP_RUN_POLL_INTERVAL_MS, remainingMs),
    );

    async function pollRun(signal: AbortSignal) {
      try {
        const result = await requestOpinionMapGenerationRuns(taskId, request, signal);
        if (signal.aborted) return;
        const trackedRun = result.runs.find((run) => run.runId === pollTarget?.runId);
        let generation: OpinionMapGeneration | null = null;
        let generationError = "";
        if (trackedRun && !isOpinionMapRunActive(trackedRun)) {
          try {
            generation = await requestOpinionMapGeneration(taskId, request, signal);
          } catch (error) {
            generationError = errorMessage(error);
          }
        }
        if (signal.aborted) return;

        setState((current) =>
          current.status === "ready"
            ? {
                ...current,
                generation: generation ?? current.generation,
                runs: result.runs,
                historyError: "",
                pollingTimedOut: false,
              }
            : current,
        );
        if (!trackedRun || isOpinionMapRunActive(trackedRun)) {
          if (trackedRun) {
            setPollTarget({ runId: trackedRun.runId, requestedAt: trackedRun.requestedAt });
          }
          return;
        }

        setPollTarget(null);
        setNotice(
          generationError ||
            (trackedRun.status === "AVAILABLE"
              ? "새 정성 요약 생성을 완료했습니다."
              : opinionMapFailureMessage(trackedRun.lastErrorCode ?? "")),
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((current) =>
          current.status === "ready" ? { ...current, historyError: errorMessage(error) } : current,
        );
      }
    }

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [pollTarget, request, state, taskId]);

  async function startGeneration() {
    if (actionLock.current) return;
    actionLock.current = true;
    setAction("generate");
    setNotice("");
    try {
      const result = await requestOpinionMapRetry(taskId, request);
      const generation = await requestOpinionMapGeneration(taskId, request);
      let runs = state.status === "ready" ? state.runs : [];
      let historyError = "";
      try {
        runs = (await requestOpinionMapGenerationRuns(taskId, request)).runs;
      } catch (error) {
        historyError = errorMessage(error);
      }
      const activeRun = findActiveOpinionMapRun(runs);
      setPollTarget(
        activeRun ? { runId: activeRun.runId, requestedAt: activeRun.requestedAt } : null,
      );
      setState({
        status: "ready",
        generation,
        runs,
        historyError,
        pollingTimedOut: activeRun ? hasOpinionMapRunPollingTimedOut(activeRun) : false,
      });
      setNotice(
        result.action === "UNCHANGED"
          ? "이미 상태가 변경되어 최신 상태를 확인했습니다."
          : result.action === "CREATED"
            ? "정성 요약 생성을 요청했습니다."
            : "정성 요약 생성을 다시 요청했습니다.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
      setPollTarget(null);
      setState({ status: "loading" });
      setRevision((value) => value + 1);
    } finally {
      actionLock.current = false;
      setAction(null);
    }
  }

  async function startRegeneration() {
    if (actionLock.current || state.status !== "ready") return;
    if (!globalThis.confirm("기존 정성 요약을 유지한 채 새 요약을 생성할까요?")) return;

    actionLock.current = true;
    setAction("regenerate");
    setNotice("");
    const idempotencyKey = regenerationKey.current ?? globalThis.crypto.randomUUID();
    regenerationKey.current = idempotencyKey;
    try {
      const result = await requestOpinionMapRegeneration(taskId, idempotencyKey, request);
      regenerationKey.current = null;
      const [generationResult, runsResult] = await Promise.allSettled([
        requestOpinionMapGeneration(taskId, request),
        requestOpinionMapGenerationRuns(taskId, request),
      ]);
      const runs = runsResult.status === "fulfilled" ? runsResult.value.runs : state.runs;
      const trackedRun = runs.find((run) => run.runId === result.runId);
      const trackedStatus = trackedRun?.status ?? result.status;
      const requestedAt = trackedRun?.requestedAt ?? result.requestedAt;
      const isActive = ["PENDING", "PROCESSING", "RETRY_WAIT"].includes(trackedStatus);
      setPollTarget(isActive ? { runId: result.runId, requestedAt } : null);
      setState({
        status: "ready",
        generation:
          generationResult.status === "fulfilled" ? generationResult.value : state.generation,
        runs,
        historyError: runsResult.status === "rejected" ? errorMessage(runsResult.reason) : "",
        pollingTimedOut: isActive ? hasOpinionMapRunPollingTimedOut({ requestedAt }) : false,
      });
      setNotice(
        trackedStatus === "AVAILABLE"
          ? "새 정성 요약 생성을 완료했습니다."
          : trackedStatus === "UNAVAILABLE"
            ? opinionMapFailureMessage(trackedRun?.lastErrorCode ?? "")
            : result.created
              ? "정성 요약 재생성을 요청했습니다."
              : "이미 진행 중인 재생성 상태를 확인했습니다.",
      );
    } catch (error) {
      if (!(error instanceof TypeError)) regenerationKey.current = null;
      setNotice(errorMessage(error));
    } finally {
      actionLock.current = false;
      setAction(null);
    }
  }

  function reload() {
    setNotice("");
    setPollTarget(null);
    setState({ status: "loading" });
    setRevision((value) => value + 1);
  }

  return (
    <OpinionMapReviewPanelView
      action={action}
      notice={notice}
      onGenerate={() => void startGeneration()}
      onRegenerate={() => void startRegeneration()}
      onReload={reload}
      state={state}
    />
  );
}

export function OpinionMapReviewPanelView({
  state,
  action,
  notice,
  onGenerate,
  onRegenerate,
  onReload,
}: Readonly<{
  state: OpinionMapReviewPanelState;
  action: OpinionMapAction;
  notice: string;
  onGenerate: () => void;
  onRegenerate: () => void;
  onReload: () => void;
}>) {
  return (
    <section
      aria-labelledby="civic-opinion-map-review-title"
      className="civic-domain-result civic-opinion-map-review"
    >
      <header>
        <span>정성 요약</span>
        <h2 id="civic-opinion-map-review-title">선택지별 의견 요약</h2>
      </header>

      {state.status === "loading" ? (
        <ConsoleStatus>정성 요약을 불러오는 중입니다.</ConsoleStatus>
      ) : null}

      {state.status === "unavailable" ? (
        <>
          <ConsoleStatus error>{state.message}</ConsoleStatus>
          <button className="wf-button wf-button-secondary" onClick={onReload} type="button">
            다시 불러오기
          </button>
        </>
      ) : null}

      {state.status === "ready" ? (
        <OpinionMapGenerationView
          action={action}
          generation={state.generation}
          historyError={state.historyError}
          onGenerate={onGenerate}
          onRegenerate={onRegenerate}
          onReload={onReload}
          pollingTimedOut={state.pollingTimedOut}
          runs={state.runs}
        />
      ) : null}

      {notice ? <ConsoleStatus>{notice}</ConsoleStatus> : null}
    </section>
  );
}

function OpinionMapGenerationView({
  generation,
  runs,
  historyError,
  pollingTimedOut,
  action,
  onGenerate,
  onRegenerate,
  onReload,
}: Readonly<{
  generation: OpinionMapGeneration;
  runs: readonly OpinionMapGenerationRun[];
  historyError: string;
  pollingTimedOut: boolean;
  action: OpinionMapAction;
  onGenerate: () => void;
  onRegenerate: () => void;
  onReload: () => void;
}>) {
  const actionLabel = generation.canGenerate
    ? "정성 요약 생성"
    : generation.canRetry
      ? "생성 재시도"
      : null;
  const activeRun = findActiveOpinionMapRun(runs);
  const actionPending = action !== null;
  const canRefresh =
    ["PENDING", "PROCESSING", "RETRY_WAIT"].includes(generation.status) ||
    Boolean(activeRun) ||
    pollingTimedOut ||
    Boolean(historyError);

  return (
    <>
      <div className="civic-opinion-map-review-status">
        <strong>{opinionMapStatusLabel(generation.status)}</strong>
        <span>{opinionMapStatusMessage(generation)}</span>
        <small>
          시도 {generation.attemptCount.toLocaleString("ko-KR")}회
          {generation.updatedAt ? <> · 최근 상태 {formatAdminDate(generation.updatedAt)}</> : null}
        </small>
      </div>

      {pollingTimedOut ? (
        <ConsoleStatus>
          처리가 지연되고 있어 자동 상태 확인을 중단했습니다. 수동으로 새로고침해 주세요.
        </ConsoleStatus>
      ) : null}

      {generation.status === "AVAILABLE" ? (
        <ol className="civic-opinion-map-review-options">
          {generation.options.map((option) => (
            <li key={option.optionId}>
              <header>
                <span>선택지 {option.displayOrder}</span>
                <h3>{option.content}</h3>
              </header>
              {option.sameChoice && option.otherChoices ? (
                <div className="civic-opinion-map-review-areas">
                  <OpinionMapAreaView area={option.sameChoice} title="같은 선택 의견" />
                  <OpinionMapAreaView area={option.otherChoices} title="다른 선택 의견" />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {actionLabel || generation.canRegenerate || canRefresh ? (
        <div className="civic-form-actions">
          {actionLabel ? (
            <button
              className="civic-primary-action"
              disabled={actionPending}
              onClick={onGenerate}
              type="button"
            >
              {action === "generate" ? "요청 중…" : actionLabel}
            </button>
          ) : null}
          {generation.canRegenerate ? (
            <button
              className="civic-primary-action"
              disabled={actionPending || Boolean(activeRun) || Boolean(historyError)}
              onClick={onRegenerate}
              type="button"
            >
              {action === "regenerate"
                ? "재생성 요청 중…"
                : activeRun
                  ? "재생성 진행 중…"
                  : historyError
                    ? "상태 확인 후 재생성"
                    : "정성 요약 재생성"}
            </button>
          ) : null}
          {canRefresh ? (
            <button
              className="wf-button wf-button-secondary"
              disabled={actionPending}
              onClick={onReload}
              type="button"
            >
              상태 새로고침
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function OpinionMapAreaView({ area, title }: Readonly<{ area: OpinionMapArea; title: string }>) {
  const message =
    area.status === "AVAILABLE"
      ? area.body
      : area.status === "NO_RESPONSES"
        ? "이 선택지를 고른 응답이 없습니다."
        : "요약할 수 있는 의견이 충분하지 않습니다.";
  return (
    <section className="civic-opinion-map-review-area">
      <h4>{title}</h4>
      <p>{message}</p>
    </section>
  );
}

function opinionMapStatusLabel(status: OpinionMapGenerationStatus): string {
  return {
    NOT_ELIGIBLE: "생성 대상 아님",
    NOT_CREATED: "생성 전",
    PENDING: "생성 대기 중",
    PROCESSING: "생성 중",
    RETRY_WAIT: "자동 재시도 대기 중",
    AVAILABLE: "생성 완료",
    UNAVAILABLE: "생성 실패",
  }[status];
}

function opinionMapStatusMessage(generation: OpinionMapGeneration): string {
  switch (generation.status) {
    case "NOT_ELIGIBLE":
      return "아직 결과 대상이 아니거나 정성 요약 비대상으로 종료된 과업입니다.";
    case "NOT_CREATED":
      return generation.canGenerate
        ? "아직 정성 요약 생성 이력이 없습니다."
        : "아직 생성 이력이 없으며 현재 수동 생성을 사용할 수 없습니다.";
    case "PENDING":
      return "생성 요청이 접수되어 대기 중입니다.";
    case "PROCESSING":
      return "선택지별 의견 요약을 생성하고 있습니다.";
    case "RETRY_WAIT":
      return generation.nextAttemptAt
        ? `${formatAdminDate(generation.nextAttemptAt)}에 자동으로 다시 시도합니다.`
        : "자동 재시도를 기다리고 있습니다.";
    case "AVAILABLE":
      return (generation.completedAt ?? generation.updatedAt)
        ? `버전 ${generation.resultVersion} · ${formatAdminDate(
            generation.completedAt ?? generation.updatedAt,
          )} 완료`
        : `버전 ${generation.resultVersion} · 생성 완료`;
    case "UNAVAILABLE":
      return `${opinionMapFailureMessage(generation.lastErrorCode ?? "")}${
        generation.canRetry ? "" : " 현재 수동 재시도를 사용할 수 없습니다."
      }`;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
}
