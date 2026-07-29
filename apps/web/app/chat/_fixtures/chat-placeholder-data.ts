type PlaceholderChatRoomData = {
  id: string;
  name: string;
  description: string;
  lastMessage: string;
  lastActivity: string;
  memberCount: number;
  unreadCount: number;
};

export type PlaceholderChatMessage = {
  id: string;
  senderUserId: string;
  senderName: string;
  content: string;
  sentAt: string;
};

export const PLACEHOLDER_CURRENT_USER_ID = "local-user-1";

export const PLACEHOLDER_CHAT_ROOMS = [
  {
    id: "integration-lab",
    name: "채팅 연동 테스트방",
    description: "REST와 WebSocket 연결을 확인하는 개발용 방입니다.",
    lastMessage: "WebSocket 연결이 완료되면 여기에서 메시지를 확인해요.",
    lastActivity: "방금 전",
    memberCount: 3,
    unreadCount: 2,
  },
  {
    id: "product-team",
    name: "프로덕트 팀",
    description: "기획과 개발 진행 상황을 공유하는 임시 방입니다.",
    lastMessage: "API 명세가 도착하면 방 목록부터 연결할게요.",
    lastActivity: "12분 전",
    memberCount: 7,
    unreadCount: 0,
  },
  {
    id: "random",
    name: "자유 대화",
    description: "실시간 메시지 UI를 확인하기 위한 임시 방입니다.",
    lastMessage: "오늘도 좋은 하루 보내세요!",
    lastActivity: "1시간 전",
    memberCount: 12,
    unreadCount: 0,
  },
] as const satisfies readonly PlaceholderChatRoomData[];

export type PlaceholderChatRoom = (typeof PLACEHOLDER_CHAT_ROOMS)[number];
type PlaceholderChatRoomId = PlaceholderChatRoom["id"];

const PLACEHOLDER_MESSAGES_BY_ROOM = {
  "integration-lab": [
    {
      id: "integration-message-1",
      senderUserId: "member-1",
      senderName: "member-1",
      content: "채팅방 화면의 기본 구조를 먼저 확인해 볼까요?",
      sentAt: "오후 2:31",
    },
    {
      id: "integration-message-2",
      senderUserId: PLACEHOLDER_CURRENT_USER_ID,
      senderName: "local-user-1",
      content: "좋아요. 지금은 임시 데이터이고 API 명세가 오면 실제 메시지로 교체할게요.",
      sentAt: "오후 2:32",
    },
    {
      id: "integration-message-3",
      senderUserId: "member-1",
      senderName: "member-1",
      content: "WebSocket 연결 상태와 전송 결과도 이 화면에서 같이 확인하면 좋겠어요.",
      sentAt: "오후 2:33",
    },
  ],
  "product-team": [
    {
      id: "product-message-1",
      senderUserId: "product-owner",
      senderName: "product-owner",
      content: "백엔드 API 명세가 정리되는 대로 공유할게요.",
      sentAt: "오후 1:48",
    },
    {
      id: "product-message-2",
      senderUserId: PLACEHOLDER_CURRENT_USER_ID,
      senderName: "local-user-1",
      content: "확인했습니다. 프론트에서는 Query hook과 화면 상태를 준비할게요.",
      sentAt: "오후 1:49",
    },
  ],
  random: [
    {
      id: "random-message-1",
      senderUserId: "member-2",
      senderName: "member-2",
      content: "오늘도 좋은 하루 보내세요!",
      sentAt: "오후 12:20",
    },
  ],
} as const satisfies Record<PlaceholderChatRoomId, readonly PlaceholderChatMessage[]>;

export function findPlaceholderChatRoom(roomId: string): PlaceholderChatRoom | undefined {
  return PLACEHOLDER_CHAT_ROOMS.find((room) => room.id === roomId);
}

export function getPlaceholderChatMessages(
  roomId: PlaceholderChatRoomId,
): readonly PlaceholderChatMessage[] {
  return PLACEHOLDER_MESSAGES_BY_ROOM[roomId];
}
