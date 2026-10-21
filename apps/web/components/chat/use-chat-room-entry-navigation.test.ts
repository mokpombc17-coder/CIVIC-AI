import { describe, expect, it } from "vitest";
import { createChatRoomEntryNavigationState } from "./use-chat-room-entry-navigation";
import type { ChatRoomEntryReadPositionSnapshot } from "../../lib/chat/chat-room-entry-read-position";

const RESTORE_POSITION = {
  dividerAfterSequence: 120,
  entryReadThroughSequence: 120,
  generation: 3,
  messageVisibleAfterSequence: 0,
  mode: "restore",
  roomId: "room-a",
  storedLastReadSequence: 120,
} as const satisfies ChatRoomEntryReadPositionSnapshot;

describe("chat Room entry navigation", () => {
  it("이미 최신까지 읽은 진입은 최신 위치에서 읽음 보고를 허용한다", () => {
    expect(
      createChatRoomEntryNavigationState({
        entryReadThroughSequence: 130,
        generation: 3,
        messageVisibleAfterSequence: 0,
        mode: "latest",
        roomId: "room-a",
        storedLastReadSequence: 130,
      }),
    ).toMatchObject({
      canReportReadState: true,
      initialScrollTarget: { kind: "latest" },
      readBoundaryAfterSequence: null,
      status: "ready",
    });
  });

  it("읽음 위치를 찾는 동안 스크롤과 읽음 보고를 보류한다", () => {
    expect(createChatRoomEntryNavigationState(RESTORE_POSITION)).toMatchObject({
      canReportReadState: false,
      initialScrollTarget: { kind: "pending" },
      status: "searching",
    });
  });

  it("읽음 위치를 찾으면 고정된 구분선으로 이동한다", () => {
    expect(
      createChatRoomEntryNavigationState(RESTORE_POSITION, {
        firstUnreadSequence: 121,
        loadedPageCount: 2,
        status: "found",
      }),
    ).toMatchObject({
      canReportReadState: true,
      initialScrollTarget: {
        afterSequence: 120,
        kind: "read-boundary",
      },
      readBoundaryAfterSequence: 120,
      status: "ready",
    });
  });

  it("자동 탐색 한도에 도달하면 수동 계속 탐색 전까지 이동과 읽음 보고를 보류한다", () => {
    expect(
      createChatRoomEntryNavigationState(RESTORE_POSITION, {
        loadedPageCount: 5,
        status: "limit-reached",
      }),
    ).toMatchObject({
      canReportReadState: false,
      initialScrollTarget: { kind: "pending" },
      readBoundaryAfterSequence: null,
      recovery: "continue",
      status: "manual",
    });
  });

  it("과거 이력 조회가 실패하면 같은 읽음 위치를 다시 찾을 수 있게 유지한다", () => {
    expect(
      createChatRoomEntryNavigationState(RESTORE_POSITION, {
        error: new Error("temporary"),
        loadedPageCount: 1,
        status: "error",
      }),
    ).toMatchObject({
      canReportReadState: false,
      initialScrollTarget: { kind: "pending" },
      readBoundaryAfterSequence: null,
      recovery: "retry",
      status: "error",
    });
  });

  it("재참여 visibility boundary는 읽음 구분선 없이 첫 접근 메시지로 이동한다", () => {
    expect(
      createChatRoomEntryNavigationState({
        entryReadThroughSequence: 100,
        generation: 3,
        messageVisibleAfterSequence: 100,
        mode: "visibility-boundary",
        roomId: "room-a",
        storedLastReadSequence: 80,
      }),
    ).toMatchObject({
      canReportReadState: true,
      initialScrollTarget: { kind: "first-message" },
      readBoundaryAfterSequence: null,
      status: "ready",
    });
  });
});
