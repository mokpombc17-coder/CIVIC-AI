"use client";

import Image from "next/image";
import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type FormEventHandler,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  RoomCreationRequestListContent,
  type RoomCreationRequestListContentProps,
} from "@/components/chat/room-creation-request-list-view";
import { useCreateChatRoomForm } from "@/components/chat/use-create-chat-room-form";
import { useRoomCreationRequestListScreen } from "@/components/chat/use-room-creation-request-list-screen";

export const CREATE_CHAT_ROOM_FORM_ID = "create-room-form";

export type CreateChatRoomFormMode = "form" | "received";
export type CreateChatRoomFormViewMode = "request" | "history";

type CreateChatRoomFormViewProps = Readonly<{
  activeView: CreateChatRoomFormViewMode;
  canRetry: boolean;
  canSubmit: boolean;
  errorMessage: string | null;
  isPending: boolean;
  mode: CreateChatRoomFormMode;
  onCancel: () => void;
  onFormChange: () => void;
  onRequestAgain: () => void;
  onRequestSubmit: FormEventHandler<HTMLFormElement>;
  onRetry: () => void;
  onViewChange: (view: CreateChatRoomFormViewMode) => void;
  requestList: RoomCreationRequestListContentProps;
  validationError: string | null;
}>;

export function CreateChatRoomForm({ onCancel }: Readonly<{ onCancel: () => void }>) {
  const form = useCreateChatRoomForm();
  const requestList = useRoomCreationRequestListScreen();
  const [activeView, setActiveView] = useState<CreateChatRoomFormViewMode>("request");

  return (
    <CreateChatRoomFormView
      activeView={activeView}
      canRetry={form.canRetry}
      canSubmit={form.canSubmit}
      errorMessage={form.errorMessage}
      isPending={form.isPending}
      mode={form.creationRequestResult ? "received" : "form"}
      onCancel={onCancel}
      onFormChange={form.clearFailedAttempt}
      onRequestAgain={form.startNewRequest}
      onRequestSubmit={form.handleSubmit}
      onRetry={form.retry}
      onViewChange={setActiveView}
      requestList={requestList}
      validationError={form.validationError}
    />
  );
}

export function CreateChatRoomFormView({
  activeView,
  canRetry,
  canSubmit,
  errorMessage,
  isPending,
  mode,
  onCancel,
  onFormChange,
  onRequestAgain,
  onRequestSubmit,
  onRetry,
  onViewChange,
  requestList,
  validationError,
}: CreateChatRoomFormViewProps) {
  const titleId = useId();
  const historySectionRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.closest("[hidden]"));
    const first = focusableElements[0];
    const last = focusableElements.at(-1);

    if (!first || !last) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function showRequestHistory() {
    onViewChange("history");
    requestAnimationFrame(() => historySectionRef.current?.focus());
  }

  return (
    <div
      className="relative flex size-full items-end justify-center bg-[#121417]/[0.56]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative flex h-[540px] max-h-[calc(100%-1rem)] w-full max-w-[393px] flex-col overflow-hidden rounded-t-xl border border-b-0 border-[var(--chat-publishing-color-border)] bg-white px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[var(--chat-publishing-color-text)] shadow-[0_16px_40px_rgba(18,20,23,0.2)]"
        data-create-chat-room-sheet={mode}
        data-create-chat-room-view={activeView}
        id={CREATE_CHAT_ROOM_FORM_ID}
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="flex min-h-11 items-start justify-between gap-4">
          <h2 className="min-w-0 pt-1 text-2xl font-bold leading-[32.4px]" id={titleId}>
            토론방 생성
          </h2>
          <button
            aria-label="토론방 생성 닫기"
            className="flex size-11 shrink-0 items-center justify-center rounded-md transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
            onClick={onCancel}
            type="button"
          >
            <Image alt="" aria-hidden="true" height={24} src="/assets/chat/close.png" width={24} />
          </button>
        </div>

        <div aria-label="토론방 생성 화면" className="mt-3 flex items-center gap-1.5" role="group">
          <button
            aria-pressed={activeView === "request"}
            className={getViewButtonClassName(activeView === "request")}
            onClick={() => onViewChange("request")}
            type="button"
          >
            요청
          </button>
          <button
            aria-pressed={activeView === "history"}
            className={getViewButtonClassName(activeView === "history")}
            onClick={() => onViewChange("history")}
            type="button"
          >
            내역
          </button>
        </div>

        <div
          className="mt-3 min-h-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
          data-create-chat-room-panel="request"
          hidden={activeView !== "request"}
        >
          {mode === "form" ? (
            <form
              className="grid min-h-[368px] gap-3 rounded-lg border border-[var(--chat-publishing-color-border)] bg-white p-5"
              onChange={onFormChange}
              onSubmit={onRequestSubmit}
            >
              {validationError || errorMessage ? (
                <div
                  className="rounded-[var(--chat-publishing-radius-control)] border border-[#ffc95c] bg-[#fff7e8] px-3 py-2.5 text-[13px] leading-[19.5px] text-[#7a4b00]"
                  data-chat-form-feedback={validationError ? "validation-error" : "request-error"}
                  role="alert"
                >
                  <p className="font-semibold">{validationError ?? errorMessage}</p>
                  {canRetry ? (
                    <button
                      className="mt-2 inline-flex min-h-10 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-3 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
                      onClick={onRetry}
                      type="button"
                    >
                      같은 요청으로 다시 시도
                    </button>
                  ) : null}
                </div>
              ) : null}

              <RequestField id="create-room-name" label="제목" maxLength={100}>
                <input
                  autoFocus={activeView === "request"}
                  aria-describedby="create-room-name-help"
                  className={INPUT_CLASS_NAME}
                  disabled={isPending}
                  id="create-room-name"
                  maxLength={100}
                  minLength={1}
                  name="name"
                  placeholder="예) 청년 주거 정책 같이 보기..."
                  required
                />
              </RequestField>

              <RequestField id="create-room-description" label="상세 설명" maxLength={500}>
                <textarea
                  aria-describedby="create-room-description-help"
                  className={`${INPUT_CLASS_NAME} h-[100px] resize-none py-3`}
                  disabled={isPending}
                  id="create-room-description"
                  maxLength={500}
                  minLength={1}
                  name="description"
                  placeholder="예) 청년 주거 정책의 지원 대상과 신청 기준을 함께 확인하고 의견을 나눕니다...."
                  required
                />
              </RequestField>

              <button
                className="mt-auto inline-flex h-12 w-full items-center justify-center rounded-md bg-[var(--chat-publishing-color-primary)] px-4 text-base font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSubmit}
                type="submit"
              >
                {isPending ? "요청 중…" : "요청하기"}
              </button>
            </form>
          ) : (
            <section
              aria-live="polite"
              className="rounded-lg border border-[#9ed1fa] bg-[#edf7ff] p-4"
              data-chat-form-feedback="success"
              role="status"
            >
              <Image alt="" aria-hidden="true" height={24} src="/assets/chat/info.png" width={24} />
              <strong className="mt-3 block text-base font-bold leading-6 text-[#085985]">
                검토 대기
              </strong>
              <p className="mt-2 text-sm leading-[21px] text-[var(--chat-publishing-color-text)]">
                요청이 접수되었습니다. 요청 내역에서 처리 상태를 확인할 수 있습니다.
              </p>
              <div className="mt-5 grid gap-2">
                <button
                  autoFocus={activeView === "request"}
                  className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[var(--chat-publishing-color-primary)] px-4 text-base font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
                  onClick={showRequestHistory}
                  type="button"
                >
                  요청 내역 보기
                </button>
                <button
                  className="inline-flex h-12 w-full items-center justify-center rounded-md border border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-accent-soft)] px-4 text-base font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[#e2eaff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
                  onClick={onRequestAgain}
                  type="button"
                >
                  새 요청 작성
                </button>
              </div>
            </section>
          )}
        </div>

        <div
          aria-label="토론방 생성 내역"
          className="mt-3 min-h-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
          data-create-chat-room-panel="history"
          hidden={activeView !== "history"}
          ref={historySectionRef}
          tabIndex={-1}
        >
          <div
            className="grid min-h-[368px] min-w-0 max-w-full content-start bg-white"
            data-create-chat-room-list-surface="true"
          >
            <div className="min-w-0 max-w-full">
              <RoomCreationRequestListContent {...requestList} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

const INPUT_CLASS_NAME =
  "h-12 w-full rounded-md border border-[#59616b] bg-white px-3 text-[15px] leading-[22.5px] text-[var(--chat-publishing-color-text)] placeholder:text-[#747d87] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--chat-publishing-color-primary)]";

function getViewButtonClassName(isSelected: boolean): string {
  return isSelected
    ? "inline-flex h-11 items-center justify-center rounded-[var(--chat-publishing-radius-pill)] border border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-accent-soft)] px-3 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)]"
    : "inline-flex h-11 items-center justify-center rounded-[var(--chat-publishing-radius-pill)] border border-[#8a949e] bg-white px-3 text-sm font-medium text-[#1f2124]";
}

function RequestField({
  children,
  id,
  label,
  maxLength,
}: Readonly<{
  children: ReactNode;
  id: string;
  label: string;
  maxLength: number;
}>) {
  const [characterCount, setCharacterCount] = useState(0);
  const help = characterCount === 0 ? `1~${maxLength}자` : `${characterCount} / ${maxLength}자`;

  function handleInput(event: FormEvent<HTMLDivElement>) {
    const control = event.target as HTMLInputElement | HTMLTextAreaElement;
    setCharacterCount(control.value.length);
  }

  return (
    <div className="grid gap-1.5" onInput={handleInput}>
      <label className="text-[15px] font-bold leading-[22.5px]" htmlFor={id}>
        {label}
      </label>
      {children}
      <span
        className="text-[13px] leading-[19.5px] text-[var(--chat-publishing-color-muted)]"
        id={`${id}-help`}
      >
        {help}
      </span>
    </div>
  );
}
