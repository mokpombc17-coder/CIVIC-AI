import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatRoomReadStateProvider,
  useChatRoomReadStateCoordinator,
} from "./chat-room-read-state-provider";
import { useChatRoomReadState } from "./use-chat-room-read-state";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
}));

vi.mock("@/lib/chat/chat-room-mutations", () => ({
  useUpdateRoomReadStateMutation: () => ({ mutateAsync: mocks.mutateAsync }),
}));

describe("ChatRoomReadStateProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.mutateAsync.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("화면 consumer가 사라진 뒤에도 provider coordinator가 예약한 sequence를 제출한다", async () => {
    mocks.mutateAsync.mockResolvedValue({
      readThroughSequence: 13,
      roomId: "room-1",
      updated: true,
    });
    const captured: {
      scheduleReadState?: (throughSequence: number) => void;
    } = {};

    function Probe() {
      captured.scheduleReadState = useChatRoomReadState("room-1");
      return null;
    }

    renderToStaticMarkup(
      <ChatRoomReadStateProvider>
        <Probe />
      </ChatRoomReadStateProvider>,
    );

    const scheduleReadState = captured.scheduleReadState;

    if (!scheduleReadState) {
      throw new Error("테스트 Probe가 read-state callback을 제공하지 않았습니다.");
    }

    scheduleReadState(10);
    scheduleReadState(13);
    scheduleReadState(12);
    await vi.advanceTimersByTimeAsync(400);

    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      request: { throughSequence: 13 },
      roomId: "room-1",
    });
  });

  it("provider 밖에서 coordinator를 요청하면 조립 오류를 알린다", () => {
    function Probe() {
      useChatRoomReadStateCoordinator();
      return null;
    }

    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      "채팅방 읽음 상태 훅은 ChatRoomReadStateProvider 안에서 사용해야 합니다.",
    );
  });
});
