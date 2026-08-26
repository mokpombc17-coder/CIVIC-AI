import { describe, expect, it, vi } from "vitest";
import { adminUserLabel, requestAdminUserLabels } from "./user-labels";

describe("administrator display labels", () => {
  it("중복 ID를 한 요청으로 조회하고 반환된 이메일만 매핑한다", async () => {
    const request = vi.fn(async () =>
      Response.json({
        items: [{ user_id: "user-1", email: "operator@post-ai.com" }],
      }),
    );

    const labels = await requestAdminUserLabels(
      ["user-1", "user-1", "user-2"],
      request as typeof fetch,
    );

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("/api/v1/admin/user-labels?ids=user-1&ids=user-2", {
      cache: "no-store",
    });
    expect(labels).toEqual(new Map([["user-1", "operator@post-ai.com"]]));
    expect(adminUserLabel(labels ?? new Map(), "user-2")).toBe("확인할 수 없는 사용자");
  });

  it("일부 항목이라도 형식이 깨진 응답은 부분 매핑하지 않는다", async () => {
    const request = vi.fn(async () =>
      Response.json({
        items: [
          { user_id: "user-1", email: "operator@post-ai.com" },
          { user_id: "user-2", email: 17 },
        ],
      }),
    );

    await expect(
      requestAdminUserLabels(["user-1", "user-2"], request as typeof fetch),
    ).resolves.toBeNull();
  });
});
