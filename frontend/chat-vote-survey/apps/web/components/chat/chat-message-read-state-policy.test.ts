import { describe, expect, it } from "vitest";
import {
  canReportChatMessageReadState,
  type ChatMessageReadStatePolicyInput,
} from "./chat-message-read-state-policy";

const READY_INPUT: ChatMessageReadStatePolicyInput = {
  documentHasFocus: true,
  documentVisibilityState: "visible",
  readStateEnabled: true,
  readStatePaused: false,
  viewportPhase: "settled",
};

describe("canReportChatMessageReadState", () => {
  it("focused·visible 상태에서 위치가 확정됐을 때 보고한다", () => {
    expect(canReportChatMessageReadState(READY_INPUT)).toBe(true);
  });

  it.each([
    ["기능 비활성화", { readStateEnabled: false }],
    ["overlay로 일시 중지", { readStatePaused: true }],
    ["문서가 hidden", { documentVisibilityState: "hidden" as const }],
    ["창 focus 없음", { documentHasFocus: false }],
    ["위치를 잡는 중", { viewportPhase: "positioning" as const }],
  ])("%s이면 보고하지 않는다", (_case, patch) => {
    expect(
      canReportChatMessageReadState({
        ...READY_INPUT,
        ...patch,
      }),
    ).toBe(false);
  });
});
