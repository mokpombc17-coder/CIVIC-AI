export type ChatRoomUnreadBadgePresentation = Readonly<{
  ariaLabel: string;
  text: string;
}>;

export function getChatRoomUnreadBadgePresentation(
  unreadCount: number,
  unreadCountCapped: boolean,
): ChatRoomUnreadBadgePresentation | null {
  if (!Number.isSafeInteger(unreadCount) || unreadCount < 0) {
    throw new RangeError("unreadCount는 0 이상의 안전한 정수여야 합니다.");
  }

  if (unreadCount === 0) {
    return null;
  }

  return {
    ariaLabel: unreadCountCapped
      ? `읽지 않은 메시지 ${unreadCount}개 이상`
      : `읽지 않은 메시지 ${unreadCount}개`,
    text: unreadCountCapped ? `${unreadCount}+` : String(unreadCount),
  };
}
