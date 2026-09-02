"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  loadKakaoPostcode,
  normalizeKakaoResidence,
  resetKakaoPostcodeLoader,
  type SurveyResidence,
} from "./kakao-postcode";
import styles from "./survey.module.css";

export function KakaoPostcodeDialog({
  onClose,
  onSelect,
  onUseManualInput,
  portalTarget,
}: {
  onClose: () => void;
  onSelect: (residence: SurveyResidence) => void;
  onUseManualInput: () => void;
  portalTarget: HTMLElement;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const postcodeContainerRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const surface = portalTarget.querySelector<HTMLElement>("[data-platform-shell-surface=true]");
    const previousAriaHidden = surface?.getAttribute("aria-hidden") ?? null;
    const previousInert = surface?.inert ?? false;
    if (surface) {
      surface.inert = true;
      surface.setAttribute("aria-hidden", "true");
    }
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (surface) {
        surface.inert = previousInert;
        if (previousAriaHidden === null) surface.removeAttribute("aria-hidden");
        else surface.setAttribute("aria-hidden", previousAriaHidden);
      }
      previousFocus?.focus();
    };
  }, [onClose, portalTarget]);

  useEffect(() => {
    let active = true;
    const container = postcodeContainerRef.current;
    if (!container) return;

    void loadKakaoPostcode()
      .then((Postcode) => {
        if (!active) return;
        container.replaceChildren();
        const postcode = new Postcode({
          height: "100%",
          onclose: onClose,
          oncomplete: (data) => {
            const residence = normalizeKakaoResidence(data);
            if (!residence) {
              setStatus("failed");
              return;
            }
            onSelect(residence);
          },
          shorthand: false,
          width: "100%",
        });
        postcode.embed(container, { autoClose: false });
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("failed");
      });

    return () => {
      active = false;
      container.replaceChildren();
    };
  }, [attempt, onClose, onSelect]);

  const retry = () => {
    resetKakaoPostcodeLoader();
    setStatus("loading");
    setAttempt((value) => value + 1);
  };

  return createPortal(
    <div
      aria-labelledby="survey-postcode-dialog-title"
      aria-modal="true"
      className={styles.postcodeBackdrop}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <div className={styles.postcodeDialog}>
        <div className={styles.postcodeDialogHeader}>
          <h2 id="survey-postcode-dialog-title">주소 검색</h2>
          <button
            aria-label="주소 검색 닫기"
            className={styles.postcodeCloseButton}
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className={styles.postcodeDialogBody}>
          <div
            className={styles.postcodeEmbed}
            data-visible={status === "ready" ? "true" : undefined}
            ref={postcodeContainerRef}
          />
          {status === "loading" ? (
            <div aria-live="polite" className={styles.postcodeStatus}>
              <span aria-hidden="true" className={styles.postcodeSpinner} />
              <p>주소 검색을 불러오는 중입니다.</p>
            </div>
          ) : null}
          {status === "failed" ? (
            <div className={styles.postcodeStatus} role="alert">
              <p className={styles.postcodeErrorTitle}>주소 검색을 불러오지 못했습니다.</p>
              <p className={styles.postcodeErrorDetail}>
                네트워크 연결을 확인하고 다시 시도하거나 주소를 직접 입력해 주세요.
              </p>
              <div className={styles.postcodeErrorActions}>
                <button className={styles.postcodeRetryButton} onClick={retry} type="button">
                  다시 시도
                </button>
                <button
                  className={styles.postcodeManualButton}
                  onClick={onUseManualInput}
                  type="button"
                >
                  직접 입력하기
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {status === "ready" ? (
          <div className={styles.postcodeDialogFooter}>
            <span>주소 검색을 사용할 수 없나요?</span>
            <button onClick={onUseManualInput} type="button">
              직접 입력하기
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    portalTarget,
  );
}
