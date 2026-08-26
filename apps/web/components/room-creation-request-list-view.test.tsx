import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RoomCreationRequestResponse } from "@/lib/chat/chat-room-contracts";
import { RoomCreationRequestListView } from "./room-creation-request-list-view";

describe("RoomCreationRequestListView", () => {
  it("서버가 제공한 신청 순서대로 상태와 상세 링크를 표시한다", () => {
    const markup = renderView({ requests: [PENDING_REQUEST, REJECTED_REQUEST] });

    expect(markup.indexOf("request-old")).toBeLessThan(markup.indexOf("request-new"));
    expect(markup).toContain('data-room-creation-request-status="PENDING"');
    expect(markup).toContain('data-room-creation-request-status="REJECTED"');
    expect(markup).toContain('href="/chat/creation-requests/request-old"');
    expect(markup).toContain("운영 정책과 맞지 않습니다.");
  });

  it("다음 cursor가 있을 때만 더 보기 동작을 표시한다", () => {
    const markup = renderView({ hasNextPage: true, requests: [PENDING_REQUEST] });

    expect(markup).toContain("이전 신청 더 보기");
  });

  it("신청이 없을 때 빈 목록 안내를 표시한다", () => {
    const markup = renderView();

    expect(markup).toContain("아직 생성 신청이 없습니다.");
    expect(markup).not.toContain("이전 신청 더 보기");
  });
});

function renderView(
  overrides: Partial<ComponentProps<typeof RoomCreationRequestListView>> = {},
): string {
  return renderToStaticMarkup(
    <RoomCreationRequestListView
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
