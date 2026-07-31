"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  isChatMessageMutationPending,
  type ChatMessageMutationStartResult,
  type ChatMessageMutationViewState,
} from "@/components/chat-message-mutation-state";

type ChatMessageActionsPopoverProps = Readonly<{
  content: string;
  mutation: ChatMessageMutationViewState | null;
  onDelete: () => ChatMessageMutationStartResult;
  onEdit: (content: string) => ChatMessageMutationStartResult;
  triggerClassName: string;
}>;

type PopoverMode = "menu" | "edit" | "delete";

export function ChatMessageActionsPopover({
  content,
  mutation,
  onDelete,
  onEdit,
  triggerClassName,
}: ChatMessageActionsPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editInputId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const [mode, setMode] = useState<PopoverMode>("menu");
  const [draft, setDraft] = useState(content);
  const [error, setError] = useState<string | null>(null);
  const [activeMutationId, setActiveMutationId] = useState<string | null>(null);
  const pending = isChatMessageMutationPending(mutation);
  const activeMutation = mutation?.clientMutationId === activeMutationId ? mutation : null;
  const completed = activeMutation?.status === "completed";
  const visible = isOpen && !completed;
  const mutationError =
    activeMutation?.status === "failed" || activeMutation?.status === "cancelled"
      ? activeMutation.error
      : null;
  const displayedError = error ?? mutationError;

  useEffect(() => {
    if (!visible) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible]);

  const start = (result: ChatMessageMutationStartResult) => {
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setActiveMutationId(result.clientMutationId);
    setError(null);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={visible}
        aria-haspopup="dialog"
        className={`${triggerClassName} cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300`}
        onClick={() => {
          const rootBounds = rootRef.current?.getBoundingClientRect();
          const viewportBounds = rootRef.current
            ?.closest<HTMLElement>('[role="log"]')
            ?.getBoundingClientRect();

          if (rootBounds && viewportBounds) {
            const availableAbove = rootBounds.top - viewportBounds.top;
            const availableBelow = viewportBounds.bottom - rootBounds.bottom;
            setPlacement(
              availableAbove < 220 && availableBelow > availableAbove ? "below" : "above",
            );
          }

          if (visible) {
            setIsOpen(false);
            return;
          }

          setActiveMutationId(null);
          setDraft(content);
          setError(null);
          setMode("menu");
          setIsOpen(true);
        }}
        type="button"
      >
        {content}
      </button>

      {visible ? (
        <div
          aria-label="메시지 작업"
          className={`absolute right-0 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3 text-slate-950 shadow-xl ${
            placement === "above" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
          role="dialog"
        >
          {mode === "menu" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                className="secondary-button"
                disabled={pending}
                onClick={() => setMode("edit")}
                type="button"
              >
                수정
              </button>
              <button
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                onClick={() => setMode("delete")}
                type="button"
              >
                삭제
              </button>
            </div>
          ) : null}

          {mode === "edit" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                start(onEdit(draft));
              }}
            >
              <label className="text-xs font-semibold text-slate-700" htmlFor={editInputId}>
                메시지 수정
              </label>
              <textarea
                autoFocus
                className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={pending}
                id={editInputId}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError(null);
                }}
                value={draft}
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  className="secondary-button"
                  disabled={pending}
                  onClick={() => setMode("menu")}
                  type="button"
                >
                  취소
                </button>
                <button className="primary-button" disabled={pending} type="submit">
                  {pending ? "수정 중…" : "저장"}
                </button>
              </div>
            </form>
          ) : null}

          {mode === "delete" ? (
            <div>
              <p className="text-sm font-semibold">이 메시지를 삭제할까요?</p>
              <p className="mt-1 text-xs text-slate-500">
                메시지 위치는 유지되고 삭제된 메시지로 표시됩니다.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  className="secondary-button"
                  disabled={pending}
                  onClick={() => setMode("menu")}
                  type="button"
                >
                  취소
                </button>
                <button
                  className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pending}
                  onClick={() => start(onDelete())}
                  type="button"
                >
                  {pending ? "삭제 중…" : "삭제"}
                </button>
              </div>
            </div>
          ) : null}

          {displayedError ? (
            <p className="mt-3 text-xs text-red-700" role="alert">
              {displayedError}
            </p>
          ) : null}

          {pending && mutation?.status === "retry-waiting" ? (
            <p className="mt-3 text-xs text-slate-500" role="status">
              잠시 후 자동으로 다시 시도합니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
