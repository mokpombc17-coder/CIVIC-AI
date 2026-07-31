export type ChatMessageViewportPosition = "initializing" | "pinned" | "detached";

export type ChatMessageOlderHistoryState = "idle" | "loading" | "exhausted" | "error";

export type ChatMessageAppendSource = "current-user" | "realtime";

export type ChatMessageViewportState = Readonly<{
  olderHistory: ChatMessageOlderHistoryState;
  position: ChatMessageViewportPosition;
  unseenMessageCount: number;
}>;

export type ChatMessageViewportEvent =
  | Readonly<{
      type: "viewport-ready";
      isAtEnd: boolean;
    }>
  | Readonly<{
      type: "scroll-position-changed";
      isAtEnd: boolean;
    }>
  | Readonly<{
      type: "messages-appended";
      count: number;
      source: ChatMessageAppendSource;
    }>
  | Readonly<{
      type: "load-older-started";
    }>
  | Readonly<{
      type: "load-older-succeeded";
      hasOlderMessages: boolean;
    }>
  | Readonly<{
      type: "load-older-failed";
    }>
  | Readonly<{
      type: "older-availability-changed";
      hasOlderMessages: boolean;
    }>
  | Readonly<{
      type: "jump-to-latest";
    }>
  | Readonly<{
      type: "reset";
      hasOlderMessages: boolean;
    }>;

export function createChatMessageViewportState(
  hasOlderMessages: boolean,
): ChatMessageViewportState {
  return {
    olderHistory: hasOlderMessages ? "idle" : "exhausted",
    position: "initializing",
    unseenMessageCount: 0,
  };
}

export function reduceChatMessageViewportState(
  state: ChatMessageViewportState,
  event: ChatMessageViewportEvent,
): ChatMessageViewportState {
  switch (event.type) {
    case "viewport-ready":
    case "scroll-position-changed": {
      const position = event.isAtEnd ? "pinned" : "detached";
      const unseenMessageCount = event.isAtEnd ? 0 : state.unseenMessageCount;

      if (state.position === position && state.unseenMessageCount === unseenMessageCount) {
        return state;
      }

      return {
        ...state,
        position,
        unseenMessageCount,
      };
    }

    case "messages-appended": {
      assertPositiveMessageCount(event.count);

      if (event.source === "current-user") {
        return {
          ...state,
          position: "pinned",
          unseenMessageCount: 0,
        };
      }

      if (state.position !== "detached") {
        return state;
      }

      return {
        ...state,
        unseenMessageCount: state.unseenMessageCount + event.count,
      };
    }

    case "load-older-started":
      return {
        ...state,
        olderHistory: "loading",
      };

    case "load-older-succeeded":
      return {
        ...state,
        olderHistory: event.hasOlderMessages ? "idle" : "exhausted",
      };

    case "load-older-failed":
      return {
        ...state,
        olderHistory: "error",
      };

    case "older-availability-changed": {
      const olderHistory = event.hasOlderMessages ? "idle" : "exhausted";

      if (state.olderHistory === olderHistory) {
        return state;
      }

      return {
        ...state,
        olderHistory,
      };
    }

    case "jump-to-latest":
      return {
        ...state,
        position: "pinned",
        unseenMessageCount: 0,
      };

    case "reset":
      return createChatMessageViewportState(event.hasOlderMessages);
  }
}

export function shouldFollowLatestMessages(
  position: ChatMessageViewportPosition,
  source: ChatMessageAppendSource,
): boolean {
  return position !== "detached" || source === "current-user";
}

function assertPositiveMessageCount(count: number): void {
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new RangeError("추가된 메시지 수는 1 이상의 안전한 정수여야 합니다.");
  }
}
