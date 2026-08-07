import { describe, expect, it, vi } from "vitest";
import { copyChatMessageContent } from "./chat-message-copy";

describe("copyChatMessageContent", () => {
  it("메시지의 공백과 줄바꿈을 유지해 클립보드에 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await copyChatMessageContent("첫 줄\n  둘째 줄", { writeText });

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith("첫 줄\n  둘째 줄");
  });

  it("Clipboard API를 사용할 수 없으면 명시적인 오류를 반환한다", async () => {
    await expect(copyChatMessageContent("메시지", undefined)).rejects.toThrow(
      "이 브라우저에서는 메시지 복사를 사용할 수 없습니다.",
    );
  });

  it("클립보드 쓰기 실패를 호출자에게 전달한다", async () => {
    const error = new DOMException("permission denied", "NotAllowedError");

    await expect(
      copyChatMessageContent("메시지", {
        writeText: vi.fn().mockRejectedValue(error),
      }),
    ).rejects.toBe(error);
  });
});
