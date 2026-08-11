import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MembershipStatus,
  RoomDetails,
  RoomMembership,
  RoomMembershipListItem,
} from "@/lib/chat/chat-room-contracts";
import { ROOM_PARTICIPANT_PROFILE_PAGE_LIMIT } from "@/lib/chat/chat-room-participant-profiles";
import { ChatRoomMembershipPanel, ChatRoomMembershipPanelView } from "./chat-room-membership-panel";
import type { ChatRoomMembershipPanelController } from "./use-chat-room-membership-panel";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  push: vi.fn(),
  useMyRoomMembershipQuery: vi.fn(),
  useRoomMembershipsQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/chat-room-settings-dialog", () => ({
  ChatRoomSettingsControl: () => null,
}));

vi.mock("@/lib/chat/chat-room-mutations", () => ({
  useBanRoomMemberMutation: () => ({ mutateAsync: mocks.mutateAsync }),
  useCloseRoomMutation: () => ({ mutateAsync: mocks.mutateAsync }),
  useLeaveRoomMutation: () => ({ mutateAsync: mocks.mutateAsync }),
  useTransferRoomOwnershipMutation: () => ({ mutateAsync: mocks.mutateAsync }),
  useUnbanRoomMemberMutation: () => ({ mutateAsync: mocks.mutateAsync }),
}));

vi.mock("@/lib/chat/chat-room-queries", () => ({
  useMyRoomMembershipQuery: (...args: unknown[]) => mocks.useMyRoomMembershipQuery(...args),
  useRoomMembershipsQuery: (...args: unknown[]) => mocks.useRoomMembershipsQuery(...args),
}));

describe("ChatRoomMembershipPanel", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.push.mockReset();
    mocks.useMyRoomMembershipQuery.mockReset();
    mocks.useRoomMembershipsQuery.mockReset();
  });

  it("일반 ACTIVE 참여자에게 Backend 프로필 기반 ACTIVE 목록만 표시한다", () => {
    const membership = createMembership({
      membershipId: "membership-member",
      role: "MEMBER",
    });
    const activeMemberships = [
      createMembershipListItem({
        displayName: "참여자 1",
        membershipId: "membership-owner",
        role: "OWNER",
      }),
      createMembershipListItem({
        displayName: "참여자 2",
        membershipId: membership.membershipId,
      }),
    ];
    prepareQueries(membership, { ACTIVE: activeMemberships });

    const html = renderPanel(createRoomDetails({ myMembership: membership }));

    expect(html).toContain("참여자 목록");
    expect(html).toContain("참여자 1");
    expect(html).toContain("참여자 2");
    expect(html).toContain(">나</span>");
    expect(html).toContain('data-avatar-fallback="anonymous"');
    expect(html).not.toContain("비활성 멤버 관리");
    expect(html).not.toContain("방장 위임");
    expect(html).not.toContain(">차단</button>");
    expect(mocks.useRoomMembershipsQuery).toHaveBeenCalledTimes(2);
    expect(mocks.useRoomMembershipsQuery).toHaveBeenNthCalledWith(1, "room-01", {
      enabled: true,
      limit: ROOM_PARTICIPANT_PROFILE_PAGE_LIMIT,
      status: "ACTIVE",
    });
    expect(mocks.useRoomMembershipsQuery).toHaveBeenNthCalledWith(2, "room-01", {
      enabled: false,
      status: "LEFT",
    });
  });

  it("방장에게 ACTIVE 명령과 별도의 LEFT/BANNED 관리 영역을 제공한다", () => {
    const membership = createMembership({
      membershipId: "membership-owner",
      role: "OWNER",
    });
    prepareQueries(membership, {
      ACTIVE: [
        createMembershipListItem({
          displayName: "참여자 1",
          membershipId: membership.membershipId,
          role: "OWNER",
        }),
        createMembershipListItem({
          displayName: "참여자 2",
          membershipId: "membership-member",
        }),
      ],
      LEFT: [
        createMembershipListItem({
          displayName: "참여자 3",
          membershipId: "membership-left",
          status: "LEFT",
        }),
      ],
    });

    const html = renderPanel(
      createRoomDetails({
        myMembership: membership,
        ownerMembershipId: membership.membershipId,
      }),
    );

    expect(html).toContain("참여자 목록");
    expect(html).toContain("방장 위임");
    expect(html).toContain(">차단</button>");
    expect(html).toContain("비활성 멤버 관리");
    expect(html).toContain("참여자 3");
    expect(html).toContain('aria-label="비활성 멤버 상태 필터"');
    expect(html).not.toContain('aria-label="멤버 상태 필터"');
  });

  it("View는 Query나 mutation hook 없이 controller 상태만 렌더링한다", () => {
    const membership = createMembership();
    const room = createRoomDetails({ myMembership: membership });
    const controller = createMembershipPanelController(membership, [
      createMembershipListItem({ membershipId: membership.membershipId }),
    ]);

    const html = renderToStaticMarkup(
      <ChatRoomMembershipPanelView controller={controller} room={room} />,
    );

    expect(html).toContain("참여자 목록");
    expect(html).toContain("참여자 2");
    expect(mocks.useMyRoomMembershipQuery).not.toHaveBeenCalled();
    expect(mocks.useRoomMembershipsQuery).not.toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});

function prepareQueries(
  membership: RoomMembership,
  membershipsByStatus: Partial<Record<MembershipStatus, readonly RoomMembershipListItem[]>>,
) {
  mocks.useMyRoomMembershipQuery.mockReturnValue({
    data: membership,
    error: null,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  mocks.useRoomMembershipsQuery.mockImplementation(
    (_roomId: string, params: { enabled: boolean; status: MembershipStatus }) => ({
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isPending: false,
      memberships: params.enabled ? (membershipsByStatus[params.status] ?? []) : [],
      refetch: vi.fn(),
    }),
  );
}

function renderPanel(room: RoomDetails): string {
  return renderToStaticMarkup(<ChatRoomMembershipPanel room={room} roomId={room.roomId} />);
}

function createRoomDetails(patch: Partial<RoomDetails> = {}): RoomDetails {
  return {
    roomId: "room-01",
    name: "시민 토론방",
    description: "참여자 프로필 테스트",
    categories: ["POLICY"],
    ownerMembershipId: "membership-owner",
    status: "ACTIVE",
    visibility: "LISTED",
    joinPolicy: "OPEN",
    activeMemberCount: 2,
    createdAt: "2026-08-10T01:00:00Z",
    version: 6,
    closedAt: null,
    participationStatus: "ACTIVE",
    myMembership: createMembership(),
    ...patch,
  };
}

function createMembership(patch: Partial<RoomMembership> = {}): RoomMembership {
  return {
    membershipId: "membership-member",
    roomId: "room-01",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-08-10T01:00:00Z",
    leftAt: null,
    bannedAt: null,
    version: 1,
    ...patch,
  };
}

function createMembershipListItem(
  patch: Partial<RoomMembershipListItem> = {},
): RoomMembershipListItem {
  return {
    membershipId: "membership-member",
    displayName: "참여자 2",
    imageUrl: null,
    profileVersion: 1,
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-08-10T01:00:00Z",
    leftAt: null,
    bannedAt: null,
    version: 1,
    ...patch,
  };
}

function createMembershipPanelController(
  membership: RoomMembership,
  activeMemberships: readonly RoomMembershipListItem[],
): ChatRoomMembershipPanelController {
  const emptyList = {
    errorMessage: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    memberships: [],
    retry: vi.fn(),
  } as const;

  return {
    activeMemberships: {
      ...emptyList,
      memberships: activeMemberships,
    },
    command: {
      error: null,
      isPending: false,
      pending: null,
      retry: vi.fn(),
      startMember: vi.fn(),
      startRoom: vi.fn(),
      successMessage: null,
    },
    isActiveMembershipListEnabled: true,
    isOwner: false,
    ownerManagedMemberships: {
      ...emptyList,
      setStatus: vi.fn(),
      status: "LEFT",
    },
    roomActionKind: "leave",
    selfMembership: {
      errorMessage: null,
      isError: false,
      isFetching: false,
      membership,
      retry: vi.fn(),
    },
  };
}
