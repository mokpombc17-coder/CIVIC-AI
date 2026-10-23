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

  it("첫 안 읽은 메시지를 찾는 동안 스크롤과 읽음 보고를 보류한다", () => {
    expect(createChatRoomEntryNavigationState(RESTORE_POSITION)).toMatchObject({
      canReportReadState: false,
      initialScrollTarget: { kind: "pending" },
      jumpMessageId: null,
      status: "jumping",
    });
  });

  it("읽은 위치가 처음 불러온 목록에 있으면 그 목록에서 구분선으로 이동한다", () => {
    expect(
      createChatRoomEntryNavigationState(RESTORE_POSITION, { status: "in-history" }),
    ).toMatchObject({
      canReportReadState: true,
      initialScrollTarget: {
        afterSequence: 120,
        kind: "read-boundary",
      },
      jumpMessageId: null,
      readBoundaryAfterSequence: 120,
      status: "ready",
    });
  });

  it("읽은 위치가 목록 밖이면 첫 안 읽은 메시지 위치의 목록을 열고 구분선으로 이동한다", () => {
    expect(
      createChatRoomEntryNavigationState(RESTORE_POSITION, {
        messageId: "message-121",
        status: "jumped",
      }),
    ).toMatchObject({
      canReportReadState: true,
      initialScrollTarget: {
        afterSequence: 120,
        kind: "read-boundary",
      },
      jumpMessageId: "message-121",
      readBoundaryAfterSequence: 120,
      status: "ready",
    });
  });

  it("그 사이 읽을 메시지가 없어졌으면 최신 위치로 이동한다", () => {
    expect(
      createChatRoomEntryNavigationState(RESTORE_POSITION, { status: "no-unread" }),
    ).toMatchObject({
      canReportReadState: true,
      initialScrollTarget: { kind: "latest" },
      jumpMessageId: null,
      readBoundaryAfterSequence: null,
      status: "ready",
    });
  });

  it("첫 안 읽은 메시지를 찾지 못하면 최신 메시지를 보여 주고 다시 찾을 때까지 읽은 위치를 저장하지 않는다", () => {
    expect(
      createChatRoomEntryNavigationState(RESTORE_POSITION, { status: "failed" }),
    ).toMatchObject({
      canReportReadState: false,
      initialScrollTarget: { kind: "latest" },
      jumpMessageId: null,
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
