import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatRoomReadStateProvider,
  useChatRoomReadStateCoordinator,
} from "./chat-room-read-state-provider";
import { useChatRoomReadState } from "./use-chat-room-read-state";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(() => Promise.resolve()),
  mutateAsync: vi.fn(),
  transport: {
    confirmRoomReadState: vi.fn(),
    getSnapshot: vi.fn(() => ({ error: null, status: "connected" as const })),
    observe: vi.fn(() => () => undefined),
  },
}));

const membershipLifecycle = Object.freeze({
  membershipVersion: 1,
  messageVisibleAfterSequence: 0,
  userId: "user-1",
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  };
});

vi.mock("@/components/chat-realtime-provider", () => ({
  useChatRealtimeTransport: () => mocks.transport,
}));

vi.mock("@/lib/chat/chat-room-mutations", () => ({
  useUpdateRoomReadStateMutation: () => ({ mutateAsync: mocks.mutateAsync }),
}));

describe("ChatRoomReadStateProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.invalidateQueries.mockClear();
    mocks.mutateAsync.mockReset();
    mocks.transport.confirmRoomReadState.mockClear();
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
      synchronizeMembershipLifecycle?: () => void;
    } = {};

    function Probe() {
      const coordinator = useChatRoomReadStateCoordinator();
      captured.synchronizeMembershipLifecycle = () =>
        coordinator.synchronizeRoomMembershipLifecycle("room-1", membershipLifecycle);
      captured.scheduleReadState = useChatRoomReadState("room-1", {
        activeGeneration: 1,
        membershipLifecycle,
        terminalReason: null,
      });
      return null;
    }

    renderToStaticMarkup(
      <ChatRoomReadStateProvider>
        <Probe />
      </ChatRoomReadStateProvider>,
    );

    const scheduleReadState = captured.scheduleReadState;

    if (!scheduleReadState || !captured.synchronizeMembershipLifecycle) {
      throw new Error("테스트 Probe가 read-state callback을 제공하지 않았습니다.");
    }

    captured.synchronizeMembershipLifecycle();
    scheduleReadState(10);
    scheduleReadState(13);
    scheduleReadState(12);
    await vi.advanceTimersByTimeAsync(400);

    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      request: { throughSequence: 13 },
      roomId: "room-1",
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["chat", "rooms", "room-inbox"],
    });
    expect(mocks.transport.confirmRoomReadState).toHaveBeenCalledWith("room-1", 13);
  });

  it("updated=false도 서버의 effective sequence까지 정상 확인한다", async () => {
    mocks.mutateAsync.mockResolvedValue({
      readThroughSequence: 130,
      roomId: "room-1",
      updated: false,
    });
    let scheduleReadState: ((throughSequence: number) => void) | undefined;
    let synchronizeMembershipLifecycle: (() => void) | undefined;

    function Probe() {
      const coordinator = useChatRoomReadStateCoordinator();
      synchronizeMembershipLifecycle = () =>
        coordinator.synchronizeRoomMembershipLifecycle("room-1", membershipLifecycle);
      scheduleReadState = useChatRoomReadState("room-1", {
        activeGeneration: 1,
        membershipLifecycle,
        terminalReason: null,
      });
      return null;
    }

    renderToStaticMarkup(
      <ChatRoomReadStateProvider>
        <Probe />
      </ChatRoomReadStateProvider>,
    );

    if (!scheduleReadState || !synchronizeMembershipLifecycle) {
      throw new Error("테스트 Probe가 read-state callback을 제공하지 않았습니다.");
    }

    synchronizeMembershipLifecycle();
    scheduleReadState(120);
    await vi.advanceTimersByTimeAsync(400);

    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      request: { throughSequence: 120 },
      roomId: "room-1",
    });
    expect(mocks.transport.confirmRoomReadState).toHaveBeenCalledWith("room-1", 130);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["chat", "rooms", "room-inbox"],
    });
  });

  it("로그인 세대 변경 전 요청의 늦은 성공은 현재 cache를 무효화하지 않는다", async () => {
    const submission = createDeferred<{
      readThroughSequence: number;
      roomId: string;
      updated: boolean;
    }>();
    mocks.mutateAsync.mockReturnValue(submission.promise);
    const captured: {
      resetForPrincipalChange?: () => void;
      scheduleReadState?: (throughSequence: number) => void;
      synchronizeMembershipLifecycle?: () => void;
    } = {};

    function Probe() {
      const coordinator = useChatRoomReadStateCoordinator();
      captured.resetForPrincipalChange = () => coordinator.resetForPrincipalChange();
      captured.synchronizeMembershipLifecycle = () =>
        coordinator.synchronizeRoomMembershipLifecycle("room-1", membershipLifecycle);
      captured.scheduleReadState = useChatRoomReadState("room-1", {
        activeGeneration: 1,
        membershipLifecycle,
        terminalReason: null,
      });
      return null;
    }

    renderToStaticMarkup(
      <ChatRoomReadStateProvider>
        <Probe />
      </ChatRoomReadStateProvider>,
    );

    if (
      !captured.scheduleReadState ||
      !captured.resetForPrincipalChange ||
      !captured.synchronizeMembershipLifecycle
    ) {
      throw new Error("테스트 Probe가 read-state coordinator를 제공하지 않았습니다.");
    }

    captured.synchronizeMembershipLifecycle();
    captured.scheduleReadState(13);
    await vi.advanceTimersByTimeAsync(400);
    captured.resetForPrincipalChange();
    submission.resolve({
      readThroughSequence: 13,
      roomId: "room-1",
      updated: true,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it("이전 Membership lifecycle을 캡처한 callback은 새 lifecycle에 예약하지 않는다", async () => {
    mocks.mutateAsync.mockResolvedValue({
      readThroughSequence: 13,
      roomId: "room-1",
      updated: true,
    });
    const previousLifecycle = membershipLifecycle;
    const nextLifecycle = Object.freeze({
      ...membershipLifecycle,
      membershipVersion: 2,
      messageVisibleAfterSequence: 12,
    });
    const captured: {
      coordinator?: ReturnType<typeof useChatRoomReadStateCoordinator>;
      nextSchedule?: (throughSequence: number) => void;
      previousSchedule?: (throughSequence: number) => void;
    } = {};

    function Probe() {
      captured.coordinator = useChatRoomReadStateCoordinator();
      captured.previousSchedule = useChatRoomReadState("room-1", {
        activeGeneration: 1,
        membershipLifecycle: previousLifecycle,
        terminalReason: null,
      });
      captured.nextSchedule = useChatRoomReadState("room-1", {
        activeGeneration: 2,
        membershipLifecycle: nextLifecycle,
        terminalReason: null,
      });
      return null;
    }

    renderToStaticMarkup(
      <ChatRoomReadStateProvider>
        <Probe />
      </ChatRoomReadStateProvider>,
    );

    if (!captured.coordinator || !captured.previousSchedule || !captured.nextSchedule) {
      throw new Error("테스트 Probe가 lifecycle별 read-state callback을 제공하지 않았습니다.");
    }

    captured.coordinator.synchronizeRoomMembershipLifecycle("room-1", nextLifecycle);
    captured.previousSchedule(14);
    captured.nextSchedule(13);
    await vi.advanceTimersByTimeAsync(400);

    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
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

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
