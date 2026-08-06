import type { QueryClient } from "@tanstack/react-query";
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
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.detail(roomId),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.myMembership(roomId),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.membershipLists(roomId),
    }),
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
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.membershipLists(roomId),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.publicLists(),
    }),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.myLists(),
    }),
    resetRoomInboxQueries(queryClient),
  ]);
}
