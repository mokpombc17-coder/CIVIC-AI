import { describe, expect, it } from "vitest";
import {
  type ChatMessageViewportPositionEvent,
  type ChatMessageViewportPositionState,
  createChatMessageViewportPositionState,
  reduceChatMessageViewportPosition,
  shouldCountUnseenChatMessages,
} from "./chat-message-viewport-position";

describe("chat message viewport position", () => {
  it("목표를 기다리는 상태로 시작한다", () => {
    expect(createChatMessageViewportPositionState()).toEqual({
      intent: null,
      job: null,
      nextJobId: 1,
      pendingFollow: null,
      phase: "waiting",
      pin: "detached",
    });
  });

  describe("목표 확인", () => {
    it("목표가 있으면 초기 이동을 시작한다", () => {
      const state = reduce(waiting(), resolved({ hasTarget: true }));

      expect(state.phase).toBe("positioning");
      expect(state.job).toEqual({ byLatestIntent: false, id: 1, kind: "initial" });
    });

    it("최신 이동 의도가 남아 있으면 진입 목표 대신 최신으로 이동한다", () => {
      const state = reduce(
        { ...waiting(), intent: "latest" },
        resolved({ hasItems: true, hasTarget: true }),
      );

      expect(state.job).toEqual({ byLatestIntent: true, id: 1, kind: "initial" });
    });

    it("이동할 목표가 없으면 현재 위치에서 바로 확정한다", () => {
      expect(reduce(waiting(), resolved({ hasTarget: false, isAtEnd: true }))).toMatchObject({
        job: null,
        phase: "settled",
        pin: "pinned",
      });
      expect(
        reduce(
          { ...waiting(), intent: "latest" },
          resolved({ hasItems: false, hasTarget: false, isAtEnd: false }),
        ),
      ).toMatchObject({ intent: "latest", phase: "settled", pin: "detached" });
    });

    it("목표를 기다리는 중이 아니면 무시한다", () => {
      const state = positioning();

      expect(reduce(state, resolved({ hasTarget: true }))).toBe(state);
    });
  });

  describe("작업 완료", () => {
    it("현재 작업의 완료만 받아 하단 여부로 위치를 확정한다", () => {
      const state = positioning();

      expect(reduce(state, { type: "job-settled", isAtEnd: false, jobId: 99 })).toBe(state);
      expect(reduce(state, { type: "job-settled", isAtEnd: false, jobId: 1 })).toMatchObject({
        job: null,
        phase: "settled",
        pin: "detached",
      });
    });

    it("최신 이동이 끝나면 최신 이동 의도를 해제한다", () => {
      const latest = reduce(settled("detached"), {
        type: "latest-requested",
        navigatesContext: false,
      });
      const byIntent = reduce(
        { ...waiting(), intent: "latest" },
        resolved({ hasItems: true, hasTarget: true }),
      );

      expect(settleJob(latest, true).intent).toBeNull();
      expect(settleJob(byIntent, true).intent).toBeNull();
    });

    it("이동 중 미뤄 둔 추종은 하단에 확정됐을 때만 최신 이동으로 이어간다", () => {
      const state = { ...positioning(), pendingFollow: "if-pinned" as const };

      expect(settleJob(state, true)).toMatchObject({
        job: { id: 2, kind: "latest" },
        pendingFollow: null,
        pin: "pinned",
      });
      expect(settleJob(state, false)).toMatchObject({
        job: null,
        pendingFollow: null,
        pin: "detached",
      });
    });

    it("내 메시지로 미뤄 둔 추종은 위치와 관계없이 최신으로 이동한다", () => {
      const state = { ...positioning(), pendingFollow: "always" as const };

      expect(settleJob(state, false)).toMatchObject({
        job: { id: 2, kind: "latest" },
        pin: "pinned",
      });
    });
  });

  describe("사용자 스크롤", () => {
    it("진행 중인 이동과 미뤄 둔 추종을 취소하고 사용자 위치로 확정한다", () => {
      const state = { ...positioning(), pendingFollow: "always" as const };

      expect(reduce(state, { type: "user-scrolled", isAtEnd: false })).toMatchObject({
        job: null,
        pendingFollow: null,
        phase: "settled",
        pin: "detached",
      });
    });

    it("최신 이동을 취소하면 최신 이동 의도도 해제한다", () => {
      const state = reduce(settled("detached"), {
        type: "latest-requested",
        navigatesContext: false,
      });

      expect(reduce(state, { type: "user-scrolled", isAtEnd: false }).intent).toBeNull();
    });

    it("목표를 기다리는 중의 입력은 무시한다", () => {
      const state = waiting();

      expect(reduce(state, { type: "user-scrolled", isAtEnd: false })).toBe(state);
    });
  });

  describe("scroll 관찰", () => {
    it("확정 전이나 작업 중의 scroll은 위치에 반영하지 않는다", () => {
      const resizing = reduce(settled("pinned"), { type: "viewport-resized" });

      for (const state of [waiting(), positioning(), resizing]) {
        expect(reduce(state, { type: "scroll-observed", isAtEnd: false })).toBe(state);
      }
    });

    it("작업 없이 확정된 상태에서는 하단 여부로 위치를 갱신한다", () => {
      const state = settled("pinned");

      expect(reduce(state, { type: "scroll-observed", isAtEnd: true })).toBe(state);
      expect(reduce(state, { type: "scroll-observed", isAtEnd: false }).pin).toBe("detached");
    });
  });

  describe("새 항목 추가", () => {
    it("하단에 고정된 상태면 새 메시지와 시스템 활동을 따라간다", () => {
      expect(reduce(settled("pinned"), appended()).job).toEqual({ id: 2, kind: "latest" });
      expect(
        reduce(settled("pinned"), appended({ hasMessages: false, hasSystemActivity: true })).job,
      ).toEqual({ id: 2, kind: "latest" });
    });

    it("하단을 벗어난 상태면 다른 사용자 메시지를 따라가지 않는다", () => {
      const state = settled("detached");

      expect(reduce(state, appended())).toBe(state);
      expect(reduce(state, appended({ hasMessages: false, hasSystemActivity: true }))).toBe(state);
    });

    it("내 메시지는 하단을 벗어난 상태에서도 최신으로 이동한다", () => {
      expect(reduce(settled("detached"), appended({ source: "current-user" }))).toMatchObject({
        job: { id: 2, kind: "latest" },
        pin: "pinned",
      });
    });

    it("최신 이동 중 추종 대상이 붙으면 최신 이동을 다시 시작한다", () => {
      const state = reduce(settled("pinned"), appended());

      expect(reduce(state, appended()).job).toEqual({ id: 3, kind: "latest" });
    });

    it("다른 작업 중에는 따라가지 않고 이동이 끝난 뒤 판단하도록 미룬다", () => {
      const anchoring = reduce(settled("detached"), { type: "older-anchor-rendered" });

      expect(reduce(positioning(), appended())).toMatchObject({
        job: { id: 1, kind: "initial" },
        pendingFollow: "if-pinned",
      });
      expect(reduce(anchoring, appended({ source: "current-user" })).pendingFollow).toBe("always");
      expect(reduce({ ...anchoring, pendingFollow: "always" }, appended()).pendingFollow).toBe(
        "always",
      );
    });

    it("목표를 기다리는 중이거나 추가 항목이 없으면 무시한다", () => {
      const state = settled("pinned");

      expect(reduce(waiting(), appended())).toEqual(waiting());
      expect(reduce(state, appended({ hasMessages: false, hasSystemActivity: false }))).toBe(state);
    });
  });

  describe("최신 이동 요청", () => {
    it("다른 문맥으로 이동하거나 목표를 기다리는 중이면 의도만 남긴다", () => {
      expect(
        reduce(settled("detached"), { type: "latest-requested", navigatesContext: true }),
      ).toMatchObject({ intent: "latest", job: null, pin: "detached" });
      expect(
        reduce(waiting(), { type: "latest-requested", navigatesContext: false }),
      ).toMatchObject({ intent: "latest", job: null, phase: "waiting" });
    });

    it("초기 이동 중이면 초기 이동을 최신 목표로 바꾼다", () => {
      expect(
        reduce(positioning(), { type: "latest-requested", navigatesContext: false }).job,
      ).toEqual({ byLatestIntent: true, id: 2, kind: "initial" });
    });

    it("확정된 상태면 하단에 고정하고 최신 이동을 시작한다", () => {
      expect(
        reduce(
          { ...settled("detached"), pendingFollow: "if-pinned" },
          { type: "latest-requested", navigatesContext: false },
        ),
      ).toMatchObject({
        intent: "latest",
        job: { id: 2, kind: "latest" },
        pendingFollow: null,
        pin: "pinned",
      });
    });
  });

  describe("과거 이력 anchor", () => {
    it("확정된 상태에서 anchor 복원을 시작한다", () => {
      expect(reduce(settled("detached"), { type: "older-anchor-rendered" }).job).toEqual({
        id: 2,
        kind: "anchor",
      });
    });

    it("확정 전이거나 최신 이동 중이면 복원하지 않는다", () => {
      const latest = reduce(settled("pinned"), appended());

      for (const state of [waiting(), positioning(), latest]) {
        expect(reduce(state, { type: "older-anchor-rendered" })).toBe(state);
      }
    });
  });

  describe("viewport 크기 변경", () => {
    it("작업 없이 하단에 고정된 상태에서만 하단 보정을 시작한다", () => {
      const detached = settled("detached");

      expect(reduce(settled("pinned"), { type: "viewport-resized" }).job).toEqual({
        id: 2,
        kind: "resize",
      });
      expect(reduce(detached, { type: "viewport-resized" })).toBe(detached);
      expect(reduce(waiting(), { type: "viewport-resized" })).toEqual(waiting());
    });

    it("초기 이동 중이면 이동을 유지하고 완료 후 판단하도록 미룬다", () => {
      expect(reduce(positioning(), { type: "viewport-resized" })).toMatchObject({
        job: { id: 1, kind: "initial" },
        pendingFollow: "if-pinned",
      });
    });

    it("최신 이동과 하단 보정은 다시 시작하고 anchor 복원은 유지한다", () => {
      const latest = reduce(settled("pinned"), appended());
      const resizing = reduce(settled("pinned"), { type: "viewport-resized" });
      const anchoring = reduce(settled("detached"), { type: "older-anchor-rendered" });

      expect(reduce(latest, { type: "viewport-resized" }).job).toEqual({ id: 3, kind: "latest" });
      expect(reduce(resizing, { type: "viewport-resized" }).job).toEqual({ id: 3, kind: "resize" });
      expect(reduce(anchoring, { type: "viewport-resized" })).toBe(anchoring);
    });
  });

  describe("문맥 변경", () => {
    it("다른 문맥이면 작업을 취소하고 목표를 기다리며 최신 이동 의도는 유지한다", () => {
      const state = {
        ...reduce(settled("pinned"), { type: "latest-requested", navigatesContext: false }),
        pendingFollow: "always" as const,
      };

      expect(reduce(state, { type: "viewport-changed", continuityChanged: true })).toMatchObject({
        intent: "latest",
        job: null,
        pendingFollow: null,
        phase: "waiting",
      });
    });

    it("같은 문맥에서 확정된 상태면 위치를 유지하고 작업만 취소한다", () => {
      const state = reduce(settled("pinned"), { type: "viewport-resized" });

      expect(reduce(state, { type: "viewport-changed", continuityChanged: false })).toMatchObject({
        job: null,
        phase: "settled",
        pin: "pinned",
      });
    });

    it("같은 문맥으로 돌아오면서 최신 이동 의도가 있으면 최신 이동을 시작한다", () => {
      expect(
        reduce(
          { ...settled("detached"), intent: "latest" },
          { type: "viewport-changed", continuityChanged: false },
        ).job,
      ).toEqual({ id: 2, kind: "latest" });
    });

    it("같은 문맥이어도 위치가 확정되기 전이면 다시 목표를 기다린다", () => {
      expect(
        reduce(positioning(), { type: "viewport-changed", continuityChanged: false }),
      ).toMatchObject({ job: null, phase: "waiting" });
    });
  });

  describe("새 메시지 개수", () => {
    it("바로 따라가지 않는 다른 사용자 메시지만 센다", () => {
      expect(shouldCountUnseenChatMessages(settled("detached"), appended())).toBe(true);
      expect(shouldCountUnseenChatMessages(positioning(), appended())).toBe(true);
      expect(shouldCountUnseenChatMessages(settled("pinned"), appended())).toBe(false);
      expect(
        shouldCountUnseenChatMessages(settled("detached"), appended({ source: "current-user" })),
      ).toBe(false);
      expect(
        shouldCountUnseenChatMessages(
          settled("detached"),
          appended({ hasMessages: false, hasSystemActivity: true }),
        ),
      ).toBe(false);
      expect(shouldCountUnseenChatMessages(waiting(), appended())).toBe(false);
    });
  });
});

function reduce(
  state: ChatMessageViewportPositionState,
  event: ChatMessageViewportPositionEvent,
): ChatMessageViewportPositionState {
  return reduceChatMessageViewportPosition(state, event);
}

function waiting(): ChatMessageViewportPositionState {
  return createChatMessageViewportPositionState();
}

function positioning(): ChatMessageViewportPositionState {
  return reduce(waiting(), resolved({ hasTarget: true }));
}

function settled(pin: "pinned" | "detached"): ChatMessageViewportPositionState {
  return settleJob(positioning(), pin === "pinned");
}

function settleJob(
  state: ChatMessageViewportPositionState,
  isAtEnd: boolean,
): ChatMessageViewportPositionState {
  if (state.job === null) {
    throw new Error("완료할 작업이 없습니다.");
  }

  return reduce(state, { type: "job-settled", isAtEnd, jobId: state.job.id });
}

function resolved({
  hasItems = true,
  hasTarget = true,
  isAtEnd = false,
}: {
  hasItems?: boolean;
  hasTarget?: boolean;
  isAtEnd?: boolean;
}): ChatMessageViewportPositionEvent {
  return { type: "target-resolved", hasItems, hasTarget, isAtEnd };
}

function appended({
  hasMessages = true,
  hasSystemActivity = false,
  source = "realtime",
}: {
  hasMessages?: boolean;
  hasSystemActivity?: boolean;
  source?: "current-user" | "realtime";
} = {}): Extract<ChatMessageViewportPositionEvent, { type: "messages-appended" }> {
  return { type: "messages-appended", hasMessages, hasSystemActivity, source };
}
