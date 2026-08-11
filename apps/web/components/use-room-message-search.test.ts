import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ChatApiError } from "@/lib/chat/chat-fetch";
import {
  createInitialRoomMessageSearchState,
  discardRoomMessageSearchQuery,
  getRoomMessageSearchRateLimitDelay,
  isRoomMessageSearchInvalidCursor,
  reduceRoomMessageSearchState,
  type RoomMessageSearchAction,
  type RoomMessageSearchState,
} from "@/components/use-room-message-search";

describe("Room message search state", () => {
  it("draft는 검색 버튼 제출 전까지 적용하지 않고 제출 시 정규화한다", () => {
    const draft = reduce([{ type: "draft-changed", value: "  Env　POLICY  " }]);

    expect(draft.appliedQuery).toBeUndefined();
    expect(draft.sessionGeneration).toBe(0);

    const submitted = reduce([{ type: "submitted" }], draft);

    expect(submitted.appliedQuery).toBe("env policy");
    expect(submitted.sessionGeneration).toBe(1);
    expect(submitted.validationMessage).toBeUndefined();
  });

  it("같은 검색어를 다시 제출해도 새 고정 검색 session을 시작한다", () => {
    const first = reduce([{ type: "draft-changed", value: "환경 정책" }, { type: "submitted" }]);
    const refreshed = reduce([{ type: "submitted" }], first);

    expect(refreshed.appliedQuery).toBe("환경 정책");
    expect(refreshed.sessionGeneration).toBe(2);
  });

  it("IME 조합 중 제출과 2자 미만 검색어를 차단한다", () => {
    const composing = reduce([
      { type: "draft-changed", value: "환경" },
      { type: "composition-started" },
      { type: "submitted" },
    ]);

    expect(composing.appliedQuery).toBeUndefined();
    expect(composing.isComposing).toBe(true);

    const invalid = reduce(
      [
        { type: "composition-ended" },
        { type: "draft-changed", value: "한" },
        { type: "submitted" },
      ],
      composing,
    );

    expect(invalid.appliedQuery).toBeUndefined();
    expect(invalid.validationMessage).toBeTruthy();
  });

  it("UTF-16 512 code unit를 넘는 원문은 정규화 전에 차단한다", () => {
    const rawQuery = `환경${" ".repeat(511)}`;
    const invalid = reduce([{ type: "draft-changed", value: rawQuery }, { type: "submitted" }]);

    expect(invalid.appliedQuery).toBeUndefined();
    expect(invalid.sessionGeneration).toBe(0);
    expect(invalid.validationMessage).toContain("512");
  });

  it("INVALID_CURSOR는 결과를 버릴 새 session을 한 번만 만든다", () => {
    const searched = reduce([{ type: "draft-changed", value: "환경 정책" }, { type: "submitted" }]);
    const recovered = reduce([{ type: "invalid-cursor-recovered" }], searched);
    const duplicate = reduce([{ type: "invalid-cursor-recovered" }], recovered);

    expect(recovered.invalidCursorRecoveryAttempted).toBe(true);
    expect(recovered.sessionGeneration).toBe(searched.sessionGeneration + 1);
    expect(duplicate).toBe(recovered);
  });

  it("검색 해제와 Room generation 변경은 이전 session 상태를 폐기한다", () => {
    const searched = reduce([
      { type: "draft-changed", value: "환경 정책" },
      { type: "submitted" },
      { type: "rate-limit-scheduled", retryAfterMs: 250 },
    ]);
    const cleared = reduce([{ type: "cleared" }], searched);

    expect(cleared).toMatchObject({
      appliedQuery: undefined,
      draftQuery: "",
      rateLimitRetryAfterMs: undefined,
      roomId: "room-01",
      roomGeneration: 1,
      sessionGeneration: searched.sessionGeneration + 1,
    });

    const changed = reduce(
      [{ type: "room-context-changed", roomId: "room-02", roomGeneration: 7 }],
      searched,
    );

    expect(changed).toEqual(createInitialRoomMessageSearchState("room-02", 7));
  });
});

describe("Room message search error policy", () => {
  it("429의 positive retryAfterMs만 자동 재시도 delay로 사용한다", () => {
    const rateLimited = createChatApiError(429, "MESSAGE_SEARCH_RATE_LIMITED", true, 250);
    const unavailable = createChatApiError(503, "MESSAGE_SEARCH_UNAVAILABLE", true);

    expect(getRoomMessageSearchRateLimitDelay(rateLimited)).toBe(250);
    expect(getRoomMessageSearchRateLimitDelay(unavailable)).toBeUndefined();
  });

  it("INVALID_CURSOR만 cursor session 복구 대상으로 분류한다", () => {
    expect(isRoomMessageSearchInvalidCursor(createChatApiError(400, "INVALID_CURSOR", false))).toBe(
      true,
    );
    expect(
      isRoomMessageSearchInvalidCursor(createChatApiError(400, "INVALID_REQUEST", false)),
    ).toBe(false);
  });

  it("이전 session query를 취소하고 cache에서 제거한다", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const queryKey = ["chat", "rooms", "message-search", "room-01", { sessionGeneration: 1 }];
    let aborted = false;
    const pending = queryClient
      .fetchQuery({
        queryKey,
        queryFn: ({ signal }) =>
          new Promise<string>((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                aborted = true;
                resolve("aborted");
              },
              { once: true },
            );
          }),
      })
      .catch((error: unknown) => error);

    await vi.waitFor(() => expect(queryClient.isFetching({ queryKey, exact: true })).toBe(1));
    await discardRoomMessageSearchQuery(queryClient, queryKey);
    await pending;

    expect(aborted).toBe(true);
    expect(queryClient.getQueryState(queryKey)).toBeUndefined();
  });
});

function reduce(
  actions: readonly RoomMessageSearchAction[],
  initialState: RoomMessageSearchState = createInitialRoomMessageSearchState("room-01", 1),
): RoomMessageSearchState {
  return actions.reduce(reduceRoomMessageSearchState, initialState);
}

function createChatApiError(
  status: number,
  code: string,
  retryable: boolean,
  retryAfterMs?: number,
): ChatApiError {
  return new ChatApiError(
    status,
    "",
    "http://localhost:8082/api/v1/rooms/room-01/messages/search",
    {
      type: `urn:hamcheeze:problem:${code.toLowerCase()}`,
      title: "Message search failed",
      status,
      detail: "Message search failed.",
      instance: "/api/v1/rooms/room-01/messages/search",
      code,
      replayed: false,
      retryable,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    },
  );
}
