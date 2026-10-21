import { describe, expect, it } from "vitest";
import type { RoomInboxLastMessage } from "@/lib/chat/chat-room-contracts";
import { getRoomInboxPreviewPresentation } from "./chat-room-inbox-preview";

describe("Room inbox preview presentation", () => {
  it("ACTIVE preview를 그대로 표시한다", () => {
    expect(getRoomInboxPreviewPresentation(createActiveMessage("안녕하세요."))).toEqual({
      text: "안녕하세요.",
      tone: "normal",
    });
  });

  it("truncated ACTIVE preview에는 말줄임표를 한 번만 붙인다", () => {
    expect(
      getRoomInboxPreviewPresentation(createActiveMessage("다음 회의는 월요일", true)).text,
    ).toBe("다음 회의는 월요일…");
    expect(getRoomInboxPreviewPresentation(createActiveMessage("이미 생략…", true)).text).toBe(
      "이미 생략…",
    );
  });

  it("빈 ACTIVE preview에는 중립 fallback을 표시한다", () => {
    expect(getRoomInboxPreviewPresentation(createActiveMessage("", true))).toEqual({
      text: "메시지가 있습니다.",
      tone: "muted",
    });
  });

  it("삭제된 latest message를 명시한다", () => {
    expect(
      getRoomInboxPreviewPresentation({
        ...createActiveMessage("삭제 전 메시지"),
        state: "DELETED_BY_AUTHOR",
        preview: null,
        previewTruncated: false,
      }),
    ).toEqual({
      text: "삭제된 메시지입니다.",
      tone: "deleted",
    });
  });

  it("lastMessage가 null이면 노출 가능한 메시지가 없다는 중립 문구를 표시한다", () => {
    expect(getRoomInboxPreviewPresentation(null)).toEqual({
      text: "표시할 메시지가 없습니다.",
      tone: "muted",
    });
  });

  it("복합 emoji를 다시 자르지 않는다", () => {
    const preview = "👨‍👩‍👧‍👦 회의";
    expect(getRoomInboxPreviewPresentation(createActiveMessage(preview)).text).toBe(preview);
  });
});

function createActiveMessage(
  preview: string,
  previewTruncated = false,
): Extract<RoomInboxLastMessage, { state: "ACTIVE" }> {
  return {
    messageId: "message-101",
    roomSequence: 101,
    messageVersion: 2,
    state: "ACTIVE",
    preview,
    previewTruncated,
    createdAt: "2026-08-04T08:30:00Z",
  };
}
