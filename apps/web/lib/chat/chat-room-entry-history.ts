import type { ChatMessage } from "./chat-room-contracts";

export type ChatRoomEntryHistoryPageState = Readonly<{
  hasOlderMessages: boolean;
  messages: readonly ChatMessage[];
}>;

export type ChatRoomEntryHistoryInspection =
  | Readonly<{
      firstUnreadSequence: number;
      status: "found";
    }>
  | Readonly<{
      status: "outside";
    }>
  | Readonly<{
      status: "exhausted";
    }>;

// 방에 들어올 때 최신 페이지에 읽은 위치가 들어 있는지 확인함
// 들어 있으면 최신 대화에서 안 읽은 구분선으로 이동하고, 최신 페이지보다 이전이면 첫 안 읽은 메시지 주변을 따로 불러와 읽은 위치로 이동한 대화로 보여 줌
// 더 이전 메시지가 없는 방은 최신 페이지가 전체 메시지이므로 들어 있는 경우와 같이 처리함
export function inspectChatRoomEntryHistory(
  history: ChatRoomEntryHistoryPageState,
  dividerAfterSequence: number,
): ChatRoomEntryHistoryInspection {
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

  return Object.freeze({ status: "outside" });
}
