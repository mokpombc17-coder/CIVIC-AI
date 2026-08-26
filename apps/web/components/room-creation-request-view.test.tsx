import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RoomCreationRequestView } from "./room-creation-request-view";
import type { RoomCreationRequestResponse } from "@/lib/chat/chat-room-contracts";

describe("RoomCreationRequestView", () => {
  it("승인 완료 상태에 생성된 Room 이동과 수동 새로고침을 제공한다", () => {
    const markup = renderRequest(APPROVED_REQUEST);

    expect(markup).toContain('data-room-creation-request-status="APPROVED"');
    expect(markup).toContain('href="/chat/room-01"');
    expect(markup).toContain("생성된 채팅방으로 이동");
    expect(markup).toContain("최신 상태 확인");
  });

  it("반려 상태에는 반려 사유를 표시하고 Room 이동을 숨긴다", () => {
    const markup = renderRequest(REJECTED_REQUEST);

    expect(markup).toContain('data-room-creation-request-status="REJECTED"');
    expect(markup).toContain("운영 정책과 맞지 않습니다.");
    expect(markup).not.toContain("생성된 채팅방으로 이동");
  });

  it("조회 오류의 재시도 동작을 표시한다", () => {
    const markup = renderToStaticMarkup(
      <RoomCreationRequestView
        error={{
          action: "retry",
          description: "네트워크 연결을 확인해 주세요.",
          title: "신청 상태를 불러오지 못했습니다.",
        }}
        isPending={false}
        isRefreshing={false}
        refresh={vi.fn()}
        request={null}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("다시 시도");
  });
});

function renderRequest(request: RoomCreationRequestResponse): string {
  return renderToStaticMarkup(
    <RoomCreationRequestView
      error={null}
      isPending={false}
      isRefreshing={false}
      refresh={vi.fn()}
      request={request}
    />,
  );
}

const RESPONSE_BASE = {
  clientRequestId: "b3688817-a610-4ef2-987a-1172945974c7",
  replayed: false,
  creationRequestId: "creation-request-01",
  requestedAt: "2026-08-25T07:00:00Z",
} as const;

const APPROVED_REQUEST = {
  ...RESPONSE_BASE,
  code: "ROOM_CREATED",
  status: "APPROVED",
  resolvedAt: "2026-08-25T08:00:00Z",
  roomId: "room-01",
  ownerMembershipId: "membership-01",
  roomVersion: 1,
  ownerMembershipVersion: 1,
  rejectionReason: null,
} satisfies RoomCreationRequestResponse;

const REJECTED_REQUEST = {
  ...RESPONSE_BASE,
  code: "ROOM_CREATION_REJECTED",
  status: "REJECTED",
  resolvedAt: "2026-08-25T08:00:00Z",
  roomId: null,
  ownerMembershipId: null,
  roomVersion: null,
  ownerMembershipVersion: null,
  rejectionReason: "운영 정책과 맞지 않습니다.",
} satisfies RoomCreationRequestResponse;
