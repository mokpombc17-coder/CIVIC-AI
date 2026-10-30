import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { mergePresortedChatMessages } from "./chat-message-merge";
import { ChatApiError } from "./chat-fetch";
import type {
  ChatMessage,
  MessageHistoryResponse,
  RoomInboxListResponse,
  RoomMessageSearchResponse,
} from "./chat-room-contracts";
import type {
  InvalidCursorRecoveryState,
  PublicRoomInvalidCursorRecoveryState,
} from "./chat-room-query-keys";

const ROOM_INBOX_RETRY_BASE_DELAY_MS = 500;
const ROOM_INBOX_RETRY_MAX_DELAY_MS = 2_000;
const ROOM_INBOX_MAX_RETRIES = 3;
const ROOM_READ_RECEIPT_STATE_MAX_RETRIES = 3;
const EMPTY_CHAT_MESSAGES: readonly ChatMessage[] = [];
const EMPTY_ROOM_LIST_ITEMS: readonly never[] = [];

export function flattenRoomMessageHistoryPages(
  roomId: string,
  pages: readonly MessageHistoryResponse[] | undefined,
): readonly ChatMessage[] {
  if (!pages || pages.length === 0) {
    return EMPTY_CHAT_MESSAGES;
  }

  return mergePresortedChatMessages({
    roomId,
    sources: [...pages].reverse().map((page) => page.items),
  }).messages;
}

export function flattenRoomMessageSearchPages(
  pages: readonly RoomMessageSearchResponse[] | undefined,
): readonly ChatMessage[] {
  if (!pages || pages.length === 0) {
    return EMPTY_CHAT_MESSAGES;
  }

  const messageIds = new Set<string>();

  return pages
    .flatMap((page) => page.items)
    .filter((message) => {
      if (messageIds.has(message.messageId)) {
        return false;
      }

      messageIds.add(message.messageId);
      return true;
    })
    .sort((left, right) => right.roomSequence - left.roomSequence);
}

export function flattenRoomListPages<TItem>(
  pages: readonly { items: readonly TItem[] }[] | undefined,
): readonly TItem[] {
  if (!pages || pages.length === 0) {
    return EMPTY_ROOM_LIST_ITEMS;
  }

  return pages.flatMap((page) => page.items);
}

export async function recoverPublicRoomInvalidCursorOnce(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  error: unknown,
  state: PublicRoomInvalidCursorRecoveryState,
): Promise<boolean> {
  return recoverInvalidCursorOnce(queryClient, queryKey, error, state);
}

export async function recoverRoomCreationRequestInvalidCursorOnce(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  error: unknown,
  state: InvalidCursorRecoveryState,
): Promise<boolean> {
  return recoverInvalidCursorOnce(queryClient, queryKey, error, state);
}

// 공개방 목록의 둘째 페이지부터는 버리고 첫 페이지만 다시 받음
// 다시 받는 동안에는 기존 첫 페이지를 그대로 보여 목록이 비거나 깜빡이지 않음
// 정렬이 생성 순서가 아니어서 첫 페이지만 바꾸고 뒤 페이지를 남기면 방이 빠지거나 겹치므로, 뒤 페이지는 사용자가 다시 내릴 때 새로 받음
export async function refreshPublicRoomListFromFirstPage(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
): Promise<void> {
  queryClient.setQueryData<InfiniteData<unknown, unknown>>(queryKey, (data) =>
    data && data.pages.length > 1
      ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
      : data,
  );
  await queryClient.refetchQueries({ queryKey, exact: true });
}

async function recoverInvalidCursorOnce(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  error: unknown,
  state: InvalidCursorRecoveryState,
): Promise<boolean> {
  if (state.attempted || !(error instanceof ChatApiError) || error.code !== "INVALID_CURSOR") {
    return false;
  }

  state.attempted = true;
  await queryClient.resetQueries(
    {
      queryKey,
      exact: true,
    },
    {
      cancelRefetch: true,
    },
  );
  return true;
}

export function shouldRetryPublicRoomRequest(failureCount: number, error: Error): boolean {
  if (failureCount >= 1) {
    return false;
  }

  return !(error instanceof ChatApiError) || error.retryable;
}

export function getNextRoomInboxPageParam(
  lastPage: RoomInboxListResponse,
  _allPages: readonly RoomInboxListResponse[],
  _lastPageParam: string | null,
  allPageParams: readonly (string | null)[],
): string | null {
  if (!lastPage.hasNext || lastPage.nextCursor === null) {
    return null;
  }

  return allPageParams.includes(lastPage.nextCursor) ? null : lastPage.nextCursor;
}

export function shouldRetryRoomInboxRequest(failureCount: number, error: Error): boolean {
  return failureCount < ROOM_INBOX_MAX_RETRIES && error instanceof ChatApiError && error.retryable;
}

export function shouldRetryRoomReadReceiptStateRequest(
  failureCount: number,
  error: Error,
): boolean {
  return (
    failureCount < ROOM_READ_RECEIPT_STATE_MAX_RETRIES &&
    error instanceof ChatApiError &&
    error.retryable
  );
}

export function getRoomInboxRetryDelay(
  attemptIndex: number,
  random: () => number = Math.random,
): number {
  const delay = Math.min(
    ROOM_INBOX_RETRY_BASE_DELAY_MS * 2 ** attemptIndex,
    ROOM_INBOX_RETRY_MAX_DELAY_MS,
  );
  const jitterMultiplier = 0.75 + random() * 0.5;
  return Math.round(delay * jitterMultiplier);
}
