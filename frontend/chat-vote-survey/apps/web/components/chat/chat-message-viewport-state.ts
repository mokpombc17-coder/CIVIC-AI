export type ChatMessageOlderHistoryStatus = "idle" | "loading" | "exhausted" | "error";

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
    }>
  | Readonly<{
      kind: "anchor";
      offsetFromViewportTop: number;
      renderKey: string;
    }>;

type ChatMessageInitialScrollItem = Readonly<{ renderKey?: string }> &
  (
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
      }>
  );

export type ChatMessageOlderHistoryState = Readonly<{
  status: ChatMessageOlderHistoryStatus;
}>;

export type ChatMessageOlderHistoryEvent =
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
      type: "load-older-cancelled";
      hasOlderMessages: boolean;
    }>
  | Readonly<{
      type: "older-availability-changed";
      hasOlderMessages: boolean;
    }>
  | Readonly<{
      type: "reset";
      hasOlderMessages: boolean;
    }>;

export function createChatMessageOlderHistoryState(
  hasOlderMessages: boolean,
): ChatMessageOlderHistoryState {
  return {
    status: hasOlderMessages ? "idle" : "exhausted",
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
    case "anchor": {
      const index = items.findIndex((item) => item.renderKey === target.renderKey);
      return index < 0 ? null : index;
    }
  }
}

export function reduceChatMessageOlderHistory(
  state: ChatMessageOlderHistoryState,
  event: ChatMessageOlderHistoryEvent,
): ChatMessageOlderHistoryState {
  switch (event.type) {
    case "load-older-started":
      return {
        ...state,
        status: "loading",
      };

    case "load-older-succeeded":
      return {
        ...state,
        status: event.hasOlderMessages ? "idle" : "exhausted",
      };

    case "load-older-failed":
      return {
        ...state,
        status: "error",
      };

    case "load-older-cancelled":
      // 재연결로 위치를 유지할 때 진행 중이던 요청과 함께 실패 상태도 정리함
      // 실패 상태로 남기면 스크롤로는 다시 불러오지 않아 연결이 돌아와도 다시 시도 버튼을 눌러야 함
      if (state.status !== "loading" && state.status !== "error") {
        return state;
      }

      return {
        ...state,
        status: event.hasOlderMessages ? "idle" : "exhausted",
      };

    case "older-availability-changed": {
      const status = event.hasOlderMessages ? "idle" : "exhausted";

      if (state.status === status) {
        return state;
      }

      return {
        ...state,
        status,
      };
    }

    case "reset":
      return createChatMessageOlderHistoryState(event.hasOlderMessages);
  }
}
