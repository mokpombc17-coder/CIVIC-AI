"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isChatMessageMutationPending,
  type ChatMessageMutationStartResult,
} from "@/components/chat/chat-message-mutation-state";
import { copyChatMessageContent } from "@/components/chat/chat-message-copy";
import type { ChatMessageItemViewModel } from "@/components/chat/chat-room-view-model";

const COPY_FEEDBACK_DURATION_MS = 2_000;

export type ChatMessageActionsMode = "menu" | "edit" | "delete";

export type ChatMessageActionsBottomSheetViewModel = Readonly<{
  canMutate: boolean;
  content: string;
  copyStatus: "idle" | "copying" | "copied";
  draft: string;
  error: string | null;
  isPending: boolean;
  isRetryWaiting: boolean;
  mode: ChatMessageActionsMode;
  onBackdropClick: () => void;
  onClose: () => void;
  onConfirmDelete: () => void;
  onCopy: () => void;
  onDraftChange: (draft: string) => void;
  onEditSubmit: () => void;
  onModeChange: (mode: ChatMessageActionsMode) => void;
}>;

type MessageActionsTarget = Readonly<{
  messageId: string;
  viewportKey: string;
}>;

type UseChatMessageActionsBottomSheetOptions = Readonly<{
  items: readonly ChatMessageItemViewModel[];
  onDeleteMessage: (messageId: string) => ChatMessageMutationStartResult;
  onEditMessage: (messageId: string, content: string) => ChatMessageMutationStartResult;
  viewportKey: string;
}>;

export function useChatMessageActionsBottomSheet({
  items,
  onDeleteMessage,
  onEditMessage,
  viewportKey,
}: UseChatMessageActionsBottomSheetOptions) {
  const [target, setTarget] = useState<MessageActionsTarget | null>(null);
  const [mode, setMode] = useState<ChatMessageActionsMode>("menu");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied">("idle");
  const [activeMutationId, setActiveMutationId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selectedItem = useMemo(
    () =>
      target?.viewportKey === viewportKey
        ? (items.find((item) => item.messageId === target.messageId) ?? null)
        : null,
    [items, target, viewportKey],
  );
  const mutation = selectedItem?.mutation ?? null;
  const activeMutation = mutation?.clientMutationId === activeMutationId ? mutation : null;
  const completed = activeMutation?.status === "completed";
  const isPending = isChatMessageMutationPending(mutation);
  const mutationError =
    activeMutation?.status === "failed" || activeMutation?.status === "cancelled"
      ? activeMutation.error
      : null;

  const restoreFocus = useCallback(() => {
    const trigger = triggerRef.current;
    triggerRef.current = null;

    requestAnimationFrame(() => {
      const fallback = document.querySelector<HTMLElement>('[role="log"][data-viewport-key]');
      (trigger?.isConnected ? trigger : fallback)?.focus();
    });
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setMode("menu");
    setDraft("");
    setError(null);
    setCopyStatus("idle");
    setActiveMutationId(null);
    restoreFocus();
  }, [restoreFocus]);

  useEffect(() => {
    if (!target || (!completed && selectedItem?.canOpenActions && selectedItem.messageId)) {
      return;
    }

    restoreFocus();
  }, [completed, restoreFocus, selectedItem, target]);

  useEffect(() => {
    if (copyStatus !== "copied") {
      return;
    }

    const resetTimer = window.setTimeout(() => setCopyStatus("idle"), COPY_FEEDBACK_DURATION_MS);
    return () => window.clearTimeout(resetTimer);
  }, [copyStatus]);

  const openMessageActions = useCallback(
    (item: ChatMessageItemViewModel, trigger: HTMLButtonElement) => {
      if (!item.canOpenActions || !item.messageId) {
        return;
      }

      triggerRef.current = trigger;
      setTarget({
        messageId: item.messageId,
        viewportKey,
      });
      setMode("menu");
      setDraft(item.content);
      setError(null);
      setCopyStatus("idle");
      setActiveMutationId(null);
    },
    [viewportKey],
  );

  function start(result: ChatMessageMutationStartResult) {
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setActiveMutationId(result.clientMutationId);
    setError(null);
  }

  const selectedMessageId = selectedItem?.messageId ?? null;
  const sheet: ChatMessageActionsBottomSheetViewModel | null =
    target && selectedItem?.canOpenActions && selectedMessageId && !completed
      ? {
          canMutate: selectedItem.canMutate,
          content: selectedItem.content,
          copyStatus,
          draft,
          error: error ?? mutationError,
          isPending,
          isRetryWaiting: mutation?.status === "retry-waiting",
          mode,
          onBackdropClick: () => {
            if (mode === "menu") {
              close();
            }
          },
          onClose: close,
          onConfirmDelete: () => start(onDeleteMessage(selectedMessageId)),
          onCopy: () => {
            setCopyStatus("copying");
            setError(null);

            void copyChatMessageContent(selectedItem.content).then(
              () => setCopyStatus("copied"),
              () => {
                setCopyStatus("idle");
                setError("메시지를 복사하지 못했습니다. 다시 시도해 주세요.");
              },
            );
          },
          onDraftChange: (nextDraft) => {
            setDraft(nextDraft);
            setError(null);
          },
          onEditSubmit: () => start(onEditMessage(selectedMessageId, draft)),
          onModeChange: (nextMode) => {
            setMode(nextMode);
            setError(null);
            setCopyStatus("idle");

            if (nextMode === "edit") {
              setDraft(selectedItem.content);
            }
          },
        }
      : null;

  return { openMessageActions, sheet };
}
