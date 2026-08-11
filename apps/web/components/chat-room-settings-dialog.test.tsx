import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RoomDetails, RoomMembership } from "@/lib/chat/chat-room-contracts";
import { ChatRoomSettingsControlView } from "./chat-room-settings-dialog";
import type { ChatRoomSettingsControlController } from "./use-chat-room-settings-control";

describe("ChatRoomSettingsControlView", () => {
  it("controller가 제공한 완료 문구와 설정 form을 렌더링한다", () => {
    const controller = createController({
      completionMessage: "방 설정을 변경했습니다.",
      isOpen: true,
      selectedCategory: "ENVIRONMENT",
    });

    const html = renderToStaticMarkup(
      <ChatRoomSettingsControlView controller={controller} room={createRoomDetails()} />,
    );

    expect(html).toContain("방 설정을 변경했습니다.");
    expect(html).toContain("<dialog");
    expect(html).toContain('name="name"');
    expect(html).toContain("환경");
    expect(html).not.toContain("방 설정을 변경하지 못했습니다.");
  });

  it("controller가 닫힌 상태면 설정 Dialog를 렌더링하지 않는다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomSettingsControlView controller={createController()} room={createRoomDetails()} />,
    );

    expect(html).toContain("방 설정");
    expect(html).not.toContain("<dialog");
  });
});

function createController(
  patch: Partial<ChatRoomSettingsControlController> = {},
): ChatRoomSettingsControlController {
  return {
    canRetry: false,
    clearFailedAttempt: vi.fn(),
    close: vi.fn(),
    completionMessage: null,
    errorMessage: null,
    isOpen: false,
    isPending: false,
    open: vi.fn(),
    retry: vi.fn(),
    selectedCategory: "POLICY",
    selectCategory: vi.fn(),
    submit: vi.fn(),
    validationMessage: null,
    ...patch,
  };
}

function createRoomDetails(): RoomDetails {
  return {
    roomId: "room-01",
    name: "시민 토론방",
    description: "방 설정 View 테스트",
    categories: ["POLICY"],
    ownerMembershipId: "membership-owner",
    status: "ACTIVE",
    visibility: "LISTED",
    joinPolicy: "OPEN",
    activeMemberCount: 1,
    createdAt: "2026-08-10T01:00:00Z",
    version: 6,
    closedAt: null,
    participationStatus: "ACTIVE",
    myMembership: createMembership(),
  };
}

function createMembership(): RoomMembership {
  return {
    membershipId: "membership-owner",
    roomId: "room-01",
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: "2026-08-10T01:00:00Z",
    leftAt: null,
    bannedAt: null,
    version: 1,
  };
}
