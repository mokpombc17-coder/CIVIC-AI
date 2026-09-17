import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isParticipantSwipeNavigation,
  normalizeParticipantLandingRoute,
  participantSwipeDestination,
  participantSwipeDirectionSlop,
  participantSwipeVisualOffset,
} from "@/lib/participant-swipe-navigation";

const webRoot = join(__dirname, "..");

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

  it("RAG 메시지 스크롤 영역은 세로 스크롤을 유지하며 수평 pointer gesture를 허용한다", () => {
    const wireflowStyles = readFileSync(join(webRoot, "app", "wireflow.css"), "utf8");

    expect(wireflowStyles).toMatch(
      /\[data-wireflow-screen="U-RAG-001"\] \.civic-rag-messages \{[^}]*touch-action: pan-y pinch-zoom;/u,
    );
  });

  it("RAG 안내 배너는 swipe 중 보이는 좌우 경계선을 유지한다", () => {
    const wireflowStyles = readFileSync(join(webRoot, "app", "wireflow.css"), "utf8");

    expect(wireflowStyles).toMatch(
      /\[data-wireflow-screen="U-RAG-001"\] \.civic-rag-session-bar \{[^}]*border-inline: 1px solid #d9e2f2;/u,
    );
  });
});
