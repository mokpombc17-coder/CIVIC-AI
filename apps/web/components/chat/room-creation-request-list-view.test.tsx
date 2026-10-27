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
    expect(markup).toContain("공원 개선 논의");
    expect(markup).toContain("반려동물 동호회");
    expect(markup).not.toContain("토론방 생성 요청");
    expect(markup).toContain("rounded-[4px]");
    expect(markup).toContain("px-1.5");
    expect(markup).toContain("py-0.5");
    expect(markup).not.toContain("rounded-full");
    expect(markup).toContain("min-h-[120px]");
    expect(markup).toContain("rounded-[var(--chat-publishing-radius-card)]");
  });

  it("한 줄에서 잘리는 신청 제목은 hover로 전체를 확인할 수 있다", () => {
    const markup = renderView({ requests: [PENDING_REQUEST] });

    expect(markup).toMatch(/<strong [^>]*title="공원 개선 논의">공원 개선 논의<\/strong>/);
  });

  it("승인된 요청에만 생성된 토론방 이동 action을 표시한다", () => {
    const markup = renderView({ requests: [APPROVED_REQUEST] });

    expect(markup).toContain('data-room-creation-request-status="APPROVED"');
    expect(markup).toContain('href="/chat/room-01"');
    expect(markup).toContain(">이동하기</a>");
  });

  it("운영이 종료된 생성 완료 요청에는 이동 action을 표시하지 않는다", () => {
    const markup = renderView({ requests: [CLOSED_APPROVED_REQUEST] });

    expect(markup).toContain('data-room-creation-request-status="APPROVED"');
    expect(markup).toContain("종료됨");
    expect(markup).toContain("종료된 도시 정책 토론방");
    expect(markup).toContain("생성된 토론방의 운영이 종료되었습니다.");
    expect(markup).not.toContain("이동하기");
  });

  it("다음 cursor가 있을 때만 더 보기 동작을 표시한다", () => {
    const markup = renderView({ hasNextPage: true, requests: [PENDING_REQUEST] });

    expect(markup).toContain("이전 신청 더 보기");
  });

  it("신청이 없을 때 빈 목록 안내를 표시한다", () => {
    const markup = renderView();

    expect(markup).toContain("아직 요청 내역이 없어요.");
    expect(markup).toContain("새로운 토론방이 필요하다면 신청해 주세요.");
    expect(markup).toContain('data-room-creation-request-empty="true"');
    expect(markup).toContain("min-h-[368px]");
    expect(markup).toContain("rounded-lg border");
    expect(markup).toContain("border-[var(--chat-publishing-color-border)]");
    expect(markup).toContain("justify-items-center");
    expect(markup).toContain("size-10");
    expect(markup).toContain("bg-[var(--chat-publishing-color-primary)]");
    expect(markup).toContain('aria-hidden="true"');
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
  name: "공원 개선 논의",
  code: "ROOM_CREATION_REQUESTED",
  status: "PENDING",
  roomStatus: null,
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
  name: "반려동물 동호회",
  code: "ROOM_CREATION_REJECTED",
  status: "REJECTED",
  roomStatus: null,
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
  name: "울산 교통 정책 토론방",
  code: "ROOM_CREATED",
  status: "APPROVED",
  roomStatus: "ACTIVE",
  resolvedAt: "2026-08-25T08:00:00Z",
  roomId: "room-01",
  ownerMembershipId: "membership-01",
  roomVersion: 1,
  ownerMembershipVersion: 1,
  rejectionReason: null,
} satisfies RoomCreationRequestResponse;

const CLOSED_APPROVED_REQUEST = {
  ...APPROVED_REQUEST,
  creationRequestId: "request-approved-closed",
  name: "종료된 도시 정책 토론방",
  roomStatus: "CLOSED",
} satisfies RoomCreationRequestResponse;
