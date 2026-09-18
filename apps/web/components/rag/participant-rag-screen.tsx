"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { ScreenDefinition } from "@/lib/screens/registry";
import type { RagQuery } from "./rag-functional-screen";
import { ragScreenPrimaryActions } from "./rag-screen-actions";
import { ReadOnlyPdfViewer } from "./read-only-pdf-viewer";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RagCitationSources, SafeMarkdownAnswer } from "./safe-markdown-answer";
import { RAG_NEW_QUESTION_REQUEST_EVENT } from "./rag-new-question-header-action";
import { RagIntroBanner } from "./rag-intro-banner";
import {
  participantDocumentSourcePath,
  ParticipantDocumentCatalog,
  type ParticipantDocumentCatalogItem,
} from "./participant-document-catalog";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import {
  clearRagConversationDraft,
  clearRagConversationSnapshot,
  latestPendingRagJobId,
  readRagConversationDraft,
  readRagConversationSnapshot,
  writeRagConversationDraft,
  writeRagConversationSnapshot,
  type Citation,
  type Message,
  type RagJob,
  type RagProgress,
  type RagProgressStage,
  RAG_PROGRESS_STAGES,
} from "./rag-conversation-session";

export {
  clearRagConversationDraft,
  clearRagConversationSnapshot,
  latestPendingRagJobId,
  readRagConversationDraft,
  readRagConversationSnapshot,
  writeRagConversationDraft,
  writeRagConversationSnapshot,
} from "./rag-conversation-session";
export type {
  Citation,
  Message,
  RagConversationSnapshot,
  RagJob,
  RagProgress,
  RagProgressStage,
} from "./rag-conversation-session";

function clockLabel(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export type RagLiveJob = Readonly<{
  progress: RagProgress;
  streamedAnswer: string;
}>;

type RagLiveJobs = Readonly<Record<string, RagLiveJob>>;

const RAG_NO_MATCH_ANSWER = "제공된 문서에서 매칭되는 정보를 찾지 못했습니다.";

type RagQuestionKeyDownEvent = Readonly<{
  key: string;
  shiftKey: boolean;
  nativeEvent: Pick<globalThis.KeyboardEvent, "isComposing" | "keyCode">;
  currentTarget: Readonly<{ form: Pick<HTMLFormElement, "requestSubmit"> | null }>;
  preventDefault: () => void;
}>;

export function submitRagQuestionOnEnter(event: RagQuestionKeyDownEvent): void {
  const isComposing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
  if (event.key !== "Enter" || event.shiftKey || isComposing) return;

  const form = event.currentTarget.form;
  if (!form) return;
  event.preventDefault();
  form.requestSubmit();
}

const QUEUED_PROGRESS: RagProgress = {
  status: "QUEUED",
  stage: "QUEUED",
  label: "질문을 접수하고 처리 순서를 확인하고 있어요",
  detail: "곧 문서 검색을 시작합니다. 화면을 벗어나도 질문은 안전하게 유지됩니다.",
  progress_percent: 4,
  estimated_remaining_seconds: 20,
  elapsed_seconds: 0,
};

const STREAMING_PROGRESS: RagProgress = {
  status: "RUNNING",
  stage: "STREAMING",
  label: "답변을 실시간으로 전송하고 있어요",
  detail: "답변이 만들어지는 순서대로 화면에 표시합니다.",
  progress_percent: 97,
  estimated_remaining_seconds: 1,
  elapsed_seconds: 0,
};

export const RAG_SESSION_EXPIRED_MESSAGE = "세션이 만료되었습니다. 다시 로그인 해주세요.";
export const RAG_SESSION_LOGIN_HREF = "/login?returnTo=%2Frag" as Route;

export class RagSessionExpiredError extends Error {
  constructor() {
    super(RAG_SESSION_EXPIRED_MESSAGE);
    this.name = "RagSessionExpiredError";
  }
}

type UpdateRagLiveJobs = (update: (current: RagLiveJobs) => RagLiveJobs) => void;

function startLiveJob(updateLiveJobs: UpdateRagLiveJobs, jobId: string): void {
  updateLiveJobs((current) => ({
    ...current,
    [jobId]: {
      progress: QUEUED_PROGRESS,
      streamedAnswer: "",
    },
  }));
}

function finishLiveJob(updateLiveJobs: UpdateRagLiveJobs, jobId: string): void {
  updateLiveJobs((current) => {
    if (!(jobId in current)) return current;
    const next = { ...current };
    delete next[jobId];
    return next;
  });
}

function liveStreamOptions(
  updateLiveJobs: UpdateRagLiveJobs,
  jobId: string,
  signal: AbortSignal,
): StreamResultOptions {
  return {
    signal,
    onProgress: (progress) => {
      updateLiveJobs((current) => {
        const previous = current[jobId];
        return {
          ...current,
          [jobId]: {
            progress,
            streamedAnswer: previous?.streamedAnswer ?? "",
          },
        };
      });
    },
    onAnswerStart: () => {
      updateLiveJobs((current) => {
        return {
          ...current,
          [jobId]: {
            progress: STREAMING_PROGRESS,
            streamedAnswer: "",
          },
        };
      });
    },
    onAnswerDelta: (delta) => {
      updateLiveJobs((current) => {
        const previous = current[jobId];
        if (!previous) return current;
        const nextAnswer = `${previous.streamedAnswer}${delta}`;
        return {
          ...current,
          [jobId]: {
            ...previous,
            streamedAnswer: nextAnswer.length <= 120_000 ? nextAnswer : previous.streamedAnswer,
          },
        };
      });
    },
    onAnswerReset: () => {
      updateLiveJobs((current) => {
        const previous = current[jobId];
        if (!previous) return current;
        return {
          ...current,
          [jobId]: {
            ...previous,
            streamedAnswer: "",
          },
        };
      });
    },
  };
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
        <RagReferenceSurface>
          <ReadOnlyPdfViewer
            currentPage={page}
            documentTitle={title}
            sourceUrl={`/api/v1/rag/sources/${encodeURIComponent(versionId)}/pages/${page}`}
            totalPages={Math.max(page, total)}
          />
        </RagReferenceSurface>
        <span className="civic-screen-action-label">{ragScreenPrimaryActions[screen.id]}</span>
      </ScreenFrame>
    );
  }
  return <RagConversation screen={screen} {...(userId ? { userId } : {})} />;
}

function RagConversationRestorePlaceholder() {
  return (
    <>
      <span aria-hidden="true" className="civic-skeleton civic-skeleton-chat-question" />
      <span aria-hidden="true" className="civic-skeleton civic-skeleton-chat-answer" />
      <span aria-hidden="true" className="civic-skeleton civic-skeleton-chat-question" />
      <span aria-hidden="true" className="civic-skeleton civic-skeleton-chat-answer" />
    </>
  );
}

function RagConversation({
  screen,
  userId,
}: Readonly<{ screen: ScreenDefinition; userId?: string }>) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [activeCatalogDocument, setActiveCatalogDocument] =
    useState<ParticipantDocumentCatalogItem | null>(null);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [liveJobs, setLiveJobs] = useState<RagLiveJobs>({});
  const [restored, setRestored] = useState(!userId);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [newQuestionDialogOpen, setNewQuestionDialogOpen] = useState(false);
  const activePoll = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const restoredQueryChecked = useRef(false);
  const queryOperation = useRef(createQueryOperation());
  const messagesRef = useRef<HTMLDivElement>(null);
  const submittedMessageIdToScroll = useRef<string | null>(null);
  const [notice, setNotice] = useState("");
  const handleCatalogSourceUnavailable = useCallback(() => {
    setActiveCatalogDocument(null);
    setCatalogRevision((current) => current + 1);
    setNotice("문서가 변경되어 목록을 새로 불러왔습니다.");
  }, []);
  const streamedAnswerLength = Object.values(liveJobs).reduce(
    (total, liveJob) => total + liveJob.streamedAnswer.length,
    0,
  );

  useEffect(() => {
    if (streamedAnswerLength === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const messages = messagesRef.current;
      if (messages) scrollRagMessagesToLatest(messages);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [streamedAnswerLength]);

  useEffect(() => {
    const messageId = submittedMessageIdToScroll.current;
    if (!messageId) return;
    const frame = window.requestAnimationFrame(() => {
      const messages = messagesRef.current;
      if (!messages) return;
      const exchange = Array.from(messages.children).find(
        (element) => element.getAttribute("data-rag-message-id") === messageId,
      );
      const submittedQuestion = exchange?.querySelector<HTMLElement>(".civic-rag-question");
      if (!submittedQuestion) return;
      submittedMessageIdToScroll.current = null;
      scrollRagQuestionIntoView(messages, submittedQuestion);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  useEffect(() => {
    if (!userId) return;
    const storage = browserRagConversationStorage();
    const snapshot = storage ? readRagConversationSnapshot(storage, userId) : null;
    const draft = storage ? readRagConversationDraft(storage, userId) : null;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (snapshot) {
        setMessages(snapshot.messages);
        setCurrentSessionId(snapshot.sessionId);
      }
      if (draft !== null) setQuestion(draft);
      if (storage) clearRagConversationDraft(storage);
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
      if (!cancelled) {
        setBusy(true);
        startLiveJob(setLiveJobs, pendingJobId);
      }
    });
    void waitForStreamedResult(
      pendingJobId,
      liveStreamOptions(setLiveJobs, pendingJobId, controller.signal),
    )
      .then((result) => {
        if (requestGeneration.current !== generation) return;
        finishLiveJob(setLiveJobs, pendingJobId);
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
        finishLiveJob(setLiveJobs, pendingJobId);
        if (error instanceof RagSessionExpiredError) {
          setNotice(RAG_SESSION_EXPIRED_MESSAGE);
          return;
        }
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

  useEffect(() => {
    const openNewQuestionDialog = () => setNewQuestionDialogOpen(true);
    window.addEventListener(RAG_NEW_QUESTION_REQUEST_EVENT, openNewQuestionDialog);
    return () => window.removeEventListener(RAG_NEW_QUESTION_REQUEST_EVENT, openNewQuestionDialog);
  }, []);

  function preserveDraftForLogin(): void {
    if (!userId) return;
    const storage = browserRagConversationStorage();
    if (!storage) return;
    writeRagConversationDraft(storage, userId, question);
  }

  function startNewQuestion(): void {
    requestGeneration.current += 1;
    activePoll.current?.abort();
    activePoll.current = null;
    queryOperation.current.clear();
    submittedMessageIdToScroll.current = null;
    setCurrentSessionId(null);
    const storage = browserRagConversationStorage();
    if (storage) clearRagConversationSnapshot(storage);
    setMessages([]);
    setLiveJobs({});
    setActiveCatalogDocument(null);
    setQuestion("");
    setBusy(false);
    setNewQuestionDialogOpen(false);
    setNotice("");
  }

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
    let activeJobId: string | null = null;
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
        setNotice(problemMessage(submission.code, submission.status));
        return;
      }
      const accepted = submission.job;
      activeJobId = accepted.job_id;
      if (accepted.session_id) setCurrentSessionId(accepted.session_id);
      startLiveJob(setLiveJobs, accepted.job_id);
      submittedMessageIdToScroll.current = accepted.job_id;
      setMessages((current) => [
        ...current,
        { askedAt: clockLabel(), id: accepted.job_id, question: submitted },
      ]);
      setQuestion("");
      const result = await waitForStreamedResult(
        accepted.job_id,
        liveStreamOptions(setLiveJobs, accepted.job_id, controller.signal),
      );
      if (requestGeneration.current !== generation) return;
      finishLiveJob(setLiveJobs, accepted.job_id);
      setMessages((current) =>
        current.map((message) =>
          message.id === accepted.job_id
            ? { ...message, answeredAt: clockLabel(), job: result }
            : message,
        ),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (activeJobId) finishLiveJob(setLiveJobs, activeJobId);
      if (error instanceof RagSessionExpiredError) {
        setNotice(RAG_SESSION_EXPIRED_MESSAGE);
        return;
      }
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
        <RagIntroBanner />
        <div
          aria-busy={!restored}
          aria-label={restored ? "현재 RAG 대화" : "저장된 RAG 대화를 불러오는 중"}
          className={`civic-rag-messages${restored ? "" : " civic-loading-rag-messages"}`}
          data-rag-conversation-restoring={restored ? undefined : "true"}
          ref={messagesRef}
          role="log"
        >
          {!restored ? (
            <RagConversationRestorePlaceholder />
          ) : messages.length === 0 ? (
            <div aria-hidden="true" className="civic-rag-empty" />
          ) : (
            messages.map((message) => (
              <RagMessage
                key={message.id}
                message={message}
                onOpenCitation={setActiveCitation}
                onUseSuggestion={setQuestion}
                {...(liveJobs[message.id] ? { liveJob: liveJobs[message.id] } : {})}
              />
            ))
          )}
          {busy && Object.keys(liveJobs).length === 0 ? (
            <p aria-live="polite" className="civic-rag-generating">
              질문을 안전하게 접수하고 있어요.
            </p>
          ) : null}
        </div>
        <RagNotice notice={notice} onLogin={preserveDraftForLogin} />
        {restored && messages.length === 0 ? (
          <ParticipantDocumentCatalog
            key={catalogRevision}
            onOpenDocument={setActiveCatalogDocument}
          />
        ) : null}
        <form className="civic-rag-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="rag-question">
            메시지 입력
          </label>
          <textarea
            id="rag-question"
            maxLength={8000}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={submitRagQuestionOnEnter}
            placeholder="궁금한 내용을 입력해 주세요"
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
      <ConfirmDialog
        cancelLabel="취소"
        confirmLabel="새 대화 시작"
        description="현재 대화 내용은 저장되지 않습니다."
        onCancel={() => setNewQuestionDialogOpen(false)}
        onConfirm={startNewQuestion}
        open={newQuestionDialogOpen}
        scope="platform"
        title="새 대화를 시작할까요?"
      />
      {activeCitation ? (
        <RagReferenceSurface>
          <ReadOnlyPdfViewer
            currentPage={activeCitation.page_number}
            documentTitle={activeCitation.title ?? "인용 문서"}
            onClose={() => setActiveCitation(null)}
            sourceUrl={`/api/v1/rag/sources/${encodeURIComponent(activeCitation.document_version_id)}/pages/${activeCitation.page_number}`}
            totalPages={citationTotalPages(activeCitation)}
          />
        </RagReferenceSurface>
      ) : null}
      {activeCatalogDocument ? (
        <RagReferenceSurface>
          <ReadOnlyPdfViewer
            currentPage={1}
            documentTitle={activeCatalogDocument.filename}
            onClose={() => setActiveCatalogDocument(null)}
            onSourceUnavailable={handleCatalogSourceUnavailable}
            sourceUrl={participantDocumentSourcePath(activeCatalogDocument)}
            totalPages={activeCatalogDocument.page_count}
          />
        </RagReferenceSurface>
      ) : null}
    </ScreenFrame>
  );
}

function RagReferenceSurface({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="wf-rag-reference-layer" data-wireflow-layout="rag-reference-modal">
      <section
        aria-label="참조 문서"
        className="wf-rag-reference-dialog"
        data-rag-reference-surface="true"
      >
        {children}
      </section>
    </div>
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

export function RagNotice({ notice, onLogin }: Readonly<{ notice: string; onLogin?: () => void }>) {
  if (!notice) return null;
  return (
    <p aria-live="polite" className="civic-form-message">
      {notice}
      {notice === RAG_SESSION_EXPIRED_MESSAGE ? (
        <>
          {" "}
          <Link href={RAG_SESSION_LOGIN_HREF} {...(onLogin ? { onClick: onLogin } : {})}>
            로그인
          </Link>
        </>
      ) : null}
    </p>
  );
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
  | Readonly<{ kind: "problem"; code: string | undefined; status: number }>
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
    return { kind: "problem", code, status: response.status };
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

export function RagMessage({
  liveJob,
  message,
  onOpenCitation,
  onUseSuggestion,
}: Readonly<{
  liveJob?: RagLiveJob;
  message: Message;
  onOpenCitation: (citation: Citation) => void;
  onUseSuggestion: (suggestion: string) => void;
}>) {
  const statusMessage = ragJobStatusMessage(message.job);
  const citations = message.job?.citations ?? [];
  const showStreamingAnswer = Boolean(liveJob?.streamedAnswer);
  const showProgress = Boolean(liveJob && !showStreamingAnswer);
  const showNoMatchAnswer =
    !liveJob && statusMessage === null && message.job?.answer?.trim() === RAG_NO_MATCH_ANSWER;
  return (
    <article className="civic-rag-exchange" data-rag-message-id={message.id}>
      <div className="civic-rag-question-row">
        <div className="civic-rag-question-content">
          <p className="civic-rag-question">{message.question}</p>
        </div>
      </div>
      <div className="civic-rag-answer-row">
        <header className="civic-rag-answer-meta">
          <strong>CIVIC.AI</strong>
        </header>
        <div
          aria-busy={liveJob ? true : undefined}
          aria-label={liveJob && showStreamingAnswer ? "실시간 답변" : undefined}
          className={`civic-rag-answer${liveJob ? " is-live" : ""}${showStreamingAnswer ? " is-streaming-answer" : ""}${showProgress ? " is-progress-only" : ""}${showNoMatchAnswer ? " is-no-match" : ""}`}
        >
          {liveJob ? (
            showStreamingAnswer ? (
              <SafeMarkdownAnswer answer={liveJob.streamedAnswer} citations={[]} />
            ) : (
              <RagLiveProgress liveJob={liveJob} />
            )
          ) : statusMessage ? (
            <p role={message.job?.status === "FAILED" ? "alert" : undefined}>{statusMessage}</p>
          ) : message.job?.answer ? (
            <SafeMarkdownAnswer
              answer={message.job.answer}
              citations={citations}
              onOpenCitation={onOpenCitation}
            />
          ) : null}
        </div>
        {!liveJob && message.job?.answer ? (
          <RagCitationSources
            answer={message.job.answer}
            citations={citations}
            onOpenCitation={onOpenCitation}
          />
        ) : null}
        {message.job?.suggestions?.length ? (
          <RagSuggestionChips onSelect={onUseSuggestion} suggestions={message.job.suggestions} />
        ) : null}
      </div>
    </article>
  );
}

type RagMessagesScrollTarget = Pick<HTMLDivElement, "scrollHeight" | "scrollTo">;
type RagQuestionContainerScrollTarget = Pick<HTMLDivElement, "scrollTo" | "scrollTop"> &
  Readonly<{ getBoundingClientRect: () => Pick<DOMRect, "top"> }>;
type RagQuestionScrollTarget = Readonly<{
  getBoundingClientRect: () => Pick<DOMRect, "top">;
}>;

export function scrollRagQuestionIntoView(
  messages: RagQuestionContainerScrollTarget,
  question: RagQuestionScrollTarget,
): void {
  const messageTop = messages.getBoundingClientRect().top;
  const questionTop = question.getBoundingClientRect().top;
  messages.scrollTo({ behavior: "smooth", top: messages.scrollTop + questionTop - messageTop });
}

export function scrollRagMessagesToLatest(messages: RagMessagesScrollTarget): void {
  messages.scrollTo({ behavior: "smooth", top: messages.scrollHeight });
}

const RAG_PROGRESS_STEPS = [
  {
    active: "질문에서 찾아볼 내용을 정리하고 있습니다.",
    completed: "찾아볼 내용을 정리했습니다.",
    pending: "찾아볼 내용 정리",
  },
  {
    active: "답변에 참고할 문서 후보를 찾고 있습니다.",
    completed: "확인할 문서 후보를 선별했습니다.",
    pending: "문서 후보 찾기",
  },
  {
    active: "문서에 답변할 근거가 있는지 확인하고 있습니다.",
    completed: "답변할 근거가 있는지 확인했습니다.",
    pending: "답변 근거 확인",
  },
  {
    active: "확인 결과를 바탕으로 답변을 작성하고 있습니다.",
    completed: "답변 작성을 완료했습니다.",
    pending: "답변 작성",
  },
] as const;

function ragProgressStepIndex(stage: RagProgressStage): 0 | 1 | 2 | 3 {
  switch (stage) {
    case "QUEUED":
    case "UNDERSTANDING":
      return 0;
    case "SEARCHING":
      return 1;
    case "READING":
      return 2;
    case "COMPOSING":
    case "VERIFYING":
    case "STREAMING":
      return 3;
  }
}

export function ragLoadingLabel(stage: RagProgressStage): string {
  return RAG_PROGRESS_STEPS[ragProgressStepIndex(stage)].active;
}

export function RagLiveProgress({ liveJob }: Readonly<{ liveJob: RagLiveJob }>) {
  const currentStep = ragProgressStepIndex(liveJob.progress.stage);
  return (
    <section aria-label="RAG 답변 생성 중" className="civic-rag-live-progress" role="status">
      <ol className="civic-rag-progress-steps">
        {RAG_PROGRESS_STEPS.map((step, index) => {
          const state =
            index < currentStep ? "completed" : index === currentStep ? "current" : "pending";
          const label =
            state === "completed"
              ? step.completed
              : state === "current"
                ? step.active
                : step.pending;
          return (
            <li
              aria-current={state === "current" ? "step" : undefined}
              data-state={state}
              key={step.pending}
            >
              {state === "completed" ? (
                <span aria-hidden="true" className="civic-rag-progress-completed">
                  ✓
                </span>
              ) : state === "current" ? (
                <span aria-hidden="true" className="civic-rag-loading-spinner" />
              ) : (
                <span aria-hidden="true" className="civic-rag-progress-placeholder" />
              )}
              {state === "current" ? (
                <strong className="civic-rag-loading-label">{label}</strong>
              ) : (
                <span className="civic-rag-progress-label">{label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function RagSuggestionChips({
  onSelect,
  suggestions,
}: Readonly<{ onSelect: (suggestion: string) => void; suggestions: readonly string[] }>) {
  const uniqueSuggestions = Array.from(
    new Set(suggestions.map((value) => value.trim()).filter(Boolean)),
  );
  if (!uniqueSuggestions.length) return null;
  return (
    <section aria-label="질문 제안" className="civic-rag-suggestions">
      <strong>이렇게 질문해 보세요</strong>
      <div>
        {uniqueSuggestions.map((suggestion) => (
          <button key={suggestion} onClick={() => onSelect(suggestion)} type="button">
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}

export function citationHref(citation: Citation): Route {
  return `/rag/source?versionId=${encodeURIComponent(citation.document_version_id)}&page=${citation.page_number}&total=${citationTotalPages(citation)}&title=${encodeURIComponent(citation.title ?? "인용 문서")}` as Route;
}

export function safeExternalSourceUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
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
  onProgress?: (progress: RagProgress) => void;
  request?: typeof fetch;
  signal?: AbortSignal;
  wait?: (milliseconds: number) => Promise<void>;
}>;

type EventSourceLike = Readonly<{
  addEventListener: (name: string, listener: (event: { data?: string }) => void) => void;
  close: () => void;
}> & { onerror: (() => void) | null };

type StreamResultOptions = Readonly<{
  request?: typeof fetch;
  createSource?: (url: string) => EventSourceLike;
  fallback?: (jobId: string, options: PollResultOptions) => Promise<RagJob>;
  onAnswerDelta?: (delta: string) => void;
  onAnswerReset?: () => void;
  onAnswerStart?: () => void;
  onProgress?: (progress: RagProgress) => void;
  signal?: AbortSignal;
  waitForAnswerPaint?: () => Promise<void>;
}>;

function waitForTwoAnimationFrames(): Promise<void> {
  if (typeof requestAnimationFrame === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function waitForStreamedResult(
  jobId: string,
  {
    request = authenticatedFetch,
    createSource,
    fallback = pollResult,
    onAnswerDelta,
    onAnswerReset,
    onAnswerStart,
    onProgress,
    signal,
    waitForAnswerPaint = waitForTwoAnimationFrames,
  }: StreamResultOptions = {},
): Promise<RagJob> {
  const fallbackResult = () =>
    fallback(jobId, {
      request,
      ...(onProgress ? { onProgress } : {}),
      ...(signal ? { signal } : {}),
    });
  if (signal?.aborted || (!createSource && typeof EventSource === "undefined")) {
    return fallbackResult();
  }
  const bootstrap = await request("/api/v1/rag/stream-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_id: jobId }),
    ...(signal ? { signal } : {}),
  }).catch(() => null);
  if (bootstrap?.status === 401) throw new RagSessionExpiredError();
  if (!bootstrap?.ok) return fallbackResult();
  const body = (await bootstrap.json().catch(() => null)) as { stream_path?: unknown } | null;
  if (!body || typeof body.stream_path !== "string") return fallbackResult();

  return new Promise<RagJob>((resolve, reject) => {
    const source = createSource
      ? createSource(body.stream_path as string)
      : new EventSource(body.stream_path as string);
    let settled = false;
    let answerDeltaReceived = false;
    const close = () => {
      source.close();
      signal?.removeEventListener("abort", abort);
    };
    const finish = async () => {
      if (settled) return;
      settled = true;
      close();
      try {
        if (answerDeltaReceived) await waitForAnswerPaint();
        const response = await request(`/api/v1/rag/queries/${encodeURIComponent(jobId)}`, {
          cache: "no-store",
          ...(signal ? { signal } : {}),
        });
        if (response.status === 401) throw new RagSessionExpiredError();
        if (!response.ok) throw new Error("query status unavailable");
        const result = (await response.json()) as RagJob;
        if (result.status !== "SUCCEEDED" && result.status !== "FAILED") {
          resolve(await fallbackResult());
          return;
        }
        resolve(result);
      } catch (error) {
        if (signal?.aborted) reject(new DOMException("query stream aborted", "AbortError"));
        else if (error instanceof RagSessionExpiredError) reject(error);
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
    source.addEventListener("query.progress", (event) => {
      const progress = readRagProgress(readRagStreamData(event.data));
      if (progress) onProgress?.(progress);
    });
    source.addEventListener("query.answer.started", () => onAnswerStart?.());
    source.addEventListener("query.answer.reset", () => onAnswerReset?.());
    source.addEventListener("query.answer.delta", (event) => {
      const value = readRagStreamData(event.data);
      if (
        value &&
        typeof value === "object" &&
        "delta" in value &&
        typeof value.delta === "string" &&
        value.delta.length <= 512
      ) {
        answerDeltaReceived = true;
        onAnswerDelta?.(value.delta);
      }
    });
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
    onProgress,
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
        if (response.status === 401) throw new RagSessionExpiredError();
        if (!isRetryableRagStatus(response.status)) throw new Error("query status unavailable");
      } else {
        const job = (await response.json()) as RagJob;
        const progress = readRagProgress(job.progress);
        if (progress) onProgress?.(progress);
        if (job.status === "SUCCEEDED" || job.status === "FAILED") return job;
      }
    } catch (error) {
      if (error instanceof RagSessionExpiredError) throw error;
      if (error instanceof Error && error.message === "query status unavailable") throw error;
    }
    await wait(1000);
  }
}

export function readRagProgress(value: unknown): RagProgress | null {
  if (!value || typeof value !== "object") return null;
  const progress = value as Partial<Record<keyof RagProgress, unknown>>;
  if (
    (progress.status !== "QUEUED" && progress.status !== "RUNNING") ||
    typeof progress.stage !== "string" ||
    !(RAG_PROGRESS_STAGES as readonly string[]).includes(progress.stage) ||
    typeof progress.label !== "string" ||
    progress.label.length < 1 ||
    progress.label.length > 200 ||
    typeof progress.detail !== "string" ||
    progress.detail.length < 1 ||
    progress.detail.length > 500 ||
    !isSafeProgressInteger(progress.progress_percent, 0, 100) ||
    !isSafeProgressInteger(progress.estimated_remaining_seconds, 0, 600) ||
    !isSafeProgressInteger(progress.elapsed_seconds, 0, 86_400)
  ) {
    return null;
  }
  return progress as RagProgress;
}

function readRagStreamData(data: string | undefined): unknown {
  if (!data) return null;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}

function isSafeProgressInteger(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

export function isRetryableRagStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function problemMessage(code?: string, status?: number) {
  if (status === 401 || code === "UNAUTHORIZED" || code === "INVALID_TOKEN") {
    return RAG_SESSION_EXPIRED_MESSAGE;
  }
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
