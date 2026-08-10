import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "./chat-room-contracts";
import type { ChatRoomEntryReadPositionSnapshot } from "./chat-room-entry-read-position";
import {
  CHAT_ROOM_ENTRY_HISTORY_MAX_AUTOMATIC_PAGES,
  searchChatRoomEntryHistory,
  type ChatRoomEntryHistoryPageState,
} from "./chat-room-entry-history-search";

const RESTORE_POSITION: ChatRoomEntryReadPositionSnapshot = {
  dividerAfterSequence: 100,
  entryReadThroughSequence: 100,
  generation: 7,
  messageVisibleAfterSequence: 0,
  mode: "restore",
  roomId: "room-01",
  storedLastReadSequence: 100,
};

describe("Room entry history search", () => {
  it("현재 history에 읽음 경계가 있으면 추가 page 없이 첫 안 읽은 sequence를 찾는다", async () => {
    const loadOlder = vi.fn<() => Promise<ChatRoomEntryHistoryPageState>>();

    await expect(
      searchChatRoomEntryHistory({
        entryPosition: RESTORE_POSITION,
        initialHistory: createHistory([100, 101, 102], true),
        loadOlder,
      }),
    ).resolves.toEqual({
      firstUnreadSequence: 101,
      loadedPageCount: 0,
      status: "found",
    });
    expect(loadOlder).not.toHaveBeenCalled();
  });

  it("과거 page를 한 번에 하나씩 불러와 경계를 포함한 즉시 중단한다", async () => {
    const loadOlder = vi
      .fn<() => Promise<ChatRoomEntryHistoryPageState>>()
      .mockResolvedValueOnce(createHistory([150, 200, 250], true))
      .mockResolvedValueOnce(createHistory([90, 100, 150, 200, 250], true));

    await expect(
      searchChatRoomEntryHistory({
        entryPosition: RESTORE_POSITION,
        initialHistory: createHistory([200, 250], true),
        loadOlder,
      }),
    ).resolves.toEqual({
      firstUnreadSequence: 150,
      loadedPageCount: 2,
      status: "found",
    });
    expect(loadOlder).toHaveBeenCalledTimes(2);
  });

  it("자동 탐색은 기본 5 page에서 멈추고 수동 탐색 대상으로 남긴다", async () => {
    let oldestSequence = 500;
    const loadOlder = vi.fn(async () => {
      oldestSequence -= 50;
      return createHistory([oldestSequence, 600], true);
    });

    await expect(
      searchChatRoomEntryHistory({
        entryPosition: RESTORE_POSITION,
        initialHistory: createHistory([550, 600], true),
        loadOlder,
      }),
    ).resolves.toEqual({
      loadedPageCount: CHAT_ROOM_ENTRY_HISTORY_MAX_AUTOMATIC_PAGES,
      status: "limit-reached",
    });
    expect(loadOlder).toHaveBeenCalledTimes(CHAT_ROOM_ENTRY_HISTORY_MAX_AUTOMATIC_PAGES);
  });

  it("과거 history 끝까지 경계를 찾지 못하면 exhausted로 종료한다", async () => {
    const loadOlder = vi.fn(async () => createHistory([150, 200], false));

    await expect(
      searchChatRoomEntryHistory({
        entryPosition: RESTORE_POSITION,
        initialHistory: createHistory([200], true),
        loadOlder,
      }),
    ).resolves.toEqual({ loadedPageCount: 1, status: "exhausted" });
  });

  it("page가 더 있다고 응답하면서 가장 오래된 sequence가 전진하지 않으면 중단한다", async () => {
    const loadOlder = vi.fn(async () => createHistory([200, 250], true));

    await expect(
      searchChatRoomEntryHistory({
        entryPosition: RESTORE_POSITION,
        initialHistory: createHistory([200, 250], true),
        loadOlder,
      }),
    ).resolves.toEqual({ loadedPageCount: 1, status: "stalled" });
  });

  it("page 조회 실패를 기존 history와 분리된 error 결과로 보존한다", async () => {
    const error = new Error("older page unavailable");

    await expect(
      searchChatRoomEntryHistory({
        entryPosition: RESTORE_POSITION,
        initialHistory: createHistory([200], true),
        loadOlder: vi.fn().mockRejectedValue(error),
      }),
    ).resolves.toEqual({ error, loadedPageCount: 0, status: "error" });
  });

  it("Room generation이 탐색 전이나 요청 중 바뀌면 늦은 결과를 적용하지 않는다", async () => {
    const loadOlder = vi.fn(async () => createHistory([90, 101, 200], true));

    await expect(
      searchChatRoomEntryHistory({
        entryPosition: RESTORE_POSITION,
        initialHistory: createHistory([200], true),
        isCurrent: () => false,
        loadOlder,
      }),
    ).resolves.toEqual({ loadedPageCount: 0, status: "stale" });
    expect(loadOlder).not.toHaveBeenCalled();

    let current = true;
    await expect(
      searchChatRoomEntryHistory({
        entryPosition: RESTORE_POSITION,
        initialHistory: createHistory([200], true),
        isCurrent: () => current,
        loadOlder: async () => {
          current = false;
          return createHistory([90, 101, 200], true);
        },
      }),
    ).resolves.toEqual({ loadedPageCount: 1, status: "stale" });
  });

  it("복원이 필요하지 않은 진입 모드는 page를 요청하지 않는다", async () => {
    const loadOlder = vi.fn<() => Promise<ChatRoomEntryHistoryPageState>>();

    await expect(
      searchChatRoomEntryHistory({
        entryPosition: {
          entryReadThroughSequence: 120,
          generation: 7,
          messageVisibleAfterSequence: 0,
          mode: "latest",
          roomId: "room-01",
          storedLastReadSequence: 120,
        },
        initialHistory: createHistory([120], false),
        loadOlder,
      }),
    ).resolves.toEqual({ loadedPageCount: 0, status: "not-required" });
    expect(loadOlder).not.toHaveBeenCalled();
  });

  it("자동 page 한도는 0 이상의 안전한 정수만 허용한다", async () => {
    await expect(
      searchChatRoomEntryHistory({
        entryPosition: RESTORE_POSITION,
        initialHistory: createHistory([200], true),
        loadOlder: vi.fn(),
        maxAutomaticPages: -1,
      }),
    ).rejects.toThrowError(RangeError);
  });
});

function createHistory(
  sequences: readonly number[],
  hasOlderMessages: boolean,
): ChatRoomEntryHistoryPageState {
  return {
    hasOlderMessages,
    messages: sequences.map(createMessage),
  };
}

function createMessage(roomSequence: number): ChatMessage {
  return {
    clientMessageId: `550e8400-e29b-41d4-a716-${String(roomSequence).padStart(12, "0")}`,
    content: `메시지 ${roomSequence}`,
    countable: true,
    createdAt: "2026-08-10T03:00:00Z",
    deletedAt: null,
    messageId: `message-${roomSequence}`,
    messageVersion: 1,
    roomId: "room-01",
    roomSequence,
    senderMembershipId: "membership-a",
    state: "ACTIVE",
    updatedAt: "2026-08-10T03:00:00Z",
  };
}
