import { describe, expect, it } from "vitest";
import {
  isParticipantSwipeNavigation,
  normalizeParticipantLandingRoute,
  participantSwipeDestination,
  participantSwipeDirectionSlop,
  participantSwipeVisualOffset,
} from "@/lib/participant-swipe-navigation";

describe("participant bottom navigation swipe", () => {
  it("12px 이동 이후에 swipe 방향 판정을 시작한다", () => {
    expect(participantSwipeDirectionSlop).toBe(12);
  });

  it("활성화 대상을 하단 메뉴의 정확한 landing route로 제한한다", () => {
    expect(normalizeParticipantLandingRoute("/home")).toBe("/home");
    expect(normalizeParticipantLandingRoute("/account")).toBe("/mypage");
    expect(normalizeParticipantLandingRoute("/rag/documents")).toBeNull();
    expect(normalizeParticipantLandingRoute("/login")).toBeNull();
  });

  it("하단 메뉴 순서에 따라 인접 route만 선택하고 양 끝을 넘지 않는다", () => {
    expect(participantSwipeDestination("/rag", -100)).toBe("/chat");
    expect(participantSwipeDestination("/rag", 100)).toBe("/home");
    expect(participantSwipeDestination("/home", 100)).toBeNull();
    expect(participantSwipeDestination("/mypage", -100)).toBeNull();
  });

  it("손가락 이동에 저항을 적용하고 화면 이동을 40px로 제한한다", () => {
    expect(participantSwipeVisualOffset(80)).toBe(28);
    expect(participantSwipeVisualOffset(-80)).toBe(-28);
    expect(participantSwipeVisualOffset(200)).toBe(40);
    expect(participantSwipeVisualOffset(-200)).toBe(-40);
  });

  it("충분한 거리 또는 짧고 빠른 gesture만 navigation으로 판정한다", () => {
    expect(isParticipantSwipeNavigation(80, 0)).toBe(true);
    expect(isParticipantSwipeNavigation(40, 0.5)).toBe(true);
    expect(isParticipantSwipeNavigation(40, 0.49)).toBe(false);
    expect(isParticipantSwipeNavigation(39, 1)).toBe(false);
  });
});
