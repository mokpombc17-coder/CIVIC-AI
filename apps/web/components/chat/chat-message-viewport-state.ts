export type ChatMessageOlderHistoryState = "idle" | "loading" | "exhausted" | "error";

export type ChatMessageAppendSource = "current-user" | "realtime";

export type ChatMessageViewportInitialScrollTarget =
  | Readonly<{
      kind: "pending";
    }>
  | Readonly<{
      kind: "latest";
    }>
  | Readonly<{
      kind: "first-message";
    }>
  | Readonly<{
      afterSequence: number;
      kind: "read-boundary";
    }>
  | Readonly<{
      kind: "message";
      messageId: string;
    }>;

type ChatMessageInitialScrollItem =
  | Readonly<{
      kind: "date-separator";
    }>
  | Readonly<{
      kind: "message";
      item?: Readonly<{ messageId: string | null }>;
      messageId?: string | null;
    }>
  | Readonly<{
      afterSequence: number;
      kind: "read-boundary";
    }>
  | Readonly<{
      kind: "system-activity";
    }>;

export type ChatMessageViewportState = Readonly<{
  olderHistory: ChatMessageOlderHistoryState;
}>;

export type ChatMessageViewportEvent =
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
      type: "reset";
      hasOlderMessages: boolean;
    }>;

export function createChatMessageViewportState(
  hasOlderMessages: boolean,
): ChatMessageViewportState {
  return {
    olderHistory: hasOlderMessages ? "idle" : "exhausted",
  };
}

export function findChatMessageInitialScrollIndex(
  items: readonly ChatMessageInitialScrollItem[],
  target: ChatMessageViewportInitialScrollTarget,
): number | null {
  switch (target.kind) {
    case "pending":
      return null;
    case "latest":
      return items.length === 0 ? null : items.length - 1;
    case "first-message": {
      const index = items.findIndex((item) => item.kind === "message");
      return index < 0 ? null : index;
    }
    case "read-boundary": {
      const index = items.findIndex(
        (item) => item.kind === "read-boundary" && item.afterSequence === target.afterSequence,
      );
      return index < 0 ? null : index;
    }
    case "message": {
      const index = items.findIndex(
        (item) =>
          item.kind === "message" &&
          (item.messageId ?? item.item?.messageId ?? null) === target.messageId,
      );
      return index < 0 ? null : index;
    }
  }
}

export function reduceChatMessageViewportState(
  state: ChatMessageViewportState,
  event: ChatMessageViewportEvent,
): ChatMessageViewportState {
  switch (event.type) {
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

    case "reset":
      return createChatMessageViewportState(event.hasOlderMessages);
  }
}
