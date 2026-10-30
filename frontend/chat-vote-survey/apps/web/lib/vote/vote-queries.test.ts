import { describe, expect, it } from "vitest";
import { VoteApiError } from "./vote-fetch";
import {
  flattenCompletedTaskPages,
  getOpenTasksPollingInterval,
  getPredictionPollingInterval,
} from "./vote-queries";

describe("Vote query policies", () => {
  it("완료 pagination에서 taskId 중복을 제거한다", () => {
    expect(
      flattenCompletedTaskPages([
        {
          items: [
            { taskId: "a", title: "A" },
            { taskId: "b", title: "B" },
          ],
        },
        {
          items: [
            { taskId: "b", title: "B2" },
            { taskId: "c", title: "C" },
          ],
        },
      ]).map((item) => item.title),
    ).toEqual(["A", "B", "C"]);
  });

  it("waiting과 PERSONA_NOT_READY만 visible 화면에서 bounded polling한다", () => {
    const base = { waiting: true, state: "PENDING" } satisfies NonNullable<
      Parameters<typeof getPredictionPollingInterval>[0]
    >;
    expect(getPredictionPollingInterval(base, 1, true)).toBe(1_000);
    expect(getPredictionPollingInterval(base, 2, true)).toBe(2_000);
    expect(getPredictionPollingInterval(base, 9, true)).toBe(5_000);
    expect(getPredictionPollingInterval(base, 9, false)).toBe(false);
    expect(getPredictionPollingInterval({ ...base, state: "REMOTE_PROCESSING" }, 9, true)).toBe(
      5_000,
    );
    expect(
      getPredictionPollingInterval({ ...base, waiting: false, state: "SUCCEEDED" }, 9, true),
    ).toBe(false);
    expect(
      getPredictionPollingInterval(
        { ...base, waiting: false, state: "PERSONA_NOT_READY" },
        9,
        true,
      ),
    ).toBe(5_000);
  });

  it("진행 중 목록은 1분마다 조회하고 가장 가까운 마감이 먼저 오면 마감 직후에 조회한다", () => {
    const now = Date.parse("2026-10-27T00:00:00Z");

    expect(getOpenTasksPollingInterval([], null, now)).toBe(60_000);
    expect(getOpenTasksPollingInterval(undefined, null, now)).toBe(60_000);
    expect(
      getOpenTasksPollingInterval(
        [{ closesAt: "2026-10-27T00:10:00Z" }, { closesAt: "2026-10-27T00:00:20Z" }],
        null,
        now,
      ),
    ).toBe(22_000);
  });

  it("이미 지난 마감은 기다리지 않아 서버가 마감을 늦게 반영해도 조회를 반복하지 않는다", () => {
    const now = Date.parse("2026-10-27T00:00:05Z");

    expect(getOpenTasksPollingInterval([{ closesAt: "2026-10-27T00:00:00Z" }], null, now)).toBe(
      60_000,
    );
  });

  it("조회가 실패하면 간격을 늘리고 로그인이나 권한이 필요하면 멈춘다", () => {
    const now = Date.parse("2026-10-27T00:00:00Z");
    const createError = (status: number) =>
      new VoteApiError(status, "", "/api/v1/tasks/open", undefined);

    expect(getOpenTasksPollingInterval([], createError(500), now)).toBe(300_000);
    expect(getOpenTasksPollingInterval([], new TypeError("Failed to fetch"), now)).toBe(300_000);
    expect(getOpenTasksPollingInterval([], createError(401), now)).toBe(false);
    expect(getOpenTasksPollingInterval([], createError(403), now)).toBe(false);
  });
});
