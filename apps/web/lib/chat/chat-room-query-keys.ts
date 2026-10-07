import type { MembershipStatus, RoomCategoryId } from "./chat-room-contracts";

export const DEFAULT_MESSAGE_HISTORY_LIMIT = 50;
export const DEFAULT_ROOM_MESSAGE_SEARCH_LIMIT = 20;
export const DEFAULT_ROOM_MESSAGE_CONTEXT_SIZE = 20;

export type ChatRoomListQueryParams = Readonly<{
  limit?: number;
}>;

export type PublicRoomListQueryParams = Readonly<{
  query?: string;
  categoryId?: RoomCategoryId;
  limit?: number;
}>;

export type PublicRoomListCriteria = Readonly<{
  query?: string;
  categoryId?: RoomCategoryId;
  joinPolicy: "OPEN";
  limit: number;
}>;

export type InvalidCursorRecoveryState = {
  attempted: boolean;
};

export type PublicRoomInvalidCursorRecoveryState = InvalidCursorRecoveryState;

export type ChatRoomMembershipListQueryParams = Readonly<{
  enabled?: boolean;
  status?: MembershipStatus;
  limit?: number;
}>;

export type ChatRoomQueryParams = Readonly<{
  enabled?: boolean;
}>;

export type ChatMessageHistoryQueryParams = Readonly<{
  enabled: boolean;
  limit?: number;
}>;

export type ChatRoomReadReceiptStateQueryParams = Readonly<{
  enabled: boolean;
  generation: number;
}>;

export type ChatRoomParticipationQueryParams = Readonly<{
  enabled: boolean;
  generation: number;
}>;

export type ChatRoomMessageSearchQueryParams = Readonly<{
  enabled: boolean;
  generation: number;
  sessionGeneration?: number;
  query: string;
  limit?: number;
}>;

export type ChatRoomMessageSearchCriteria = Readonly<{
  generation: number;
  sessionGeneration: number;
  query: string;
  limit: number;
}>;

export type ChatRoomMessageContextQueryParams = Readonly<{
  enabled: boolean;
  generation: number;
  before?: number;
  after?: number;
}>;

export const chatRoomQueryKeys = {
  all: ["chat", "rooms"] as const,
  publicLists: () => [...chatRoomQueryKeys.all, "public-list"] as const,
  publicList: (criteria: PublicRoomListCriteria) =>
    [...chatRoomQueryKeys.publicLists(), criteria] as const,
  myLists: () => [...chatRoomQueryKeys.all, "my-list"] as const,
  myList: (limit: number) => [...chatRoomQueryKeys.myLists(), { limit }] as const,
  creationRequests: () => [...chatRoomQueryKeys.all, "creation-request"] as const,
  creationRequestLists: () => [...chatRoomQueryKeys.creationRequests(), "list"] as const,
  creationRequestList: (limit: number) =>
    [...chatRoomQueryKeys.creationRequestLists(), { limit }] as const,
  creationRequestDetails: () => [...chatRoomQueryKeys.creationRequests(), "detail"] as const,
  creationRequestDetail: (creationRequestId: string) =>
    [...chatRoomQueryKeys.creationRequestDetails(), creationRequestId] as const,
  roomInboxes: () => [...chatRoomQueryKeys.all, "room-inbox"] as const,
  roomInbox: (limit: number) => [...chatRoomQueryKeys.roomInboxes(), { limit }] as const,
  details: () => [...chatRoomQueryKeys.all, "detail"] as const,
  detail: (roomId: string) => [...chatRoomQueryKeys.details(), roomId] as const,
  myMemberships: () => [...chatRoomQueryKeys.all, "my-membership"] as const,
  myMembership: (roomId: string) => [...chatRoomQueryKeys.myMemberships(), roomId] as const,
  membershipLists: (roomId: string) =>
    [...chatRoomQueryKeys.all, "membership-list", roomId] as const,
  membershipList: (roomId: string, status: MembershipStatus, limit: number) =>
    [...chatRoomQueryKeys.membershipLists(roomId), { status, limit }] as const,
  participations: () => [...chatRoomQueryKeys.all, "participation"] as const,
  participationsForRoom: (roomId: string) =>
    [...chatRoomQueryKeys.participations(), roomId] as const,
  participation: (roomId: string, generation: number) =>
    [...chatRoomQueryKeys.participationsForRoom(roomId), { generation }] as const,
  messageHistories: () => [...chatRoomQueryKeys.all, "message-history"] as const,
  messageHistoriesForRoom: (roomId: string) =>
    [...chatRoomQueryKeys.messageHistories(), roomId] as const,
  messageHistory: (roomId: string, limit: number) =>
    [...chatRoomQueryKeys.messageHistoriesForRoom(roomId), { limit }] as const,
  messageSearches: () => [...chatRoomQueryKeys.all, "message-search"] as const,
  messageSearchesForRoom: (roomId: string) =>
    [...chatRoomQueryKeys.messageSearches(), roomId] as const,
  messageSearch: (roomId: string, criteria: ChatRoomMessageSearchCriteria) =>
    [...chatRoomQueryKeys.messageSearchesForRoom(roomId), criteria] as const,
  messageContexts: () => [...chatRoomQueryKeys.all, "message-context"] as const,
  messageContextsForRoom: (roomId: string) =>
    [...chatRoomQueryKeys.messageContexts(), roomId] as const,
  messageContext: (
    roomId: string,
    messageId: string,
    generation: number,
    before: number,
    after: number,
  ) =>
    [
      ...chatRoomQueryKeys.messageContextsForRoom(roomId),
      messageId,
      { generation, before, after },
    ] as const,
  roomEventJournals: () => [...chatRoomQueryKeys.all, "room-event-journal"] as const,
  roomEventJournal: (roomId: string) => [...chatRoomQueryKeys.roomEventJournals(), roomId] as const,
  systemActivityJournals: () => [...chatRoomQueryKeys.all, "system-activity-journal"] as const,
  systemActivityJournal: (roomId: string) =>
    [...chatRoomQueryKeys.systemActivityJournals(), roomId] as const,
  readReceiptStates: () => [...chatRoomQueryKeys.all, "read-receipt-state"] as const,
  readReceiptStatesForRoom: (roomId: string) =>
    [...chatRoomQueryKeys.readReceiptStates(), roomId] as const,
  readReceiptState: (roomId: string, generation: number) =>
    [...chatRoomQueryKeys.readReceiptStatesForRoom(roomId), { generation }] as const,
};
