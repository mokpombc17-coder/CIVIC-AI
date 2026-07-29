import { describe, expect, it } from "vitest";
import { getChatConnectionPresentation } from "./chat-connection-presentation";
import type { ChatConnectionStatus } from "./chat-realtime-transport";

describe("getChatConnectionPresentation", () => {
  it.each([
    ["idle", "연결 대기", "neutral"],
    ["connecting", "연결 중", "pending"],
    ["connected", "연결됨", "positive"],
    ["reconnecting", "재연결 중", "pending"],
    ["disconnecting", "연결 종료 중", "neutral"],
    ["disconnected", "연결 끊김", "negative"],
    ["replaced", "다른 환경에서 연결됨", "negative"],
    ["error", "연결 오류", "negative"],
  ] satisfies ReadonlyArray<
    readonly [
      status: ChatConnectionStatus,
      label: string,
      tone: "neutral" | "pending" | "positive" | "negative",
    ]
  >)("%s 상태를 사용자 표시 정보로 변환한다", (status, label, tone) => {
    expect(getChatConnectionPresentation(status)).toMatchObject({
      label,
      tone,
    });
  });

  it.each(["disconnected", "error"] satisfies readonly ChatConnectionStatus[])(
    "%s 상태에서는 수동 재연결을 허용한다",
    (status) => {
      expect(getChatConnectionPresentation(status).canReconnect).toBe(true);
    },
  );

  it("다른 환경에서 교체된 연결은 수동 재연결도 노출하지 않는다", () => {
    expect(getChatConnectionPresentation("replaced").canReconnect).toBe(false);
  });
});
