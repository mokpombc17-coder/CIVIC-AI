import { describe, expect, it } from "vitest";
import { flattenCompletedTaskPages, getPredictionPollingInterval } from "./vote-queries";

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
});
