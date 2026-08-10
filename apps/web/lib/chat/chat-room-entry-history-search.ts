import type { ChatMessage } from "./chat-room-contracts";
import type { ChatRoomEntryReadPositionSnapshot } from "./chat-room-entry-read-position";

export const CHAT_ROOM_ENTRY_HISTORY_MAX_AUTOMATIC_PAGES = 5;

export type ChatRoomEntryHistoryPageState = Readonly<{
  hasOlderMessages: boolean;
  messages: readonly ChatMessage[];
}>;

type ChatRoomEntryHistorySearchBase = Readonly<{
  loadedPageCount: number;
}>;

export type ChatRoomEntryHistorySearchResult =
  | (ChatRoomEntryHistorySearchBase &
      Readonly<{
        status: "not-required";
      }>)
  | (ChatRoomEntryHistorySearchBase &
      Readonly<{
        firstUnreadSequence: number;
        status: "found";
      }>)
  | (ChatRoomEntryHistorySearchBase &
      Readonly<{
        status: "exhausted";
      }>)
  | (ChatRoomEntryHistorySearchBase &
      Readonly<{
        status: "limit-reached";
      }>)
  | (ChatRoomEntryHistorySearchBase &
      Readonly<{
        status: "stale";
      }>)
  | (ChatRoomEntryHistorySearchBase &
      Readonly<{
        error: unknown;
        status: "error";
      }>)
  | (ChatRoomEntryHistorySearchBase &
      Readonly<{
        status: "stalled";
      }>);

export type SearchChatRoomEntryHistoryOptions = Readonly<{
  entryPosition: ChatRoomEntryReadPositionSnapshot;
  initialHistory: ChatRoomEntryHistoryPageState;
  isCurrent?: () => boolean;
  loadOlder: () => Promise<ChatRoomEntryHistoryPageState>;
  maxAutomaticPages?: number;
}>;

type LoadedEntryBoundaryInspection =
  | Readonly<{
      firstUnreadSequence: number;
      status: "found";
    }>
  | Readonly<{
      oldestSequence: number | null;
      status: "needs-older";
    }>
  | Readonly<{
      status: "exhausted";
    }>;

export async function searchChatRoomEntryHistory({
  entryPosition,
  initialHistory,
  isCurrent = () => true,
  loadOlder,
  maxAutomaticPages = CHAT_ROOM_ENTRY_HISTORY_MAX_AUTOMATIC_PAGES,
}: SearchChatRoomEntryHistoryOptions): Promise<ChatRoomEntryHistorySearchResult> {
  if (!Number.isSafeInteger(maxAutomaticPages) || maxAutomaticPages < 0) {
    throw new RangeError("자동 과거 메시지 탐색 page 수는 0 이상의 안전한 정수여야 합니다.");
  }

  if (entryPosition.mode !== "restore") {
    return Object.freeze({ loadedPageCount: 0, status: "not-required" });
  }

  if (!isCurrent()) {
    return Object.freeze({ loadedPageCount: 0, status: "stale" });
  }

  let history = initialHistory;
  let loadedPageCount = 0;

  while (true) {
    const inspection = inspectLoadedEntryBoundary(history, entryPosition.dividerAfterSequence);

    if (inspection.status === "found") {
      return Object.freeze({
        firstUnreadSequence: inspection.firstUnreadSequence,
        loadedPageCount,
        status: "found",
      });
    }

    if (inspection.status === "exhausted") {
      return Object.freeze({ loadedPageCount, status: "exhausted" });
    }

    if (loadedPageCount >= maxAutomaticPages) {
      return Object.freeze({ loadedPageCount, status: "limit-reached" });
    }

    const previousOldestSequence = inspection.oldestSequence;

    try {
      history = await loadOlder();
    } catch (error) {
      return Object.freeze({ error, loadedPageCount, status: "error" });
    }

    loadedPageCount += 1;

    if (!isCurrent()) {
      return Object.freeze({ loadedPageCount, status: "stale" });
    }

    const nextOldestSequence = history.messages.at(0)?.roomSequence ?? null;

    if (
      history.hasOlderMessages &&
      (nextOldestSequence === null ||
        (previousOldestSequence !== null && nextOldestSequence >= previousOldestSequence))
    ) {
      return Object.freeze({ loadedPageCount, status: "stalled" });
    }
  }
}

function inspectLoadedEntryBoundary(
  history: ChatRoomEntryHistoryPageState,
  dividerAfterSequence: number,
): LoadedEntryBoundaryInspection {
  const oldestSequence = history.messages.at(0)?.roomSequence ?? null;
  const firstUnreadMessage = history.messages.find(
    (message) => message.roomSequence > dividerAfterSequence,
  );

  if (firstUnreadMessage && oldestSequence !== null && oldestSequence <= dividerAfterSequence) {
    return Object.freeze({
      firstUnreadSequence: firstUnreadMessage.roomSequence,
      status: "found",
    });
  }

  if (!history.hasOlderMessages) {
    return Object.freeze({ status: "exhausted" });
  }

  return Object.freeze({ oldestSequence, status: "needs-older" });
}
