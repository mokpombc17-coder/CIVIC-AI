"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChatRealtimeTransport } from "@/components/chat-realtime-provider";
import {
  createFailedChatMessageMutationState,
  createLocalChatMessageMutationState,
  reduceChatMessageMutationLifecycle,
  type ChatMessageMutationStartResult,
  type ChatMessageMutationStates,
} from "@/components/chat-message-mutation-state";
import {
  chatMessageDeleteRequestSchema,
  type ChatMessageMutationCommandType,
} from "@/lib/chat/realtime/chat-stomp-contracts";
import { chatMessageSendContentSchema } from "@/lib/chat/chat-room-contracts";

const createClientMutationId = () => crypto.randomUUID();
const EMPTY_MUTATION_STATES: ChatMessageMutationStates = new Map();

type UseChatMessageMutationsOptions = Readonly<{
  enabled: boolean;
  generation: number;
  roomId: string;
}>;

export type ChatMessageMutationsState = Readonly<{
  deleteMessage: (messageId: string) => ChatMessageMutationStartResult;
  editMessage: (messageId: string, content: string) => ChatMessageMutationStartResult;
  states: ChatMessageMutationStates;
}>;

export function useChatMessageMutations({
  enabled,
  generation,
  roomId,
}: UseChatMessageMutationsOptions): ChatMessageMutationsState {
  const transport = useChatRealtimeTransport();
  const [mutationStore, setMutationStore] = useState<{
    generation: number;
    roomId: string;
    states: ChatMessageMutationStates;
  }>({
    generation,
    roomId,
    states: EMPTY_MUTATION_STATES,
  });
  const states =
    mutationStore.roomId === roomId && mutationStore.generation === generation
      ? mutationStore.states
      : EMPTY_MUTATION_STATES;

  useEffect(
    () =>
      transport.observeMessageMutationLifecycle((event) => {
        setMutationStore((current) => {
          const currentStates =
            current.roomId === roomId && current.generation === generation
              ? current.states
              : EMPTY_MUTATION_STATES;
          const nextStates = reduceChatMessageMutationLifecycle(currentStates, event, {
            generation,
            roomId,
          });

          if (nextStates === currentStates && current.states === currentStates) {
            return current;
          }

          return {
            generation,
            roomId,
            states: nextStates,
          };
        });
      }),
    [generation, roomId, transport],
  );

  const startMutation = useCallback(
    (
      commandType: ChatMessageMutationCommandType,
      messageId: string,
      publish: (clientMutationId: string) => void,
    ): ChatMessageMutationStartResult => {
      if (!enabled) {
        return {
          error: "실시간 채팅 연결이 준비된 뒤 메시지를 변경할 수 있습니다.",
          ok: false,
        };
      }

      const clientMutationId = createClientMutationId();
      setMutationStore((current) => {
        const currentStates =
          current.roomId === roomId && current.generation === generation
            ? current.states
            : EMPTY_MUTATION_STATES;
        const nextStates = new Map(currentStates);
        nextStates.set(
          messageId,
          createLocalChatMessageMutationState({
            clientMutationId,
            commandType,
          }),
        );
        return {
          generation,
          roomId,
          states: nextStates,
        };
      });

      try {
        publish(clientMutationId);
        return {
          clientMutationId,
          ok: true,
        };
      } catch (cause) {
        const error =
          cause instanceof Error ? cause.message : "메시지 변경 명령을 시작하지 못했습니다.";
        setMutationStore((current) => {
          const currentStates =
            current.roomId === roomId && current.generation === generation
              ? current.states
              : EMPTY_MUTATION_STATES;
          const nextStates = new Map(currentStates);
          nextStates.set(
            messageId,
            createFailedChatMessageMutationState({
              clientMutationId,
              commandType,
              error,
            }),
          );
          return {
            generation,
            roomId,
            states: nextStates,
          };
        });
        return {
          error,
          ok: false,
        };
      }
    },
    [enabled, generation, roomId],
  );

  const editMessage = useCallback(
    (messageId: string, content: string): ChatMessageMutationStartResult => {
      const normalizedContent = chatMessageSendContentSchema.safeParse(content);

      if (!normalizedContent.success) {
        return {
          error:
            normalizedContent.error.issues[0]?.message ?? "수정할 메시지 내용을 확인해 주세요.",
          ok: false,
        };
      }

      return startMutation("EDIT_MESSAGE", messageId, (clientMutationId) => {
        transport.editRoomMessage({
          request: {
            clientMutationId,
            content: normalizedContent.data,
            messageId,
          },
          roomId,
        });
      });
    },
    [roomId, startMutation, transport],
  );

  const deleteMessage = useCallback(
    (messageId: string): ChatMessageMutationStartResult => {
      const messageIdResult = chatMessageDeleteRequestSchema.shape.messageId.safeParse(messageId);

      if (!messageIdResult.success) {
        return {
          error: "삭제할 메시지 식별자를 확인해 주세요.",
          ok: false,
        };
      }

      return startMutation("DELETE_MESSAGE", messageIdResult.data, (clientMutationId) => {
        transport.deleteRoomMessage({
          request: {
            clientMutationId,
            messageId: messageIdResult.data,
          },
          roomId,
        });
      });
    },
    [roomId, startMutation, transport],
  );

  return useMemo(
    () => ({
      deleteMessage,
      editMessage,
      states,
    }),
    [deleteMessage, editMessage, states],
  );
}
