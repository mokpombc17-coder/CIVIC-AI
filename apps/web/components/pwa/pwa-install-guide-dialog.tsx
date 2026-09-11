"use client";

import { useEffect, useId, useRef, type RefObject, type SyntheticEvent } from "react";
import styles from "./pwa-install-guide-dialog.module.css";

type PwaInstallGuideDialogProps = Readonly<{
  onClose: () => void;
  open: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}>;

export function PwaInstallGuideDialog(props: PwaInstallGuideDialogProps) {
  if (!props.open) return null;
  return <OpenPwaInstallGuideDialog {...props} />;
}

function OpenPwaInstallGuideDialog({
  onClose,
  returnFocusRef,
}: Omit<PwaInstallGuideDialogProps, "open">) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const returnFocusTarget = returnFocusRef?.current ?? null;

    dialog.showModal();
    closeButtonRef.current?.focus();

    return () => {
      if (dialog.open) dialog.close();
      const focusTarget = returnFocusTarget ?? previouslyFocused;
      if (focusTarget?.isConnected) focusTarget.focus();
    };
  }, [returnFocusRef]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <dialog
      aria-labelledby={titleId}
      aria-modal="true"
      className={styles.dialog}
      onCancel={handleCancel}
      ref={dialogRef}
    >
      <header className={styles.header}>
        <h2 id={titleId}>iOS 앱 설치 방법</h2>
        <button
          aria-label="설치 안내 닫기"
          className={styles.closeButton}
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20">
            <path
              d="m5 5 10 10M15 5 5 15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.75"
            />
          </svg>
        </button>
      </header>

      <ol className={styles.steps}>
        <li>
          <span className={styles.stepNumber}>1</span>
          <p>
            화면의 <strong>공유</strong> 메뉴를 열어주세요.
          </p>
        </li>
        <li>
          <span className={styles.stepNumber}>2</span>
          <p>
            메뉴에서 <strong>홈 화면에 추가</strong>를 선택해주세요.
          </p>
        </li>
        <li>
          <span className={styles.stepNumber}>3</span>
          <p>
            오른쪽 위의 <strong>추가</strong>를 눌러주세요.
          </p>
        </li>
      </ol>

      <p className={styles.tip}>‘웹 앱으로 열기’가 보이면 켜주세요.</p>

      <button className={styles.doneButton} onClick={onClose} type="button">
        닫기
      </button>
    </dialog>
  );
}
