"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SurveySection } from "@/lib/survey/survey-contracts";
import type { SurveyAnswerState } from "@/lib/survey/survey-answer-state";
import {
  loadSurveyDraft,
  removeSurveyDraft,
  resolveSurveyDraftOwnerKey,
  saveSurveyDraft,
  type SurveyDraftScope,
} from "@/lib/survey/survey-draft-storage";
import type { SurveyEntryType } from "@/lib/survey/survey-participation-analytics";

const DRAFT_SAVE_DELAY_MS = 200;

export function useSurveyDraftSession({
  answers,
  contentVersionId,
  currentStep,
  onDraftRestored,
  roundId,
  sections,
}: {
  answers: SurveyAnswerState;
  contentVersionId: string;
  currentStep: number;
  onDraftRestored: (draft: Readonly<{ answers: SurveyAnswerState; currentStep: number }>) => void;
  roundId: string;
  sections: readonly SurveySection[];
}) {
  const [draftReady, setDraftReady] = useState(false);
  const [draftScope, setDraftScope] = useState<SurveyDraftScope | null>(null);
  const [entryType, setEntryType] = useState<SurveyEntryType | null>(null);
  const draftSaveTimeoutRef = useRef<number | null>(null);
  const initialSections = useRef(sections);

  useEffect(() => {
    let active = true;
    void resolveSurveyDraftOwnerKey().then((ownerKey) => {
      if (!active) return;
      if (ownerKey) {
        const scope = { contentVersionId, ownerKey, roundId };
        const draft = loadSurveyDraft(sessionStorage, scope, initialSections.current);
        if (draft) {
          onDraftRestored({ answers: draft.answers, currentStep: draft.currentStep });
          setEntryType("resumed");
        } else {
          setEntryType("new");
        }
        setDraftScope(scope);
      } else {
        setEntryType("new");
      }
      setDraftReady(true);
    });

    return () => {
      active = false;
    };
  }, [contentVersionId, onDraftRestored, roundId]);

  useEffect(() => {
    if (!draftReady || !draftScope) return;
    const timeout = window.setTimeout(() => {
      draftSaveTimeoutRef.current = null;
      saveSurveyDraft(sessionStorage, draftScope, { answers, currentStep });
    }, DRAFT_SAVE_DELAY_MS);
    draftSaveTimeoutRef.current = timeout;
    return () => {
      window.clearTimeout(timeout);
      if (draftSaveTimeoutRef.current === timeout) draftSaveTimeoutRef.current = null;
    };
  }, [answers, currentStep, draftReady, draftScope]);

  const clearDraft = useCallback(() => {
    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }
    if (draftScope) removeSurveyDraft(sessionStorage, draftScope);
  }, [draftScope]);

  return { clearDraft, draftReady, entryType };
}
