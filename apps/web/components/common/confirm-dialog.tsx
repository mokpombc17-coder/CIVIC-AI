"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";

export type ConfirmDialogProps = Readonly<{
  busy?: boolean;
  busyLabel?: string;
  cancelLabel?: string;
  confirmLabel: string;
  confirmationInputLabel?: string;
  confirmationPhrase?: string;
  description: ReactNode;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}>;

export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <OpenConfirmDialog {...props} />;
}

function OpenConfirmDialog({
  busy = false,
  busyLabel = "처리 중…",
  cancelLabel = "취소",
  confirmLabel,
  confirmationInputLabel = "확인 문구",
  confirmationPhrase,
  description,
  destructive = false,
  onCancel,
  onConfirm,
  title,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationInputRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const confirmationMatches =
    confirmationPhrase === undefined || confirmation === confirmationPhrase;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    if (confirmationPhrase) {
      confirmationInputRef.current?.focus();
    } else {
      cancelButtonRef.current?.focus();
    }

    return () => {
      if (dialog.open) dialog.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [confirmationPhrase]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;

    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "input:not(:disabled), button:not(:disabled)",
      ),
    );
    if (controls.length === 0) return;
    const currentIndex = controls.indexOf(document.activeElement as HTMLElement);
    const nextControl = event.shiftKey
      ? controls[currentIndex <= 0 ? controls.length - 1 : currentIndex - 1]
      : controls[currentIndex < 0 || currentIndex === controls.length - 1 ? 0 : currentIndex + 1];
    event.preventDefault();
    nextControl?.focus();
  }

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!busy) onCancel();
  }

  return (
    <dialog
      aria-busy={busy || undefined}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="civic-confirm-dialog"
      data-confirm-dialog="true"
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
      role="alertdialog"
    >
      <header>
        <h2 id={titleId}>{title}</h2>
      </header>
      <div className="civic-confirm-dialog-description" id={descriptionId}>
        {description}
      </div>
      {confirmationPhrase ? (
        <label className="civic-confirm-dialog-confirmation">
          <span>
            계속하려면 <strong>{confirmationPhrase}</strong>를 정확히 입력하세요.
          </span>
          <input
            aria-label={confirmationInputLabel}
            autoComplete="off"
            disabled={busy}
            onChange={(event) => setConfirmation(event.currentTarget.value)}
            ref={confirmationInputRef}
            spellCheck={false}
            type="text"
            value={confirmation}
          />
        </label>
      ) : null}
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
          disabled={busy || !confirmationMatches}
          onClick={onConfirm}
          type="button"
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
