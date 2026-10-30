import { describe, expect, it } from "vitest";
import {
  classifyParticipantSwipe,
  getParticipantSwipeVisualOffset,
  isParticipantSwipeNavigationPath,
  isParticipantSwipePointerSupported,
  resolveParticipantSwipeDestination,
  shouldBlockParticipantSwipe,
  shouldCommitParticipantSwipe,
} from "./participant-swipe-navigation";

describe("participant swipe navigation", () => {
  it("chat과 vote의 모든 하위 경로를 같은 도메인 위치로 취급한다", () => {
    expect(isParticipantSwipeNavigationPath("/chat")).toBe(true);
    expect(isParticipantSwipeNavigationPath("/chat/room-1")).toBe(true);
    expect(isParticipantSwipeNavigationPath("/vote/tasks/1/results")).toBe(true);
    expect(isParticipantSwipeNavigationPath("/survey")).toBe(false);
    expect(isParticipantSwipeNavigationPath("/chatting")).toBe(false);
  });

  it("touch와 pen 입력만 swipe 대상으로 허용한다", () => {
    expect(isParticipantSwipePointerSupported("touch")).toBe(true);
    expect(isParticipantSwipePointerSupported("pen")).toBe(true);
    expect(isParticipantSwipePointerSupported("mouse")).toBe(false);
    expect(isParticipantSwipePointerSupported("")).toBe(false);
  });

  it("bottom navigation 순서에 맞는 인접 도메인을 반환한다", () => {
    expect(resolveParticipantSwipeDestination("/chat/room-1", "right")).toBe("/rag");
    expect(resolveParticipantSwipeDestination("/chat/room-1", "left")).toBe("/vote");
    expect(resolveParticipantSwipeDestination("/vote/tasks/1", "right")).toBe("/chat");
    expect(resolveParticipantSwipeDestination("/vote/tasks/1", "left")).toBe("/mypage");
    expect(resolveParticipantSwipeDestination("/home", "left")).toBeNull();
  });

  it("12px 이후 가로 우세 제스처만 horizontal로 확정한다", () => {
    expect(classifyParticipantSwipe(11, 0)).toBe("pending");
    expect(classifyParticipantSwipe(18, 12)).toBe("pending");
    expect(classifyParticipantSwipe(19, 12)).toBe("horizontal");
    expect(classifyParticipantSwipe(8, 14)).toBe("vertical");
  });

  it("80px 이동 또는 같은 방향의 40px 빠른 이동을 성공 처리한다", () => {
    expect(shouldCommitParticipantSwipe(80, 0)).toBe(true);
    expect(shouldCommitParticipantSwipe(-80, 0)).toBe(true);
    expect(shouldCommitParticipantSwipe(40, 0.5)).toBe(true);
    expect(shouldCommitParticipantSwipe(-40, -0.5)).toBe(true);
    expect(shouldCommitParticipantSwipe(40, -0.5)).toBe(false);
    expect(shouldCommitParticipantSwipe(39, 1)).toBe(false);
  });

  it("28px까지 기존 resistance를 유지하고 이후 40px soft cap에 점근한다", () => {
    expect(getParticipantSwipeVisualOffset(40)).toBe(14);
    expect(getParticipantSwipeVisualOffset(80)).toBe(28);

    const softenedOffset = getParticipantSwipeVisualOffset(100);
    const distantOffset = getParticipantSwipeVisualOffset(200);

    expect(softenedOffset).toBeGreaterThan(28);
    expect(softenedOffset).toBeLessThan(35);
    expect(distantOffset).toBeGreaterThan(softenedOffset);
    expect(distantOffset).toBeLessThan(40);
    expect(getParticipantSwipeVisualOffset(-200)).toBeCloseTo(-distantOffset);
    expect(getParticipantSwipeVisualOffset(10_000)).toBeCloseTo(40);
  });

  it("inert content나 blocking overlay가 있으면 swipe를 차단한다", () => {
    expect(shouldBlockParticipantSwipe(true, false)).toBe(true);
    expect(shouldBlockParticipantSwipe(false, true)).toBe(true);
    expect(shouldBlockParticipantSwipe(true, true)).toBe(true);
    expect(shouldBlockParticipantSwipe(false, false)).toBe(false);
  });
});
