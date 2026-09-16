import { describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_USER_ID_STORAGE_KEY,
  sendGoogleAnalyticsEvent,
  type GoogleAnalyticsTarget,
} from "./google-analytics";

const USER_ID = "8c90ae1f-5b2d-435a-91fa-074ebe3e1d7c";

describe("sendGoogleAnalyticsEvent", () => {
  it("저장된 사용자 UUID를 User-ID와 이벤트 파라미터로 함께 전달한다", () => {
    const getItem = vi.fn().mockReturnValue(USER_ID);
    const gtag = vi.fn();

    expect(
      sendGoogleAnalyticsEvent({ gtag, sessionStorage: { getItem } }, "vote_step_view", {
        step: 1,
        task_id: "task-1",
        visit_id: "visit-1",
      }),
    ).toBe(true);
    expect(getItem).toHaveBeenCalledWith(ANALYTICS_USER_ID_STORAGE_KEY);
    expect(gtag).toHaveBeenCalledWith("event", "vote_step_view", {
      step: 1,
      task_id: "task-1",
      user_id: USER_ID,
      visit_id: "visit-1",
    });
  });

  it("GA가 초기화되기 전이면 식별된 이벤트를 dataLayer에 대기시킨다", () => {
    const target: GoogleAnalyticsTarget = {
      sessionStorage: { getItem: vi.fn().mockReturnValue(USER_ID) },
    };

    expect(
      sendGoogleAnalyticsEvent(target, "vote_participation_ready", {
        task_id: "task-1",
        visit_id: "visit-1",
        wait_duration_ms: 120,
      }),
    ).toBe(true);
    expect(target.dataLayer).toHaveLength(1);
    expect(Array.from(target.dataLayer?.[0] as IArguments)).toEqual([
      "event",
      "vote_participation_ready",
      {
        task_id: "task-1",
        user_id: USER_ID,
        visit_id: "visit-1",
        wait_duration_ms: 120,
      },
    ]);
  });

  it("사용자 UUID가 없거나 유효하지 않으면 이벤트를 전송하지 않는다", () => {
    const gtag = vi.fn();

    expect(
      sendGoogleAnalyticsEvent(
        { gtag, sessionStorage: { getItem: vi.fn().mockReturnValue("user-1") } },
        "vote_step_view",
        { step: 1 },
      ),
    ).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });
});
