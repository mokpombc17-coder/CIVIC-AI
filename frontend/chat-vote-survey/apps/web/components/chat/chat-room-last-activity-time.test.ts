import { describe, expect, it } from "vitest";
import { formatRoomInboxActivityTime } from "./chat-room-last-activity-time";

describe("Room inbox last activity time", () => {
  it("Asia/Seoul 기준 오늘은 오전/오후 시각으로 표시한다", () => {
    expect(
      formatRoomInboxActivityTime("2026-08-05T08:30:00Z", new Date("2026-08-05T12:00:00Z")),
    ).toBe("오후 5:30");
  });

  it("Asia/Seoul calendar 기준 어제를 표시한다", () => {
    expect(
      formatRoomInboxActivityTime("2026-08-04T14:59:59Z", new Date("2026-08-04T15:00:01Z")),
    ).toBe("어제");
  });

  it("같은 연도의 이전 날짜는 월과 일로 표시한다", () => {
    expect(
      formatRoomInboxActivityTime("2026-07-31T15:00:00Z", new Date("2026-08-05T00:00:00Z")),
    ).toBe("8월 1일");
  });

  it("월 경계를 넘은 어제도 calendar date로 판정한다", () => {
    expect(
      formatRoomInboxActivityTime("2026-07-31T14:59:59Z", new Date("2026-07-31T15:00:01Z")),
    ).toBe("어제");
  });

  it("다른 연도는 연월일을 표시한다", () => {
    expect(
      formatRoomInboxActivityTime("2025-12-31T14:59:59Z", new Date("2026-01-02T00:00:00Z")),
    ).toBe("2025. 12. 31.");
  });

  it("KST 자정 직전과 직후를 서로 다른 날짜로 판정한다", () => {
    const now = new Date("2026-08-05T15:00:01Z");
    expect(formatRoomInboxActivityTime("2026-08-05T14:59:59Z", now)).toBe("어제");
    expect(formatRoomInboxActivityTime("2026-08-05T15:00:00Z", now)).toBe("오전 12:00");
  });
});
