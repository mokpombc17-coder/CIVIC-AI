import { describe, expect, it } from "vitest";
import {
  canReportChatMessageReadState,
  type ChatMessageReadStatePolicyInput,
} from "./chat-message-read-state-policy";

const READY_INPUT: ChatMessageReadStatePolicyInput = {
  documentHasFocus: true,
  documentVisibilityState: "visible",
  isLatestSequenceVisible: true,
  readStateEnabled: true,
  readStatePaused: false,
  viewportPhase: "settled",
  viewportPin: "pinned",
};

describe("canReportChatMessageReadState", () => {
  it("focused·visible 상태에서 하단에 위치가 확정되고 최신 sequence가 보일 때만 보고한다", () => {
    expect(canReportChatMessageReadState(READY_INPUT)).toBe(true);
  });

  it.each([
    ["기능 비활성화", { readStateEnabled: false }],
    ["overlay로 일시 중지", { readStatePaused: true }],
    ["문서가 hidden", { documentVisibilityState: "hidden" as const }],
    ["창 focus 없음", { documentHasFocus: false }],
    ["위치를 잡는 중", { viewportPhase: "positioning" as const }],
    ["최신 위치에서 이탈", { viewportPin: "detached" as const }],
    ["최신 sequence가 viewport 밖", { isLatestSequenceVisible: false }],
  ])("%s이면 보고하지 않는다", (_case, patch) => {
    expect(
      canReportChatMessageReadState({
        ...READY_INPUT,
        ...patch,
      }),
    ).toBe(false);
  });
});
