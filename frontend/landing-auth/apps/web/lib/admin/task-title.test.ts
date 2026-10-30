import { describe, expect, it } from "vitest";
import {
  TASK_TITLE_MAX_LENGTH,
  taskTitleMobileWarning,
  taskTitleTooLongMessage,
} from "./task-title";

describe("투표 제목 길이", () => {
  it("공백 포함 20자까지 허용하고 넘으면 오류를 돌려준다", () => {
    expect(TASK_TITLE_MAX_LENGTH).toBe(20);
    expect(taskTitleTooLongMessage("가 나 다 라 마 바 사 아 자 차 ")).toBeNull();
    expect(taskTitleTooLongMessage("가".repeat(20))).toBeNull();
    expect(taskTitleTooLongMessage("가".repeat(21))).toBe(
      "투표 제목은 공백 포함 20자 이내로 입력해 주세요.",
    );
  });

  it("16자까지는 경고하지 않고 17자부터 모바일 잘림을 경고한다", () => {
    expect(taskTitleMobileWarning("가".repeat(16))).toBeNull();
    expect(taskTitleMobileWarning("가 나 다 라 마 바 사 아 ")).toBeNull();
    expect(taskTitleMobileWarning("가".repeat(17))).toBe(
      "제목이 16자를 넘으면 모바일에서 잘려 보일 수 있습니다. (현재 17/20자)",
    );
  });

  it("앞뒤 공백은 저장되지 않으므로 길이에 세지 않는다", () => {
    expect(taskTitleMobileWarning(`  ${"가".repeat(16)}  `)).toBeNull();
  });
});
