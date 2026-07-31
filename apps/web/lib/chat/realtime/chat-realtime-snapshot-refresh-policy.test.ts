import { describe, expect, it } from "vitest";
import { ChatRealtimeSnapshotRefreshPolicy } from "./chat-realtime-snapshot-refresh-policy";

describe("ChatRealtimeSnapshotRefreshPolicy", () => {
  it("최초 활성화와 Strict Mode의 동일 Effect 재실행은 재연결로 보지 않는다", () => {
    const policy = new ChatRealtimeSnapshotRefreshPolicy();

    policy.deactivate("room-01", 1);

    expect(policy.activate("room-01", 1)).toBe(false);
    expect(policy.activate("room-01", 1)).toBe(false);
  });

  it("활성화됐던 동일 session이 비활성화 후 다시 활성화되면 snapshot을 갱신한다", () => {
    const policy = new ChatRealtimeSnapshotRefreshPolicy();

    expect(policy.activate("room-01", 1)).toBe(false);
    policy.deactivate("room-01", 1);

    expect(policy.activate("room-01", 1)).toBe(true);
  });

  it("방 또는 generation이 바뀐 새 session에는 이전 session의 재연결 상태를 넘기지 않는다", () => {
    const policy = new ChatRealtimeSnapshotRefreshPolicy();

    policy.activate("room-01", 1);
    policy.deactivate("room-01", 1);

    expect(policy.activate("room-02", 1)).toBe(false);
    policy.deactivate("room-02", 1);
    expect(policy.activate("room-02", 2)).toBe(false);
  });
});
