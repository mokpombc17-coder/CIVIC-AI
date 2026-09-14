"use client";

import { useEffect, useRef, useState } from "react";
import { ConsoleStatus } from "@/components/admin/console/console-ui";
import {
  opinionMapFailureMessage,
  requestOpinionMapGeneration,
  requestOpinionMapRetry,
  type OpinionMapArea,
  type OpinionMapGeneration,
  type OpinionMapGenerationStatus,
} from "@/lib/admin/opinion-map-generation";
import { formatAdminDate } from "@/lib/admin/user-admin";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type OpinionMapReviewPanelState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; generation: OpinionMapGeneration }>
  | Readonly<{ status: "unavailable"; message: string }>;

export function OpinionMapReviewPanel({
  taskId,
  request = authenticatedFetch,
}: Readonly<{ taskId: string; request?: typeof fetch }>) {
  const [state, setState] = useState<OpinionMapReviewPanelState>({ status: "loading" });
  const [actionPending, setActionPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const actionLock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void requestOpinionMapGeneration(taskId, request, controller.signal)
      .then((generation) => {
        if (!controller.signal.aborted) setState({ status: "ready", generation });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "unavailable", message: errorMessage(error) });
        }
      });
    return () => controller.abort();
  }, [request, revision, taskId]);

  async function startGeneration() {
    if (actionLock.current) return;
    actionLock.current = true;
    setActionPending(true);
    setNotice("");
    try {
      const result = await requestOpinionMapRetry(taskId, request);
      const generation = await requestOpinionMapGeneration(taskId, request);
      setState({ status: "ready", generation });
      setNotice(
        result.action === "UNCHANGED"
          ? "이미 상태가 변경되어 최신 상태를 확인했습니다."
          : result.action === "CREATED"
            ? "Opinion Map 생성을 요청했습니다."
            : "Opinion Map 생성을 다시 요청했습니다.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
      setState({ status: "loading" });
      setRevision((value) => value + 1);
    } finally {
      actionLock.current = false;
      setActionPending(false);
    }
  }

  return (
    <OpinionMapReviewPanelView
      actionPending={actionPending}
      notice={notice}
      onGenerate={() => void startGeneration()}
      onReload={() => {
        setNotice("");
        setState({ status: "loading" });
        setRevision((value) => value + 1);
      }}
      state={state}
    />
  );
}

export function OpinionMapReviewPanelView({
  state,
  actionPending,
  notice,
  onGenerate,
  onReload,
}: Readonly<{
  state: OpinionMapReviewPanelState;
  actionPending: boolean;
  notice: string;
  onGenerate: () => void;
  onReload: () => void;
}>) {
  return (
    <section
      aria-labelledby="civic-opinion-map-review-title"
      className="civic-domain-result civic-opinion-map-review"
    >
      <header>
        <span>Opinion Map 생성 결과</span>
        <h2 id="civic-opinion-map-review-title">선택지별 의견 요약</h2>
      </header>

      {state.status === "loading" ? (
        <ConsoleStatus>Opinion Map 결과를 불러오는 중입니다.</ConsoleStatus>
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
          actionPending={actionPending}
          generation={state.generation}
          onGenerate={onGenerate}
          onReload={onReload}
        />
      ) : null}

      {notice ? <ConsoleStatus>{notice}</ConsoleStatus> : null}
    </section>
  );
}

function OpinionMapGenerationView({
  generation,
  actionPending,
  onGenerate,
  onReload,
}: Readonly<{
  generation: OpinionMapGeneration;
  actionPending: boolean;
  onGenerate: () => void;
  onReload: () => void;
}>) {
  const actionLabel = generation.canGenerate
    ? "Opinion Map 생성"
    : generation.canRetry
      ? "생성 재시도"
      : null;
  const canRefresh = ["PENDING", "PROCESSING", "RETRY_WAIT"].includes(generation.status);

  return (
    <>
      <div className="civic-opinion-map-review-status">
        <strong>{opinionMapStatusLabel(generation.status)}</strong>
        <span>{opinionMapStatusMessage(generation)}</span>
        <small>
          시도 {generation.attemptCount.toLocaleString("ko-KR")}회 · 최근 상태{" "}
          {formatAdminDate(generation.updatedAt)}
        </small>
      </div>

      {generation.status === "AVAILABLE" ? (
        <ol className="civic-opinion-map-review-options">
          {generation.options.map((option) => (
            <li key={option.optionId}>
              <header>
                <span>선택지 {option.displayOrder}</span>
                <h3>{option.content}</h3>
                <strong>{option.responseCount?.toLocaleString("ko-KR")}건</strong>
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

      {actionLabel || canRefresh ? (
        <div className="civic-form-actions">
          {actionLabel ? (
            <button
              className="civic-primary-action"
              disabled={actionPending}
              onClick={onGenerate}
              type="button"
            >
              {actionPending ? "요청 중…" : actionLabel}
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
      return "아직 결과 대상이 아니거나 Opinion Map 결과 비대상으로 종료된 과업입니다.";
    case "NOT_CREATED":
      return generation.canGenerate
        ? "아직 Opinion Map 생성 이력이 없습니다."
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
      return `버전 ${generation.resultVersion} · ${formatAdminDate(generation.completedAt ?? generation.updatedAt)} 완료`;
    case "UNAVAILABLE":
      return `${opinionMapFailureMessage(generation.lastErrorCode ?? "")}${
        generation.canRetry ? "" : " 현재 수동 재시도를 사용할 수 없습니다."
      }`;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
}
