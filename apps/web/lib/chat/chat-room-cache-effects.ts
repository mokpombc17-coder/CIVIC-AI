import type { QueryClient } from "@tanstack/react-query";
import { shouldRefreshPublicRoomListAfterJoinError } from "./chat-room-command-error-presentation";
import { chatRoomQueryKeys } from "./chat-room-queries";

export async function resetRoomInboxQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.resetQueries(
    {
      queryKey: chatRoomQueryKeys.roomInboxes(),
    },
    {
      cancelRefetch: true,
    },
  );
}

export async function refreshRoomInboxQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: chatRoomQueryKeys.roomInboxes(),
  });
}

export async function resetRoomMembershipQueries(
  queryClient: QueryClient,
  roomId: string,
): Promise<void> {
  await queryClient.resetQueries(
    {
      queryKey: chatRoomQueryKeys.membershipLists(roomId),
    },
    {
      cancelRefetch: true,
    },
  );
}

export async function invalidateRoomLists(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.publicLists(),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.myLists(),
    }),
    resetRoomInboxQueries(queryClient),
  ]);
}

export async function invalidatePublicRoomListsAfterJoinError(
  queryClient: QueryClient,
  error: unknown,
): Promise<boolean> {
  if (!shouldRefreshPublicRoomListAfterJoinError(error)) {
    return false;
  }

  await queryClient.invalidateQueries({
    queryKey: chatRoomQueryKeys.publicLists(),
  });
  return true;
}

export async function invalidateRoomSettingsState(
  queryClient: QueryClient,
  roomId: string,
): Promise<void> {
  await Promise.all([
    invalidateRoomLists(queryClient),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.detail(roomId),
    }),
  ]);
}

export async function invalidateRoomState(queryClient: QueryClient, roomId: string): Promise<void> {
  await Promise.all([
    invalidateRoomLists(queryClient),
    invalidateRoomScopedState(queryClient, roomId),
  ]);
}

export async function invalidateRoomScopedState(
  queryClient: QueryClient,
  roomId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.detail(roomId),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.myMembership(roomId),
    }),
    resetRoomMembershipQueries(queryClient, roomId),
  ]);
}

export async function refreshAuthoritativeRoomQueries(
  queryClient: QueryClient,
  roomId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.detail(roomId),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.myMembership(roomId),
    }),
    resetRoomMembershipQueries(queryClient, roomId),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.publicLists(),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.myLists(),
    }),
    resetRoomInboxQueries(queryClient),
  ]);
}
