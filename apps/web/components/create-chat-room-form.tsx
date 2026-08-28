"use client";

import Image from "next/image";
import { useId, type FormEventHandler, type KeyboardEvent, type ReactNode } from "react";
import { useCreateChatRoomForm } from "@/components/use-create-chat-room-form";

export const CREATE_CHAT_ROOM_FORM_ID = "create-room-form";

export type CreateChatRoomFormMode = "form" | "received";

type CreateChatRoomFormViewProps = Readonly<{
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
  validationError: string | null;
}>;

export function CreateChatRoomForm({ onCancel }: Readonly<{ onCancel: () => void }>) {
  const form = useCreateChatRoomForm();

  return (
    <CreateChatRoomFormView
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
      validationError={form.validationError}
    />
  );
}

export function CreateChatRoomFormView({
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
  validationError,
}: CreateChatRoomFormViewProps) {
  const titleId = useId();

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
    ).filter((element) => !element.hasAttribute("hidden"));
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
        className={`relative w-full max-w-[393px] overflow-y-auto rounded-t-xl border border-b-0 border-[var(--chat-publishing-color-border)] bg-white px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[var(--chat-publishing-color-text)] shadow-[0_16px_40px_rgba(18,20,23,0.2)] ${
          mode === "form"
            ? "min-h-[500px] max-h-[calc(100%-1rem)]"
            : "h-[425px] max-h-[calc(100%-1rem)]"
        }`}
        data-create-chat-room-sheet={mode}
        id={CREATE_CHAT_ROOM_FORM_ID}
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="flex min-h-11 items-start justify-between gap-4">
          <h2 className="min-w-0 pt-1 text-2xl font-bold leading-[32.4px]" id={titleId}>
            {mode === "form" ? (
              "토론방 생성 요청"
            ) : (
              <>
                토론방 생성 요청을
                <br />
                접수했습니다
              </>
            )}
          </h2>
          <button
            aria-label="토론방 생성 요청 닫기"
            className="flex size-11 shrink-0 items-center justify-center rounded-md transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
            onClick={onCancel}
            type="button"
          >
            <Image alt="" aria-hidden="true" height={24} src="/assets/chat/close.png" width={24} />
          </button>
        </div>

        {mode === "form" ? (
          <form
            className="mt-2 grid min-h-[368px] gap-3 rounded-lg border border-[var(--chat-publishing-color-border)] bg-white p-5"
            onChange={onFormChange}
            onSubmit={onRequestSubmit}
          >
            <RequestField help="1~100자" id="create-room-name" label="제목">
              <input
                autoFocus
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

            <RequestField help="1~500자" id="create-room-description" label="상세 설명">
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

            {validationError || errorMessage ? (
              <div
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] leading-[19.5px] text-red-800"
                role="alert"
              >
                <p>{validationError ?? errorMessage}</p>
                {canRetry ? (
                  <button
                    className="mt-2 font-bold underline underline-offset-2"
                    onClick={onRetry}
                    type="button"
                  >
                    같은 요청으로 다시 시도
                  </button>
                ) : null}
              </div>
            ) : null}

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
            className="mt-5 h-[262px] rounded-lg border border-[#9ed1fa] bg-[#edf7ff] p-4"
          >
            <Image alt="" aria-hidden="true" height={24} src="/assets/chat/info.png" width={24} />
            <strong className="mt-3 block text-base font-bold leading-6 text-[#085985]">
              검토 대기
            </strong>
            <p className="mt-2 text-sm leading-[21px] text-[var(--chat-publishing-color-text)]">
              검토가 끝나면 가입하신 이메일로 알려드립니다.
              <br />
              생성이 완료되면 토론방 목록에서 확인할 수 있습니다.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                autoFocus
                className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[var(--chat-publishing-color-primary)] px-4 text-base font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
                onClick={onCancel}
                type="button"
              >
                토론방 목록으로
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
      </section>
    </div>
  );
}

const INPUT_CLASS_NAME =
  "h-12 w-full rounded-md border border-[#59616b] bg-white px-3 text-[15px] leading-[22.5px] text-[var(--chat-publishing-color-text)] placeholder:text-[#747d87] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--chat-publishing-color-primary)]";

function RequestField({
  children,
  help,
  id,
  label,
}: Readonly<{
  children: ReactNode;
  help: string;
  id: string;
  label: string;
}>) {
  return (
    <div className="grid gap-1.5">
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
