"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import type { ScreenDefinition } from "@/lib/screens/registry";
import type { RagQuery } from "./rag-functional-screen";
import { ragScreenPrimaryActions } from "./rag-screen-actions";
import { ReadOnlyPdfViewer } from "./read-only-pdf-viewer";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { SafeMarkdownAnswer } from "./safe-markdown-answer";
import { RagFeedback } from "./rag-feedback";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import {
  clearRagConversationSnapshot,
  latestPendingRagJobId,
  readRagConversationSnapshot,
  writeRagConversationSnapshot,
  type Citation,
  type Message,
  type RagJob,
} from "./rag-conversation-session";

export {
  clearRagConversationSnapshot,
  latestPendingRagJobId,
  readRagConversationSnapshot,
  writeRagConversationSnapshot,
} from "./rag-conversation-session";
export type {
  Citation,
  Message,
  RagConversationSnapshot,
  RagJob,
} from "./rag-conversation-session";

function clockLabel(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function ParticipantRagScreen({
  screen,
  query,
  userId,
}: Readonly<{ screen: ScreenDefinition; query: RagQuery; userId?: string }>) {
  if (screen.id === "U-RAG-002" || screen.id === "U-RAG-003") {
    const versionId = one(query.versionId) || "citation-version";
    const page = positive(one(query.page), 1);
    const total = positive(one(query.total), page);
    const title = one(query.title) || "인용 문서";
    return (
      <ScreenFrame screen={screen}>
        <ConversationBackdrop />
        <div className="wf-rag-reference-layer" data-wireflow-layout="rag-reference-modal">
          <div aria-hidden="true" className="wf-rag-reference-scrim" />
          <div
            aria-label="참조 문서"
            aria-modal="true"
            className="wf-rag-reference-dialog"
            role="dialog"
          >
            <ReadOnlyPdfViewer
              currentPage={page}
              documentTitle={title}
              sourceUrl={`/api/v1/rag/sources/${encodeURIComponent(versionId)}/pages/${page}`}
              totalPages={Math.max(page, total)}
            />
          </div>
        </div>
        <span className="civic-screen-action-label">{ragScreenPrimaryActions[screen.id]}</span>
      </ScreenFrame>
    );
  }
  return <RagConversation screen={screen} {...(userId ? { userId } : {})} />;
}

function RagConversation({
  screen,
  userId,
}: Readonly<{ screen: ScreenDefinition; userId?: string }>) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(!userId);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const activePoll = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const restoredQueryChecked = useRef(false);
  const queryOperation = useRef(createQueryOperation());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!userId) return;
    const storage = browserRagConversationStorage();
    const snapshot = storage ? readRagConversationSnapshot(storage, userId) : null;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (snapshot) {
        setMessages(snapshot.messages);
        setCurrentSessionId(snapshot.sessionId);
      }
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!restored || !userId) return;
    const storage = browserRagConversationStorage();
    if (!storage) return;
    writeRagConversationSnapshot(storage, {
      ownerUserId: userId,
      sessionId: currentSessionId,
      messages,
    });
  }, [currentSessionId, messages, restored, userId]);

  useEffect(() => {
    if (!restored || restoredQueryChecked.current) return;
    restoredQueryChecked.current = true;
    const pendingJobId = latestPendingRagJobId(messages);
    if (!pendingJobId) return;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    const controller = new AbortController();
    activePoll.current?.abort();
    activePoll.current = controller;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setBusy(true);
    });
    void waitForStreamedResult(pendingJobId, { signal: controller.signal })
      .then((result) => {
        if (requestGeneration.current !== generation) return;
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingJobId
              ? { ...message, answeredAt: clockLabel(), job: result }
              : message,
          ),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice("연결이 끊겼습니다. 진행 중인 질문은 다음 방문 때 다시 확인합니다.");
      })
      .finally(() => {
        if (activePoll.current === controller) {
          activePoll.current = null;
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [messages, restored]);

  useEffect(
    () => () => {
      activePoll.current?.abort();
    },
    [],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = question.trim();
    if (!submitted || busy) return;
    const idempotencyKey = queryOperation.current.begin(submitted);
    if (!idempotencyKey) return;
    setBusy(true);
    setNotice("");
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    const controller = new AbortController();
    activePoll.current?.abort();
    activePoll.current = controller;
    let retireIdempotencyKey = false;
    try {
      const response = await authenticatedFetch("/api/v1/rag/queries", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({
          question: submitted,
          ...(currentSessionId ? { session_id: currentSessionId } : {}),
        }),
        signal: controller.signal,
      });
      const submission = await parseQuerySubmissionResponse(response);
      retireIdempotencyKey = true;
      if (requestGeneration.current !== generation) return;
      if (submission.kind === "problem") {
        setNotice(problemMessage(submission.code));
        return;
      }
      const accepted = submission.job;
      if (accepted.session_id) setCurrentSessionId(accepted.session_id);
      setMessages((current) => [
        ...current,
        { askedAt: clockLabel(), id: accepted.job_id, question: submitted },
      ]);
      setQuestion("");
      const result = await waitForStreamedResult(accepted.job_id, { signal: controller.signal });
      if (requestGeneration.current !== generation) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === accepted.job_id
            ? { ...message, answeredAt: clockLabel(), job: result }
            : message,
        ),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("연결이 끊겼습니다. 입력한 질문은 유지되며 잠시 후 다시 시도할 수 있습니다.");
    } finally {
      queryOperation.current.settle(retireIdempotencyKey);
      if (activePoll.current === controller) {
        activePoll.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <ScreenFrame screen={screen}>
      <section className="civic-rag-conversation" data-wireflow-layout="rag-conversation">
        <header className="civic-rag-session-bar">
          <p className="civic-rag-intro">
            궁금한 정보를 질문하세요.
            <br />
            AI가 실제 문서를 기반으로 답변해드립니다.
          </p>
          <button
            className="civic-secondary-action"
            onClick={() => {
              requestGeneration.current += 1;
              activePoll.current?.abort();
              activePoll.current = null;
              queryOperation.current.clear();
              setCurrentSessionId(null);
              const storage = browserRagConversationStorage();
              if (storage) clearRagConversationSnapshot(storage);
              setMessages([]);
              setQuestion("");
              setBusy(false);
              setNotice("새 질문을 시작했습니다.");
            }}
            type="button"
          >
            새 질문
          </button>
        </header>
        <div aria-label="현재 RAG 대화" className="civic-rag-messages">
          {messages.length === 0 ? (
            <div className="civic-rag-empty">
              <span aria-hidden="true">✦</span>
              <div>
                <strong>확인할 정책이나 자료를 질문하세요.</strong>
                <p>답변은 관리자가 등록한 문서의 실제 페이지 근거와 함께 표시됩니다.</p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <RagMessage key={message.id} message={message} onOpenCitation={setActiveCitation} />
            ))
          )}
          {busy ? (
            <p aria-live="polite" className="civic-rag-generating">
              문서를 검색하고 근거를 확인하고 있습니다.
            </p>
          ) : null}
        </div>
        {notice ? (
          <p aria-live="polite" className="civic-form-message">
            {notice}
          </p>
        ) : null}
        <form className="civic-rag-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="rag-question">
            메시지 입력
          </label>
          <textarea
            id="rag-question"
            maxLength={8000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="문서에 대해 질문하세요..."
            rows={2}
            value={question}
          />
          <button
            aria-label={ragScreenPrimaryActions[screen.id]}
            disabled={!restored || busy || !question.trim()}
            type="submit"
          >
            전송
          </button>
        </form>
        <span className="civic-screen-action-label">{ragScreenPrimaryActions[screen.id]}</span>
      </section>
      {activeCitation ? (
        <div className="wf-rag-reference-layer" data-wireflow-layout="rag-reference-modal">
          <div aria-hidden="true" className="wf-rag-reference-scrim" />
          <div
            aria-label="참조 문서"
            aria-modal="true"
            className="wf-rag-reference-dialog"
            role="dialog"
          >
            <ReadOnlyPdfViewer
              currentPage={activeCitation.page_number}
              documentTitle={activeCitation.title ?? "인용 문서"}
              onClose={() => setActiveCitation(null)}
              onPageChange={(page) => setActiveCitation({ ...activeCitation, page_number: page })}
              sourceUrl={`/api/v1/rag/sources/${encodeURIComponent(activeCitation.document_version_id)}/pages/${activeCitation.page_number}`}
              totalPages={citationTotalPages(activeCitation)}
            />
          </div>
        </div>
      ) : null}
    </ScreenFrame>
  );
}

function browserRagConversationStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function createQueryOperation(idFactory: () => string = () => crypto.randomUUID()) {
  let pending = false;
  let retained: { question: string; key: string } | null = null;
  return {
    begin(question: string): string | null {
      if (pending) return null;
      pending = true;
      if (!retained || retained.question !== question) {
        retained = { question, key: idFactory() };
      }
      return retained.key;
    },
    settle(definitiveResponse: boolean): void {
      pending = false;
      if (definitiveResponse) retained = null;
    },
    clear(): void {
      pending = false;
      retained = null;
    },
  };
}

export async function parseQuerySubmissionResponse(
  response: Response,
): Promise<
  | Readonly<{ kind: "accepted"; job: RagJob }>
  | Readonly<{ kind: "problem"; code: string | undefined }>
> {
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    const code =
      problem &&
      typeof problem === "object" &&
      "code" in problem &&
      typeof problem.code === "string"
        ? problem.code
        : undefined;
    return { kind: "problem", code };
  }
  const value = await response.json().catch(() => {
    throw new TypeError("RAG accepted query response is invalid");
  });
  if (
    !value ||
    typeof value !== "object" ||
    !("job_id" in value) ||
    typeof value.job_id !== "string" ||
    !value.job_id ||
    !("status" in value) ||
    typeof value.status !== "string"
  ) {
    throw new TypeError("RAG accepted query response is invalid");
  }
  return { kind: "accepted", job: value as RagJob };
}

function ConversationBackdrop() {
  return (
    <section
      aria-hidden="true"
      className="civic-rag-conversation wf-rag-reference-backdrop"
      data-wireflow-layout="rag-conversation"
    >
      <header className="civic-rag-session-bar">
        <p className="civic-rag-intro">
          궁금한 정보를 질문하세요.
          <br />
          AI가 실제 문서를 기반으로 답변해드립니다.
        </p>
        <span className="civic-secondary-action">새 질문</span>
      </header>
      <div className="civic-rag-messages" />
      <div className="civic-rag-composer">
        <span>문서에 대해 질문하세요...</span>
        <span>전송</span>
      </div>
    </section>
  );
}

function RagMessage({
  message,
  onOpenCitation,
}: Readonly<{ message: Message; onOpenCitation: (citation: Citation) => void }>) {
  const statusMessage = ragJobStatusMessage(message.job);
  return (
    <article className="civic-rag-exchange">
      <div className="civic-rag-question-row">
        <time className="civic-rag-time">{message.askedAt}</time>
        <p className="civic-rag-question">{message.question}</p>
      </div>
      <div className="civic-rag-answer-row">
        <header className="civic-rag-answer-meta">
          <strong>CIVIC.AI</strong>
          {message.answeredAt ? <time className="civic-rag-time">{message.answeredAt}</time> : null}
        </header>
        <div className="civic-rag-answer">
          {statusMessage ? (
            <p role={message.job?.status === "FAILED" ? "alert" : undefined}>{statusMessage}</p>
          ) : message.job?.answer ? (
            <SafeMarkdownAnswer
              answer={message.job.answer}
              citations={message.job.citations ?? []}
              onOpenCitation={onOpenCitation}
            />
          ) : null}
        </div>
        {message.job?.citations?.length ? (
          <div aria-label="출처" className="civic-rag-citations">
            {message.job.citations.map((citation) => (
              <div
                className="civic-rag-citation-card"
                key={`${citation.document_version_id}-${citation.page_number}-${citation.source_object_sha256}`}
              >
                <div className="civic-rag-citation-copy">
                  <strong>
                    <span aria-hidden="true" className="civic-rag-citation-icon">
                      ⓘ
                    </span>
                    출처
                  </strong>
                  <p>
                    {citation.title ?? "문서"} · {citation.page_number}페이지
                  </p>
                </div>
                <Link
                  className="wf-button wf-button-secondary"
                  href={citationHref(citation)}
                  onClick={(event) => openCitationInline(event, citation, onOpenCitation)}
                >
                  원문 보기
                </Link>
              </div>
            ))}
          </div>
        ) : null}
        {message.job?.status === "SUCCEEDED" && message.job.answer ? (
          <RagFeedback
            jobId={message.job.job_id}
            {...(message.job.feedback ? { initialValue: message.job.feedback } : {})}
          />
        ) : null}
      </div>
    </article>
  );
}

export function citationHref(citation: Citation): Route {
  return `/rag/source?versionId=${encodeURIComponent(citation.document_version_id)}&page=${citation.page_number}&total=${citationTotalPages(citation)}&title=${encodeURIComponent(citation.title ?? "인용 문서")}` as Route;
}

export function citationTotalPages(citation: Pick<Citation, "page_number" | "page_count">) {
  const page =
    Number.isSafeInteger(citation.page_number) && citation.page_number > 0
      ? citation.page_number
      : 1;
  const pageCount =
    Number.isSafeInteger(citation.page_count) && (citation.page_count ?? 0) > 0
      ? (citation.page_count ?? page)
      : page;
  return Math.max(page, pageCount);
}

export function openCitationInline(
  event: Pick<MouseEvent<HTMLAnchorElement>, "preventDefault">,
  citation: Citation,
  open: (citation: Citation) => void,
): void {
  event.preventDefault();
  open(citation);
}

type PollResultOptions = Readonly<{
  request?: typeof fetch;
  signal?: AbortSignal;
  wait?: (milliseconds: number) => Promise<void>;
}>;

type EventSourceLike = Readonly<{
  addEventListener: (name: string, listener: () => void) => void;
  close: () => void;
}> & { onerror: (() => void) | null };

type StreamResultOptions = Readonly<{
  request?: typeof fetch;
  createSource?: (url: string) => EventSourceLike;
  fallback?: (jobId: string, options: PollResultOptions) => Promise<RagJob>;
  signal?: AbortSignal;
}>;

export async function waitForStreamedResult(
  jobId: string,
  {
    request = authenticatedFetch,
    createSource,
    fallback = pollResult,
    signal,
  }: StreamResultOptions = {},
): Promise<RagJob> {
  const fallbackResult = () => fallback(jobId, { request, ...(signal ? { signal } : {}) });
  if (signal?.aborted || (!createSource && typeof EventSource === "undefined")) {
    return fallbackResult();
  }
  const bootstrap = await request("/api/v1/rag/stream-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_id: jobId }),
    ...(signal ? { signal } : {}),
  }).catch(() => null);
  if (!bootstrap?.ok) return fallbackResult();
  const body = (await bootstrap.json().catch(() => null)) as { stream_path?: unknown } | null;
  if (!body || typeof body.stream_path !== "string") return fallbackResult();

  return new Promise<RagJob>((resolve, reject) => {
    const source = createSource
      ? createSource(body.stream_path as string)
      : new EventSource(body.stream_path as string);
    let settled = false;
    const close = () => {
      source.close();
      signal?.removeEventListener("abort", abort);
    };
    const finish = async () => {
      if (settled) return;
      settled = true;
      close();
      try {
        const response = await request(`/api/v1/rag/queries/${encodeURIComponent(jobId)}`, {
          cache: "no-store",
          ...(signal ? { signal } : {}),
        });
        if (!response.ok) throw new Error("query status unavailable");
        const result = (await response.json()) as RagJob;
        if (result.status !== "SUCCEEDED" && result.status !== "FAILED") {
          resolve(await fallbackResult());
          return;
        }
        resolve(result);
      } catch {
        if (signal?.aborted) reject(new DOMException("query stream aborted", "AbortError"));
        else fallbackResult().then(resolve, reject);
      }
    };
    const recover = () => {
      if (settled) return;
      settled = true;
      close();
      fallbackResult().then(resolve, reject);
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      close();
      reject(new DOMException("query stream aborted", "AbortError"));
    };
    source.addEventListener("query.succeeded", () => void finish());
    source.addEventListener("query.failed", () => void finish());
    source.onerror = recover;
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function pollResult(
  jobId: string,
  {
    request = authenticatedFetch,
    signal,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }: PollResultOptions = {},
): Promise<RagJob> {
  for (;;) {
    if (signal?.aborted) throw new DOMException("query polling aborted", "AbortError");
    try {
      const response = await request(`/api/v1/rag/queries/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) {
        if (!isRetryableRagStatus(response.status)) throw new Error("query status unavailable");
      } else {
        const job = (await response.json()) as RagJob;
        if (job.status === "SUCCEEDED" || job.status === "FAILED") return job;
      }
    } catch (error) {
      if (error instanceof Error && error.message === "query status unavailable") throw error;
    }
    await wait(1000);
  }
}

export function isRetryableRagStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function problemMessage(code?: string) {
  if (code === "NO_DOCUMENTS") return "아직 질문할 수 있는 문서가 없습니다.";
  if (code === "INDEX_NOT_READY") return "문서 색인이 진행 중입니다. 입력은 유지됩니다.";
  if (code === "AI_PROVIDER_DISABLED") return "현재 AI 답변 기능이 비활성화되어 있습니다.";
  if (code === "CONTEXT_POLICY_REJECTED") {
    return "질문 내용을 안전하게 처리할 수 없습니다. 표현을 바꿔 다시 시도해 주세요.";
  }
  if (code === "OUTPUT_POLICY_REJECTED") {
    return "생성된 답변이 안전성 검사를 통과하지 못했습니다. 다시 시도해 주세요.";
  }
  if (code === "PROVIDER_AUTH_FAILED") {
    return "AI 답변 기능 설정에 문제가 있습니다. 관리자에게 문의해 주세요.";
  }
  if (code === "PROVIDER_RATE_LIMITED") {
    return "AI 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE") {
    return "AI 답변 서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (code === "PROVIDER_RESPONSE_INVALID") {
    return "답변을 만드는 중 문제가 발생했습니다. 다시 시도해 주세요.";
  }
  if (code === "NO_GROUNDED_ANSWER") {
    return "등록된 문서에서 질문에 맞는 근거를 찾지 못했습니다. 문서명이나 표현을 바꿔 다시 질문해 주세요.";
  }
  if (code === "PROCESSING_FAILED") {
    return "내부 처리 오류가 발생했습니다. 계속되면 관리자에게 문의해 주세요.";
  }
  return "질문을 처리하지 못했습니다. 입력은 유지됩니다.";
}

export function ragJobStatusMessage(job: RagJob | undefined): string | null {
  if (job?.status === "FAILED") return problemMessage(job.failure_code);
  if (!job?.answer) return "답변을 준비하고 있습니다.";
  return null;
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positive(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
