export const TEMPORARY_CHAT_ROOM_MEMBER_LIMIT = 50;

export const CHAT_ROOM_PUBLISHING_COPY = {
  createRoom: "채팅방 생성 요청",
  noAvailableRooms: "참여 가능한 방이 없습니다.",
} as const;

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
