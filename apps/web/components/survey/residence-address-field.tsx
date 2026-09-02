"use client";

import { useRef, useState } from "react";
import type { SurveyAnswerDraft } from "@/lib/survey/survey-answer-state";
import { KakaoPostcodeDialog } from "./kakao-postcode-dialog";
import type { SurveyResidence } from "./kakao-postcode";
import styles from "./survey.module.css";

const RESIDENCE_SEGMENTS = ["시/도", "시/군/구", "읍/면/동"] as const;

export function ResidenceAddressField({
  answer,
  controlId,
  describedBy,
  maxLength,
  onChange,
}: {
  answer: SurveyAnswerDraft | undefined;
  controlId: string;
  describedBy: string | undefined;
  maxLength: number | null;
  onChange: (answer: SurveyAnswerDraft) => void;
}) {
  const textAnswer = answer?.type === "SHORT_TEXT" ? answer : undefined;
  const values = RESIDENCE_SEGMENTS.map((_, index) => textAnswer?.inputSegments?.[index] ?? "");
  const fieldsRef = useRef<HTMLDivElement>(null);
  const [manualMode, setManualMode] = useState(textAnswer?.inputMethod === "MANUAL");
  const [postcodeOpen, setPostcodeOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const openPostcode = () => {
    const shell = fieldsRef.current?.closest<HTMLElement>("[data-platform-shell=true]") ?? null;
    if (!shell) return;
    setPortalTarget(shell);
    setPostcodeOpen(true);
  };

  const selectResidence = (residence: SurveyResidence) => {
    const next = [residence.sido, residence.sigungu, residence.eupMyeonDong];
    onChange({
      type: "SHORT_TEXT",
      inputMethod: "POSTCODE",
      inputSegments: next,
      text: next
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" "),
    });
    setManualMode(false);
    setPostcodeOpen(false);
  };

  const useManualInput = () => {
    const trimmed = values.map((value) => value.trim());
    onChange({
      type: "SHORT_TEXT",
      inputMethod: "MANUAL",
      inputSegments: values,
      text: trimmed.every(Boolean) ? trimmed.join(" ") : "",
    });
    setManualMode(true);
    setPostcodeOpen(false);
  };

  return (
    <>
      <div
        className={styles.residenceFields}
        data-input-mode={manualMode ? "manual" : "postcode"}
        ref={fieldsRef}
      >
        {RESIDENCE_SEGMENTS.map((placeholder, index) =>
          manualMode ? (
            <input
              aria-describedby={describedBy}
              aria-label={`주소지 ${placeholder}`}
              className={styles.textControl}
              data-residence-manual="true"
              id={index === 0 ? controlId : undefined}
              key={placeholder}
              maxLength={maxLength ?? undefined}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                const trimmed = next.map((value) => value.trim());
                onChange({
                  type: "SHORT_TEXT",
                  inputMethod: "MANUAL",
                  inputSegments: next,
                  text: trimmed.every(Boolean) ? trimmed.join(" ") : "",
                });
              }}
              placeholder={placeholder}
              type="text"
              value={values[index]}
            />
          ) : (
            <button
              aria-describedby={describedBy}
              aria-label={`주소지 ${placeholder} 검색`}
              className={`${styles.textControl} ${styles.residenceLookupControl}`}
              data-empty={values[index] ? undefined : "true"}
              id={index === 0 ? controlId : undefined}
              key={placeholder}
              onClick={openPostcode}
              type="button"
            >
              <span>{values[index] || placeholder}</span>
            </button>
          ),
        )}
      </div>

      {manualMode ? (
        <button className={styles.residencePostcodeButton} onClick={openPostcode} type="button">
          주소 검색으로 선택하기
        </button>
      ) : null}

      {postcodeOpen && portalTarget ? (
        <KakaoPostcodeDialog
          onClose={() => setPostcodeOpen(false)}
          onSelect={selectResidence}
          onUseManualInput={useManualInput}
          portalTarget={portalTarget}
        />
      ) : null}
    </>
  );
}
