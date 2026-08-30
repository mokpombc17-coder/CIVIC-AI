"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export type ConfirmDialogProps = Readonly<{
  busy?: boolean;
  busyLabel?: string;
  cancelLabel?: string;
  confirmLabel: string;
  description: ReactNode;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}>;

export function ConfirmDialog({
  busy = false,
  busyLabel = "처리 중…",
  cancelLabel = "취소",
  confirmLabel,
  description,
  destructive = false,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      if (busy) return;
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextButton = event.shiftKey
      ? buttons[currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1]
      : buttons[currentIndex < 0 || currentIndex === buttons.length - 1 ? 0 : currentIndex + 1];
    event.preventDefault();
    nextButton?.focus();
  }

  return (
    <div className="civic-confirm-dialog-layer" data-confirm-dialog="true">
      <div aria-hidden="true" className="civic-confirm-dialog-scrim" />
      <section
        aria-busy={busy || undefined}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="civic-confirm-dialog"
        onKeyDown={handleKeyDown}
        role="alertdialog"
      >
        <header>
          <h2 id={titleId}>{title}</h2>
        </header>
        <div className="civic-confirm-dialog-description" id={descriptionId}>
          {description}
        </div>
        <div className="civic-confirm-dialog-actions">
          <button
            className="civic-secondary-action"
            disabled={busy}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={destructive ? "civic-danger-action" : "civic-primary-action"}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
