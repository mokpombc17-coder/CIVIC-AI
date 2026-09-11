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
  const descriptionId = useId();
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
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className={styles.dialog}
      onCancel={handleCancel}
      ref={dialogRef}
    >
      <header className={styles.header}>
        <h2 id={titleId}>홈 화면에 CIVIC.AI 추가</h2>
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

      <p className={styles.description} id={descriptionId}>
        iPhone 또는 iPad의 Safari에서 아래 순서대로 진행해 주세요.
      </p>

      <ol className={styles.steps}>
        <li>
          <span className={styles.stepNumber}>1</span>
          <p>
            Safari에서 CIVIC.AI를 열고 하단의
            <span className={styles.shareLabel}>
              <ShareIcon /> 공유
            </span>
            버튼을 누르세요.
          </p>
        </li>
        <li>
          <span className={styles.stepNumber}>2</span>
          <p>
            메뉴를 아래로 내려 <strong>홈 화면에 추가</strong>를 선택하세요.
          </p>
        </li>
        <li>
          <span className={styles.stepNumber}>3</span>
          <p>
            <strong>웹 앱으로 열기</strong>를 켜고 <strong>추가</strong>를 누르세요.
          </p>
        </li>
      </ol>

      <button className={styles.doneButton} onClick={onClose} type="button">
        확인했어요
      </button>
    </dialog>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18">
      <path
        d="M9 11.5V2.75m0 0L6.25 5.5M9 2.75l2.75 2.75M5.25 7.5H4.5A1.5 1.5 0 0 0 3 9v4.5A1.5 1.5 0 0 0 4.5 15h9a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5h-.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}
