import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RoomCreationRequestResponse } from "@/lib/chat/chat-room-contracts";
import { RoomCreationRequestListContent } from "./room-creation-request-list-view";

describe("RoomCreationRequestListContent", () => {
  it("서버가 제공한 신청 순서대로 상태를 표시하고 반려 건에는 사유만 제공한다", () => {
    const markup = renderView({ requests: [PENDING_REQUEST, REJECTED_REQUEST] });

    expect(markup.indexOf('data-room-creation-request-status="PENDING"')).toBeLessThan(
      markup.indexOf('data-room-creation-request-status="REJECTED"'),
    );
    expect(markup).toContain("운영 정책과 맞지 않습니다.");
    expect(markup).not.toContain("이동하기");
    expect(markup).not.toContain("신청 ID");
    expect(markup).not.toContain("/chat/creation-requests/");
    expect(markup).not.toContain("실시간 알림");
    expect(markup).toContain("min-h-[120px]");
    expect(markup).toContain("rounded-[var(--chat-publishing-radius-card)]");
  });

  it("승인된 요청에만 생성된 토론방 이동 action을 표시한다", () => {
    const markup = renderView({ requests: [APPROVED_REQUEST] });

    expect(markup).toContain('data-room-creation-request-status="APPROVED"');
    expect(markup).toContain('href="/chat/room-01"');
    expect(markup).toContain(">이동하기</a>");
  });

  it("다음 cursor가 있을 때만 더 보기 동작을 표시한다", () => {
    const markup = renderView({ hasNextPage: true, requests: [PENDING_REQUEST] });

    expect(markup).toContain("이전 신청 더 보기");
  });

  it("신청이 없을 때 빈 목록 안내를 표시한다", () => {
    const markup = renderView();

    expect(markup).toContain("아직 요청 내역이 없어요.");
    expect(markup).toContain("새로운 토론방이 필요하다면 신청해 주세요.");
    expect(markup).not.toContain("이전 신청 더 보기");
  });
});

function renderView(
  overrides: Partial<ComponentProps<typeof RoomCreationRequestListContent>> = {},
): string {
  return renderToStaticMarkup(
    <RoomCreationRequestListContent
      errorMessage={null}
      hasNextPage={false}
      isError={false}
      isFetchingNextPage={false}
      isPending={false}
      loadMore={vi.fn()}
      requests={[]}
      retry={vi.fn()}
      {...overrides}
    />,
  );
}

const RESPONSE_BASE = {
  clientRequestId: "b3688817-a610-4ef2-987a-1172945974c7",
  replayed: false,
  requestedAt: "2026-08-25T07:00:00Z",
} as const;

const PENDING_REQUEST = {
  ...RESPONSE_BASE,
  creationRequestId: "request-old",
  code: "ROOM_CREATION_REQUESTED",
  status: "PENDING",
  resolvedAt: null,
  roomId: null,
  ownerMembershipId: null,
  roomVersion: null,
  ownerMembershipVersion: null,
  rejectionReason: null,
} satisfies RoomCreationRequestResponse;

const REJECTED_REQUEST = {
  ...RESPONSE_BASE,
  creationRequestId: "request-new",
  code: "ROOM_CREATION_REJECTED",
  status: "REJECTED",
  resolvedAt: "2026-08-25T08:00:00Z",
  roomId: null,
  ownerMembershipId: null,
  roomVersion: null,
  ownerMembershipVersion: null,
  rejectionReason: "운영 정책과 맞지 않습니다.",
} satisfies RoomCreationRequestResponse;

const APPROVED_REQUEST = {
  ...RESPONSE_BASE,
  creationRequestId: "request-approved",
  code: "ROOM_CREATED",
  status: "APPROVED",
  resolvedAt: "2026-08-25T08:00:00Z",
  roomId: "room-01",
  ownerMembershipId: "membership-01",
  roomVersion: 1,
  ownerMembershipVersion: 1,
  rejectionReason: null,
} satisfies RoomCreationRequestResponse;
