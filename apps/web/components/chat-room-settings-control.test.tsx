import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RoomDetails, RoomMembership } from "@/lib/chat/chat-room-contracts";
import { ChatRoomSettingsControlView } from "./chat-room-settings-control";
import type { ChatRoomSettingsControlController } from "./use-chat-room-settings-control";

describe("ChatRoomSettingsControlView", () => {
  it("controller가 제공한 완료 문구와 방 이름·설명 form을 인라인으로 렌더링한다", () => {
    const controller = createController({
      completionMessage: "방 정보를 수정했습니다.",
    });

    const html = renderToStaticMarkup(
      <ChatRoomSettingsControlView controller={controller} room={createRoomDetails()} />,
    );

    expect(html).toContain("방 정보를 수정했습니다.");
    expect(html).toContain("<form");
    expect(html).not.toContain("<dialog");
    expect(html).toContain('name="name"');
    expect(html).toContain('name="description"');
    expect(html).not.toContain("방 카테고리");
    expect(html).not.toContain("공개 범위");
    expect(html).not.toContain("참여 정책");
    expect(html).not.toContain("방 정보를 수정하지 못했습니다.");
    expect(html).toContain("되돌리기");
  });

  it("완료 문구가 없어도 방 정보 수정 form을 바로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomSettingsControlView controller={createController()} room={createRoomDetails()} />,
    );

    expect(html).toContain("방 정보 수정");
    expect(html).toContain("<form");
    expect(html).not.toContain("방 정보 수정</button>");
  });
});

function createController(
  patch: Partial<ChatRoomSettingsControlController> = {},
): ChatRoomSettingsControlController {
  return {
    canRetry: false,
    clearFailedAttempt: vi.fn(),
    completionMessage: null,
    errorMessage: null,
    isPending: false,
    reset: vi.fn(),
    retry: vi.fn(),
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
