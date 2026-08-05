"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isChatMessageMutationPending,
  type ChatMessageMutationStartResult,
} from "@/components/chat-message-mutation-state";
import type { ChatMessageItemViewModel } from "@/components/chat-room-view-model";

export type ChatMessageActionsMode = "menu" | "edit" | "delete";

export type ChatMessageActionsBottomSheetViewModel = Readonly<{
  content: string;
  draft: string;
  error: string | null;
  isPending: boolean;
  isRetryWaiting: boolean;
  mode: ChatMessageActionsMode;
  onBackdropClick: () => void;
  onClose: () => void;
  onConfirmDelete: () => void;
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
    setActiveMutationId(null);
    restoreFocus();
  }, [restoreFocus]);

  useEffect(() => {
    if (!target || (!completed && selectedItem?.canMutate && selectedItem.messageId)) {
      return;
    }

    restoreFocus();
  }, [completed, restoreFocus, selectedItem, target]);

  const openMessageActions = useCallback(
    (item: ChatMessageItemViewModel, trigger: HTMLButtonElement) => {
      if (!item.canMutate || !item.messageId) {
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
    target && selectedItem?.canMutate && selectedMessageId && !completed
      ? {
          content: selectedItem.content,
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
          onDraftChange: (nextDraft) => {
            setDraft(nextDraft);
            setError(null);
          },
          onEditSubmit: () => start(onEditMessage(selectedMessageId, draft)),
          onModeChange: (nextMode) => {
            setMode(nextMode);
            setError(null);

            if (nextMode === "edit") {
              setDraft(selectedItem.content);
            }
          },
        }
      : null;

  return { openMessageActions, sheet };
}
