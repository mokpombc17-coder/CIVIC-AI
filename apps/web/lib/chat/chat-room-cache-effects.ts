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

export async function refreshPublicRoomListQueries(queryClient: QueryClient): Promise<void> {
  await markPublicRoomListsStale(queryClient);
}

// 공개방 목록은 페이지가 쌓인 채로 다시 받으면 받아 둔 페이지 수만큼 요청이 나가므로, 여기서는 다시 받아야 한다는 표시만 남김
// 실제로 다시 받는 시점과 범위는 목록 화면이 스크롤 위치를 보고 정함
function markPublicRoomListsStale(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: chatRoomQueryKeys.publicLists(),
    refetchType: "none",
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
    markPublicRoomListsStale(queryClient),
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

  await markPublicRoomListsStale(queryClient);
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
    markPublicRoomListsStale(queryClient),
    queryClient.invalidateQueries({
      queryKey: chatRoomQueryKeys.myLists(),
    }),
    resetRoomInboxQueries(queryClient),
  ]);
}
