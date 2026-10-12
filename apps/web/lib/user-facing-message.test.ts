import { describe, expect, it } from "vitest";
import { errorMessage, koreanMessage, statusMessage } from "./user-facing-message";

describe("user-facing messages", () => {
  it("keeps Korean text and replaces English or missing text with the fallback", () => {
    expect(koreanMessage("인증번호를 확인해 주세요.", "대체")).toBe("인증번호를 확인해 주세요.");
    expect(koreanMessage("Authentication code is invalid", "대체")).toBe("대체");
    expect(koreanMessage(undefined, "대체")).toBe("대체");
  });

  it("hides English error messages such as network failures", () => {
    expect(errorMessage(new TypeError("Failed to fetch"), "불러오지 못했습니다.")).toBe(
      "불러오지 못했습니다.",
    );
    expect(errorMessage(new Error("목록을 불러오지 못했습니다."), "대체")).toBe(
      "목록을 불러오지 못했습니다.",
    );
    expect(errorMessage("not an error", "대체")).toBe("대체");
  });

  it.each([
    [400, "입력한 내용을 다시 확인해 주세요."],
    [422, "입력한 내용을 다시 확인해 주세요."],
    [404, "요청한 정보를 찾을 수 없습니다."],
    [409, "다른 변경과 충돌했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요."],
    [503, "서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요."],
    [418, "요청을 처리하지 못했습니다."],
  ])("describes HTTP %i in Korean", (status, message) => {
    expect(statusMessage(status)).toBe(message);
  });
});
