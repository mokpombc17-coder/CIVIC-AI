import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RoomDetails, RoomMembership } from "@/lib/chat/chat-room-contracts";
import { ChatRoomSettingsControlView } from "./chat-room-settings-control";
import type { ChatRoomSettingsControlController } from "./use-chat-room-settings-control";

describe("ChatRoomSettingsControlView", () => {
  it("방장에게 이름·설명 입력과 비활성 저장 action을 처음부터 렌더링한다", () => {
    const controller = createController({
      completionMessage: "방 정보를 수정했습니다.",
    });

    const html = renderToStaticMarkup(
      <ChatRoomSettingsControlView controller={controller} room={createRoomDetails()} />,
    );

    expect(html).toContain("방 정보를 수정했습니다.");
    expect(html).toContain("방 정보");
    expect(html).toContain("정책");
    expect(html).toContain('<input class="-mx-2');
    expect(html).toContain('name="name"');
    expect(html).toContain('required=""');
    expect(html).toContain('value="시민 토론방"');
    expect(html).toContain('name="description"');
    expect(html).toContain(">저장</button>");
    expect(html).toContain('disabled="" type="submit"');
    expect(html).toContain("border-transparent");
    expect(html).toContain("bg-transparent");
    expect(html).toContain("focus:border-[var(--chat-publishing-color-primary)]");
    expect(html).toContain("focus:bg-white");
    expect(html).toContain("<form");
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain(">수정하기</button>");
    expect(html).not.toContain(">취소</button>");
  });

  it("저장 중에는 입력과 저장 action을 잠그고 진행 상태를 표시한다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomSettingsControlView
        controller={createController({ isPending: true })}
        room={createRoomDetails()}
      />,
    );

    expect(html).toContain('<fieldset class="grid gap-4" disabled="">');
    expect(html).toContain(">저장 중…</button>");
    expect(html).toContain('disabled="" type="submit"');
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
    categoryIds: ["00000000-0000-4000-8000-000000000001"],
    categorySummaries: [{ categoryId: "00000000-0000-4000-8000-000000000001", name: "정책" }],
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
