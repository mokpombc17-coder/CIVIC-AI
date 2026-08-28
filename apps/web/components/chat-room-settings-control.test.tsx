import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RoomDetails, RoomMembership } from "@/lib/chat/chat-room-contracts";
import { ChatRoomSettingsControlView } from "./chat-room-settings-control";
import type { ChatRoomSettingsControlController } from "./use-chat-room-settings-control";

describe("ChatRoomSettingsControlView", () => {
  it("조회 상태에서 방 정보와 방장용 수정하기 action을 함께 렌더링한다", () => {
    const controller = createController({
      completionMessage: "방 정보를 수정했습니다.",
    });

    const html = renderToStaticMarkup(
      <ChatRoomSettingsControlView
        controller={controller}
        isEditing={false}
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        room={createRoomDetails()}
      />,
    );

    expect(html).toContain("방 정보를 수정했습니다.");
    expect(html).toContain("방 정보");
    expect(html).toContain("시민 토론방");
    expect(html).toContain("방 설정 View 테스트");
    expect(html).toContain(">수정하기</button>");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<dialog");
    expect(html).toContain('aria-label="방 정보 수정하기"');
    expect(html).toContain("border-[var(--chat-publishing-color-border)]");
    expect(html).not.toContain("bg-[var(--chat-publishing-color-neutral-soft)]");
  });

  it("편집 상태에서 이름·설명 form과 취소·저장 action을 인라인으로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomSettingsControlView
        controller={createController()}
        isEditing
        onCancel={vi.fn()}
        onEdit={vi.fn()}
        room={createRoomDetails()}
      />,
    );

    expect(html).toContain("방 정보");
    expect(html).toContain("<form");
    expect(html).toContain('name="name"');
    expect(html).toContain('name="description"');
    expect(html).not.toContain("방 카테고리");
    expect(html).not.toContain("공개 범위");
    expect(html).not.toContain("참여 정책");
    expect(html).toContain(">취소</button>");
    expect(html).toContain(">저장</button>");
    expect(html).not.toContain(">수정하기</button>");
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
