import { describe, expect, it } from "vitest";
import {
  CHAT_ROOM_PUBLISHING_COPY,
  getChatRoomMemberCountPresentation,
  TEMPORARY_CHAT_ROOM_MEMBER_LIMIT,
} from "./chat-room-publishing";

describe("chat room publishing presentation", () => {
  it("백엔드 최대 정원 필드가 생기기 전까지 50명을 기본 정원으로 표시한다", () => {
    expect(TEMPORARY_CHAT_ROOM_MEMBER_LIMIT).toBe(50);
    expect(getChatRoomMemberCountPresentation(8)).toEqual({
      ariaLabel: "현재 참여 인원 8명, 최대 50명",
      text: "8 / 50명",
    });
  });

  it("향후 서버 정원이 제공되면 같은 표현 함수에 값을 전달할 수 있다", () => {
    expect(getChatRoomMemberCountPresentation(6, 10)).toEqual({
      ariaLabel: "현재 참여 인원 6명, 최대 10명",
      text: "6 / 10명",
    });
  });

  it("확정한 목록 화면 문구를 한곳에서 제공한다", () => {
    expect(CHAT_ROOM_PUBLISHING_COPY).toEqual({
      createRoom: "채팅방 생성",
      noAvailableRooms: "참여 가능한 방이 없습니다.",
    });
  });

  it.each([
    [-1, 50],
    [1.5, 50],
    [0, 0],
    [0, Number.MAX_SAFE_INTEGER + 1],
  ])("잘못된 인원 값은 거절한다: active=%s, limit=%s", (active, limit) => {
    expect(() => getChatRoomMemberCountPresentation(active, limit)).toThrow(RangeError);
  });
});
