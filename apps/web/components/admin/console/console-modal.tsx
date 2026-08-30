"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react";

// ConfirmDialog와 동일한 native <dialog> 패턴(포커스 트랩·복원·ESC)을
// 일반 모달·드로어로 확장한 공용 표면. /admin의 모든 오버레이는 이걸 사용한다.

type ConsoleSurfaceProps = Readonly<{
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onClose: () => void;
  open: boolean;
}>;

export function ConsoleModal(props: ConsoleSurfaceProps) {
  if (!props.open) return null;
  return <OpenConsoleSurface {...props} variant="modal" />;
}

export function ConsoleDrawer(props: ConsoleSurfaceProps) {
  if (!props.open) return null;
  return <OpenConsoleSurface {...props} variant="drawer" />;
}

function OpenConsoleSurface({
  ariaLabel,
  children,
  className,
  onClose,
  variant,
}: Omit<ConsoleSurfaceProps, "open"> & { variant: "modal" | "drawer" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const firstControl = dialog.querySelector<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    (firstControl ?? dialog).focus();

    return () => {
      if (dialog.open) dialog.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
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
    onClose();
  }

  function handleBackdropClick(event: SyntheticEvent<HTMLDialogElement, MouseEvent>) {
    if (event.target === dialogRef.current) onClose();
  }

  return (
    <dialog
      aria-label={ariaLabel}
      aria-modal="true"
      className={`console-dialog${variant === "drawer" ? " is-drawer" : ""}${className ? ` ${className}` : ""}`}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
    >
      {children}
    </dialog>
  );
}
