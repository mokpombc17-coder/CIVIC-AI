export const TEMPORARY_CHAT_ROOM_MEMBER_LIMIT = 50;
export const TEMPORARY_CHAT_USER_ACTIVE_ROOM_LIMIT = 20;

export const CHAT_ROOM_PUBLISHING_COPY = {
  activeRoomLimitReached: "토론방은 동시에 최대 20개까지 참여할 수 있어요.",
  createRoom: "토론방 생성 요청",
  noAvailableRooms: "현재 참여 가능한 방이 없어요",
  noAvailableRoomsDescription: "원하는 주제로 토론방 생성을 요청해 보세요.",
  noPublicRoomSearchResults: "검색 결과가 없어요",
} as const;

/**
 * Backend가 사용자별 ACTIVE Room quota 상태를 제공하기 전까지 현재 운영 기본값을 사용한다.
 * 계약에 count/limit 또는 isAtLimit 필드가 추가되면 서버 값을 authoritative하게 사용한다.
 */
export function hasReachedChatUserActiveRoomLimit(
  activeRoomCount: number,
  activeRoomLimit = TEMPORARY_CHAT_USER_ACTIVE_ROOM_LIMIT,
): boolean {
  assertSafeNonnegativeInteger(activeRoomCount, "activeRoomCount");
  assertSafePositiveInteger(activeRoomLimit, "activeRoomLimit");

  return activeRoomCount >= activeRoomLimit;
}

export type ChatRoomMemberCountPresentation = Readonly<{
  ariaLabel: string;
  text: string;
}>;

/**
 * Backend가 Room별 최대 정원을 제공하기 전까지 기본값으로 50명을 사용한다.
 * 계약에 최대 정원 필드가 추가되면 호출부에서 memberLimit을 전달하고 임시 상수를 제거한다.
 */
export function getChatRoomMemberCountPresentation(
  activeMemberCount: number,
  memberLimit = TEMPORARY_CHAT_ROOM_MEMBER_LIMIT,
): ChatRoomMemberCountPresentation {
  assertSafeNonnegativeInteger(activeMemberCount, "activeMemberCount");
  assertSafePositiveInteger(memberLimit, "memberLimit");

  return {
    ariaLabel: `현재 참여 인원 ${activeMemberCount}명, 최대 ${memberLimit}명`,
    text: `${activeMemberCount} / ${memberLimit}명`,
  };
}

function assertSafeNonnegativeInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${fieldName}는 0 이상의 안전한 정수여야 합니다.`);
  }
}

function assertSafePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${fieldName}는 1 이상의 안전한 정수여야 합니다.`);
  }
}
