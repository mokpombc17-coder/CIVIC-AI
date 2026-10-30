// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createChatRoomEntryNavigationState,
  useChatRoomEntryNavigation,
} from "./use-chat-room-entry-navigation";
import type { ChatMessage } from "../../lib/chat/chat-room-contracts";
import type { ChatRoomEntryReadPositionSnapshot } from "../../lib/chat/chat-room-entry-read-position";
import type { ChatRoomReadReceiptState } from "../../lib/chat/chat-room-read-receipt-state";

type HookParams = Parameters<typeof useChatRoomEntryNavigation>[0];

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

describe("useChatRoomEntryNavigation", () => {
  afterEach(() => {
    cleanup();
  });

  it("재연결로 generation이 바뀌어도 입장 위치를 다시 정하지 않고 안 읽은 구분선을 유지한다", async () => {
    const params = createHookParams({ storedLastReadSequence: 3 });
    const { result, rerender } = renderHook(
      (props: HookParams) => useChatRoomEntryNavigation(props),
      {
        initialProps: params,
      },
    );
    await flushMicrotasks();
    expect(result.current).toMatchObject({ readBoundaryAfterSequence: 3, status: "ready" });

    // 재연결 사이 화면에서 본 메시지까지 읽은 위치가 서버에 저장됨
    rerender({
      ...params,
      generation: 2,
      receiptState: createReceiptState(5),
    });
    await flushMicrotasks();

    expect(result.current).toMatchObject({ readBoundaryAfterSequence: 3, status: "ready" });
  });

  it("재연결 뒤 읽음 동기화가 실패해도 이미 정한 입장 위치를 지우지 않는다", async () => {
    const params = createHookParams({ storedLastReadSequence: 3 });
    const { result, rerender } = renderHook(
      (props: HookParams) => useChatRoomEntryNavigation(props),
      {
        initialProps: params,
      },
    );
    await flushMicrotasks();

    rerender({ ...params, generation: 2, receiptStateUnavailable: true });
    await flushMicrotasks();

    expect(result.current).toMatchObject({ readBoundaryAfterSequence: 3, status: "ready" });
  });

  it("다른 방으로 바뀌면 입장 위치를 다시 정한다", async () => {
    const params = createHookParams({ storedLastReadSequence: 3 });
    const { result, rerender } = renderHook(
      (props: HookParams) => useChatRoomEntryNavigation(props),
      {
        initialProps: params,
      },
    );
    await flushMicrotasks();

    rerender({
      ...params,
      history: createHistory("room-b"),
      receiptState: createReceiptState(2, "room-b"),
      roomId: "room-b",
    });
    await flushMicrotasks();

    expect(result.current).toMatchObject({
      key: "room-b",
      readBoundaryAfterSequence: 2,
      status: "ready",
    });
  });
});

function createHookParams({
  storedLastReadSequence,
}: Readonly<{ storedLastReadSequence: number }>): HookParams {
  return {
    enabled: true,
    generation: 1,
    history: createHistory("room-a"),
    historyReady: true,
    latestConfirmedSequence: 6,
    loadFirstUnreadMessage: vi.fn<HookParams["loadFirstUnreadMessage"]>(),
    onJumpToMessage: vi.fn(),
    receiptState: createReceiptState(storedLastReadSequence),
    receiptStateReady: true,
    receiptStateUnavailable: false,
    roomId: "room-a",
    selfMembershipId: "membership-a",
  };
}

function createHistory(roomId: string): HookParams["history"] {
  return {
    hasOlderMessages: false,
    messages: [1, 2, 3, 4, 5, 6].map((roomSequence) => createMessage(roomId, roomSequence)),
  };
}

function createReceiptState(
  storedLastReadSequence: number,
  roomId = "room-a",
): ChatRoomReadReceiptState {
  return {
    generatedAt: "2026-10-26T00:00:00Z",
    positionsByMembershipId: {
      "membership-a": {
        membershipId: "membership-a",
        membershipVersion: 1,
        messageVisibleAfterSequence: 0,
        storedLastReadSequence,
      },
    },
    roomId,
    roomVersion: 1,
    selfMembershipId: "membership-a",
  };
}

function createMessage(roomId: string, roomSequence: number): ChatMessage {
  return {
    messageId: `${roomId}-message-${roomSequence}`,
    roomId,
    roomSequence,
    senderMembershipId: "membership-b",
    senderParticipationId: "participation-fixture",
    clientMessageId: `00000000-0000-4000-8000-${String(roomSequence).padStart(12, "0")}`,
    content: `메시지 ${roomSequence}`,
    state: "ACTIVE",
    countable: true,
    messageVersion: 1,
    createdAt: "2026-10-26T00:00:00Z",
    updatedAt: "2026-10-26T00:00:00Z",
    deletedAt: null,
  };
}

// 입장 상태는 queueMicrotask로 반영되므로 기대값을 확인하기 전에 비움
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}
