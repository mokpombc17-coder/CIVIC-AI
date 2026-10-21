import { describe, expect, it, vi } from "vitest";
import { listCountLabel } from "@/lib/admin/list-count";
import { requestAdminAuditWindow } from "@/lib/admin/user-admin";
import { loadUserRoomRequests } from "@/lib/admin/user-activity";
import { requestAdminUserLabels } from "@/lib/admin/user-labels";

describe("관리자 목록 잘림 방지", () => {
  it("전체 수를 알면 전체 대비 표시 건수를, 모르면 더 있음 여부를 보여준다", () => {
    expect(listCountLabel({ shown: 12, total: 40 })).toBe("전체 40건 중 12건 표시");
    expect(listCountLabel({ shown: 40, total: 40 })).toBe("전체 40건");
    expect(listCountLabel({ shown: 7, total: 7, unit: "개" })).toBe("전체 7개");
    expect(listCountLabel({ shown: 50, hasMore: true })).toBe("50건 표시 · 더 있음");
    expect(listCountLabel({ shown: 3 })).toBe("3건 표시");
  });

  it("사용자 라벨은 100개씩 나눠 조회해 101번째 이후 사용자도 이름을 찾는다", async () => {
    const ids = Array.from({ length: 230 }, (_, index) => `user-${index}`);
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input), "https://civic.test").searchParams.getAll("ids");
      return Response.json({
        items: requested.map((id) => ({ user_id: id, email: `${id}@example.test` })),
      });
    });

    const labels = await requestAdminUserLabels([...ids, "user-0"], request as typeof fetch);

    expect(request).toHaveBeenCalledTimes(3);
    for (const [input] of request.mock.calls) {
      const count = new URL(String(input), "https://civic.test").searchParams.getAll("ids").length;
      expect(count).toBeLessThanOrEqual(100);
    }
    expect(labels?.size).toBe(230);
    expect(labels?.get("user-229")).toBe("user-229@example.test");
  });

  it("라벨 배치 중 하나라도 실패하면 부분 결과 대신 실패로 처리한다", async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `user-${index}`);
    let calls = 0;
    const request = vi.fn(async () => {
      calls += 1;
      return calls === 2 ? new Response(null, { status: 500 }) : Response.json({ items: [] });
    });

    await expect(requestAdminUserLabels(ids, request as typeof fetch)).resolves.toBeNull();
  });

  it("사용자 개설 신청 이력은 상태별 다음 페이지를 끝까지 따라가 찾는다", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const params = new URL(String(input), "https://civic.test").searchParams;
      const status = params.get("status") ?? "PENDING";
      if (status !== "APPROVED")
        return Response.json({ items: [], hasNext: false, nextCursor: null });
      return params.get("cursor") === "approved-2"
        ? Response.json({
            items: [roomRequest("late", "target-user", status)],
            hasNext: false,
            nextCursor: null,
          })
        : Response.json({
            items: [roomRequest("other", "someone-else", status)],
            hasNext: true,
            nextCursor: "approved-2",
          });
    });

    const state = await loadUserRoomRequests("target-user", request as typeof fetch);

    expect(state).toEqual({
      status: "ready",
      items: [expect.objectContaining({ creationRequestId: "late" })],
    });
    expect(request).toHaveBeenCalledWith(
      "/api/v1/admin/room-creation-requests?status=APPROVED&limit=100&cursor=approved-2",
      { cache: "no-store" },
    );
  });

  it("감사 이력이 서버 최근 100건으로 꽉 차면 오래된 이력이 빠졌다고 알린다", async () => {
    const events = Array.from({ length: 100 }, (_, index) => ({
      event_id: `event-${index}`,
      event_type: "ROLE_CHANGED",
      actor_id: "admin",
      occurred_at: "2026-10-20T00:00:00Z",
      request_id: `request-${index}`,
      subject_id: index === 0 ? "target" : "other",
    }));
    const full = vi.fn(async () => Response.json({ items: events }));
    const partial = vi.fn(async () => Response.json({ items: events.slice(0, 10) }));

    await expect(requestAdminAuditWindow("target", full as typeof fetch)).resolves.toEqual({
      items: [events[0]],
      windowFull: true,
    });
    await expect(requestAdminAuditWindow("target", partial as typeof fetch)).resolves.toMatchObject(
      {
        windowFull: false,
      },
    );
  });
});

function roomRequest(id: string, requesterUserId: string, status: string) {
  return {
    categoryIds: [],
    creationRequestId: id,
    description: "",
    joinPolicy: "OPEN",
    name: `방 ${id}`,
    ownerMembershipId: null,
    ownerMembershipVersion: null,
    rejectionReason: null,
    replayed: false,
    requestedAt: "2026-10-20T00:00:00Z",
    requesterUserId,
    resolvedAt: null,
    roomId: null,
    roomVersion: null,
    status,
    visibility: "PUBLIC",
  };
}
