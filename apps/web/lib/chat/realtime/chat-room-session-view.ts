import type { ChatRoomSessionSnapshot } from "./chat-realtime-transport";

export type ChatRoomSessionView =
  | {
      kind: "active";
      title: string;
      description: string;
      canDraft: true;
      canReactivate: false;
    }
  | {
      kind: "pending" | "replaced" | "error";
      title: string;
      description: string;
      canDraft: false;
      canReactivate: boolean;
    };

export function getChatRoomSessionView(
  snapshot: ChatRoomSessionSnapshot,
  roomId: string,
): ChatRoomSessionView {
  if (snapshot.status === "active" && snapshot.roomId === roomId) {
    return {
      kind: "active",
      title: "이 탭에서 실시간 채팅을 사용 중입니다.",
      description: "다른 탭에서 채팅방을 활성화하면 이 탭의 입력이 중지됩니다.",
      canDraft: true,
      canReactivate: false,
    };
  }

  if (snapshot.status === "replaced" && snapshot.roomId === roomId) {
    return {
      kind: "replaced",
      title: "다른 탭에서 채팅방을 사용 중입니다.",
      description:
        "작성 중인 내용은 유지되며, 이 탭을 다시 활성화하면 다른 탭의 입력이 중지됩니다.",
      canDraft: false,
      canReactivate: true,
    };
  }

  if (snapshot.status === "error" && snapshot.roomId === roomId) {
    return {
      kind: "error",
      title: "채팅방 실시간 연결을 활성화하지 못했습니다.",
      description: snapshot.error?.message ?? "잠시 후 이 탭에서 다시 활성화해 주세요.",
      canDraft: false,
      canReactivate: true,
    };
  }

  return {
    kind: "pending",
    title: "채팅방 실시간 연결을 준비하고 있습니다.",
    description: "방 구독이 완료될 때까지 메시지 입력을 잠시 기다려 주세요.",
    canDraft: false,
    canReactivate: snapshot.status === "idle",
  };
}
