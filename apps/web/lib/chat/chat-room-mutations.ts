"use client";

import {
  mutationOptions,
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { chatRoomApi, type ChatRoomApi } from "./chat-room-api";
import type {
  CreateRoomRequest,
  TargetMembershipRequest,
  UpdateRoomReadStateRequest,
  UpdateRoomSettingsRequest,
} from "./chat-room-contracts";
import {
  invalidateRoomLists,
  invalidateRoomSettingsState,
  invalidateRoomState,
} from "./chat-room-cache-effects";
import {
  chatRoomQueryKeys,
  getRoomInboxRetryDelay,
  shouldRetryRoomInboxRequest,
} from "./chat-room-queries";
import type { IdempotentCommand } from "./idempotent-command";

type RoomCommandVariables<TBody> = Readonly<{
  roomId: string;
  command: IdempotentCommand<TBody>;
}>;

export type UpdateRoomReadStateVariables = Readonly<{
  request: UpdateRoomReadStateRequest;
  roomId: string;
}>;

export function createRoomMutationOptions(
  queryClient: QueryClient,
  api: Pick<ChatRoomApi, "createRoom"> = chatRoomApi,
) {
  return mutationOptions({
    mutationKey: [...chatRoomQueryKeys.all, "command", "create"] as const,
    mutationFn: (command: IdempotentCommand<CreateRoomRequest>) => api.createRoom(command),
    retry: false,
    onSuccess: async (response) => {
      queryClient.setQueryData(
        chatRoomQueryKeys.creationRequestDetail(response.creationRequestId),
        response,
      );

      const requestListInvalidation = queryClient.invalidateQueries({
        queryKey: chatRoomQueryKeys.creationRequestLists(),
      });

      if (response.status !== "APPROVED") {
        await requestListInvalidation;
        return;
      }

      await Promise.all([requestListInvalidation, invalidateRoomLists(queryClient)]);
    },
  });
}

export function cancelRoomCreationRequestMutationOptions(
  queryClient: QueryClient,
  api: Pick<ChatRoomApi, "cancelMyRoomCreationRequest"> = chatRoomApi,
) {
  return mutationOptions({
    mutationKey: [...chatRoomQueryKeys.creationRequests(), "command", "cancel"] as const,
    mutationFn: (creationRequestId: string) => api.cancelMyRoomCreationRequest(creationRequestId),
    retry: false,
    onSuccess: async (response) => {
      queryClient.setQueryData(
        chatRoomQueryKeys.creationRequestDetail(response.creationRequestId),
        response,
      );
      await queryClient.invalidateQueries({
        queryKey: chatRoomQueryKeys.creationRequestLists(),
      });
    },
  });
}

export function updateRoomSettingsMutationOptions(
  queryClient: QueryClient,
  api: Pick<ChatRoomApi, "updateRoomSettings"> = chatRoomApi,
) {
  return mutationOptions({
    mutationKey: [...chatRoomQueryKeys.all, "command", "update-settings"] as const,
    mutationFn: ({ roomId, command }: RoomCommandVariables<UpdateRoomSettingsRequest>) =>
      api.updateRoomSettings(roomId, command),
    retry: false,
    onSuccess: (_response, { roomId }) => invalidateRoomSettingsState(queryClient, roomId),
  });
}

export function joinRoomMutationOptions(
  queryClient: QueryClient,
  api: Pick<ChatRoomApi, "joinRoom"> = chatRoomApi,
) {
  return mutationOptions({
    mutationKey: [...chatRoomQueryKeys.all, "command", "join"] as const,
    mutationFn: ({ roomId, command }: RoomCommandVariables<undefined>) =>
      api.joinRoom(roomId, command),
    retry: false,
    onSuccess: (response, { roomId }) => {
      if (response.code === "REJOINED") {
        queryClient.removeQueries({
          queryKey: chatRoomQueryKeys.messageHistoriesForRoom(roomId),
        });
      }

      return invalidateRoomState(queryClient, roomId);
    },
  });
}

export function leaveRoomMutationOptions(
  queryClient: QueryClient,
  api: Pick<ChatRoomApi, "leaveRoom"> = chatRoomApi,
) {
  return mutationOptions({
    mutationKey: [...chatRoomQueryKeys.all, "command", "leave"] as const,
    mutationFn: ({ roomId, command }: RoomCommandVariables<undefined>) =>
      api.leaveRoom(roomId, command),
    retry: false,
    onSuccess: (_response, { roomId }) => invalidateRoomState(queryClient, roomId),
  });
}

export function transferRoomOwnershipMutationOptions(
  queryClient: QueryClient,
  api: Pick<ChatRoomApi, "transferRoomOwnership"> = chatRoomApi,
) {
  return mutationOptions({
    mutationKey: [...chatRoomQueryKeys.all, "command", "transfer-ownership"] as const,
    mutationFn: ({ roomId, command }: RoomCommandVariables<TargetMembershipRequest>) =>
      api.transferRoomOwnership(roomId, command),
    retry: false,
    onSuccess: (_response, { roomId }) => invalidateRoomState(queryClient, roomId),
  });
}

export function banRoomMemberMutationOptions(
  queryClient: QueryClient,
  api: Pick<ChatRoomApi, "banRoomMember"> = chatRoomApi,
) {
  return mutationOptions({
    mutationKey: [...chatRoomQueryKeys.all, "command", "ban-member"] as const,
    mutationFn: ({ roomId, command }: RoomCommandVariables<TargetMembershipRequest>) =>
      api.banRoomMember(roomId, command),
    retry: false,
    onSuccess: (_response, { roomId }) => invalidateRoomState(queryClient, roomId),
  });
}

export function unbanRoomMemberMutationOptions(
  queryClient: QueryClient,
  api: Pick<ChatRoomApi, "unbanRoomMember"> = chatRoomApi,
) {
  return mutationOptions({
    mutationKey: [...chatRoomQueryKeys.all, "command", "unban-member"] as const,
    mutationFn: ({ roomId, command }: RoomCommandVariables<TargetMembershipRequest>) =>
      api.unbanRoomMember(roomId, command),
    retry: false,
    onSuccess: (_response, { roomId }) => invalidateRoomState(queryClient, roomId),
  });
}

export function closeRoomMutationOptions(
  queryClient: QueryClient,
  api: Pick<ChatRoomApi, "closeRoom"> = chatRoomApi,
) {
  return mutationOptions({
    mutationKey: [...chatRoomQueryKeys.all, "command", "close"] as const,
    mutationFn: ({ roomId, command }: RoomCommandVariables<undefined>) =>
      api.closeRoom(roomId, command),
    retry: false,
    onSuccess: (_response, { roomId }) => invalidateRoomState(queryClient, roomId),
  });
}

export function updateRoomReadStateMutationOptions(
  api: Pick<ChatRoomApi, "updateRoomReadState"> = chatRoomApi,
) {
  return mutationOptions({
    mutationKey: [...chatRoomQueryKeys.all, "read-state"] as const,
    mutationFn: ({ request, roomId }: UpdateRoomReadStateVariables) =>
      api.updateRoomReadState(roomId, request),
    retry: shouldRetryRoomInboxRequest,
    retryDelay: (attemptIndex) => getRoomInboxRetryDelay(attemptIndex),
  });
}

export function useCreateRoomMutation() {
  const queryClient = useQueryClient();
  return useMutation(createRoomMutationOptions(queryClient));
}

export function useCancelRoomCreationRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation(cancelRoomCreationRequestMutationOptions(queryClient));
}

export function useUpdateRoomSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation(updateRoomSettingsMutationOptions(queryClient));
}

export function useJoinRoomMutation() {
  const queryClient = useQueryClient();
  return useMutation(joinRoomMutationOptions(queryClient));
}

export function useLeaveRoomMutation() {
  const queryClient = useQueryClient();
  return useMutation(leaveRoomMutationOptions(queryClient));
}

export function useTransferRoomOwnershipMutation() {
  const queryClient = useQueryClient();
  return useMutation(transferRoomOwnershipMutationOptions(queryClient));
}

export function useBanRoomMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation(banRoomMemberMutationOptions(queryClient));
}

export function useUnbanRoomMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation(unbanRoomMemberMutationOptions(queryClient));
}

export function useCloseRoomMutation() {
  const queryClient = useQueryClient();
  return useMutation(closeRoomMutationOptions(queryClient));
}

export function useUpdateRoomReadStateMutation() {
  return useMutation(updateRoomReadStateMutationOptions());
}
