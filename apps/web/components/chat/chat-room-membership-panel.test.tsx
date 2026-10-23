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

vi.mock("@/components/chat/chat-room-settings-control", () => ({
  ChatRoomInformationSection: ({ canEdit, room }: { canEdit: boolean; room: RoomDetails }) => (
    <section>
      방 정보
      <strong>{room.name}</strong>
      <p>{room.description || "토론방 소개가 없습니다."}</p>
      {canEdit ? <button type="button">수정하기</button> : null}
    </section>
  ),
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

    expect(html).toContain(">참여자</h3>");
    expect(html).toContain(">2명</span>");
    expect(html).not.toContain("divide-y");
    expect(html).toContain("참여자 1");
    expect(html).toContain("참여자 2");
    expect(html).toContain("참여자 프로필 테스트");
    expect(html).not.toContain("방 상세");
    expect(html).not.toContain("내 멤버십");
    expect(html).not.toContain("version 6");
    expect(html).toContain(">나</span>");
    expect(html).toContain('data-avatar-fallback="anonymous"');
    expect(html).not.toContain("차단된 사용자 관리");
    expect(html).toContain("방 정보");
    expect(html).not.toContain("수정하기");
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
      status: "BANNED",
    });
  });

  it("방장에게 ACTIVE 명령과 별도의 BANNED 관리 영역을 제공한다", () => {
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
          userLabel: "owner",
        }),
        createMembershipListItem({
          displayName: "참여자 2",
          membershipId: "membership-member",
          userLabel: "member",
        }),
      ],
      BANNED: [
        createMembershipListItem({
          displayName: "참여자 3",
          membershipId: "membership-banned",
          status: "BANNED",
          bannedAt: "2026-08-10T02:00:00Z",
          userLabel: "blocked-member",
        }),
      ],
    });

    const html = renderPanel(
      createRoomDetails({
        myMembership: membership,
        ownerMembershipId: membership.membershipId,
      }),
    );

    expect(html).toContain(">참여자</h3>");
    expect(html).toContain(">2명</span>");
    expect(html).toContain("방장 위임");
    expect(html).toContain(">차단</button>");
    expect(html).toContain("차단된 사용자 관리");
    expect(html).toContain("방 정보");
    expect(html).toContain("수정하기");
    expect(html).toContain("owner");
    expect(html).toContain("member");
    expect(html).toContain("blocked-member");
    expect(html).not.toContain("참여자 3");
    expect(html).toContain("차단 해제");
    expect(html).toContain("다른 참여자가 있을 때는 토론방을 종료할 수 없습니다.");
    expect(html).toMatch(/<h3[^>]*>차단된 사용자 관리<\/h3>/);
    expect(html).not.toMatch(/<summary[^>]*>[^<]*차단된 사용자 관리/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>방 종료<\/button>/);
    expect(html).not.toContain("비활성 멤버 상태 필터");
    expect(html).not.toContain("나감");
    expect(mocks.useRoomMembershipsQuery).toHaveBeenNthCalledWith(2, "room-01", {
      enabled: true,
      status: "BANNED",
    });
  });

  it("방장만 남은 ACTIVE 토론방은 종료할 수 있다", () => {
    const membership = createMembership({
      membershipId: "membership-owner",
      role: "OWNER",
    });
    prepareQueries(membership, {
      ACTIVE: [
        createMembershipListItem({
          membershipId: membership.membershipId,
          role: "OWNER",
        }),
      ],
    });

    const html = renderPanel(
      createRoomDetails({
        activeMemberCount: 1,
        myMembership: membership,
        ownerMembershipId: membership.membershipId,
      }),
    );

    expect(html).toContain(">방 종료</button>");
    expect(html).not.toContain("다른 참여자가 있을 때는 토론방을 종료할 수 없습니다.");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>방 종료<\/button>/);
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

    expect(html).toContain(">참여자</h3>");
    expect(html).toContain(">2명</span>");
    expect(html).toContain("참여자 2");
    expect(html).not.toContain('class="panel"');
    expect(html).toContain('data-chat-room-membership-header="true"');
    expect(html).toContain("sticky top-0 z-20");
    expect(html).toContain("border-[var(--chat-publishing-color-border)]");
    expect(mocks.useMyRoomMembershipQuery).not.toHaveBeenCalled();
    expect(mocks.useRoomMembershipsQuery).not.toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("명령 성공 안내는 화면에 보이지 않게 두고 화면 낭독기에만 읽어 준다", () => {
    const membership = createMembership();
    const room = createRoomDetails({ myMembership: membership });
    const controller = createMembershipPanelController(membership, []);
    const succeeded = {
      ...controller,
      command: { ...controller.command, successMessage: "멤버를 차단했습니다." },
    };

    const idleHtml = renderToStaticMarkup(
      <ChatRoomMembershipPanelView controller={controller} room={room} />,
    );
    const succeededHtml = renderToStaticMarkup(
      <ChatRoomMembershipPanelView controller={succeeded} room={room} />,
    );

    expect(idleHtml).toContain('<p class="sr-only" role="status"></p>');
    expect(succeededHtml).toContain('<p class="sr-only" role="status">멤버를 차단했습니다.</p>');
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
    categoryIds: ["00000000-0000-4000-8000-000000000001"],
    categorySummaries: [{ categoryId: "00000000-0000-4000-8000-000000000001", name: "정책" }],
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
    ownerManagedMemberships: emptyList,
    roomActionDisabledReason: null,
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
