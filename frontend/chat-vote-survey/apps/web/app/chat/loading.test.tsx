import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/chat" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("@/components/chat/chat-room-list-screen", () => ({
  ChatRoomListScreen: () => <div data-loading-kind="list" />,
}));
vi.mock("@/components/chat/chat-room-screen-loading", () => ({
  ChatRoomScreenLoading: () => <div data-loading-kind="room" />,
}));

import ChatLoading, { isChatRoomPathname } from "./loading";

describe("ChatLoading", () => {
  beforeEach(() => {
    navigation.pathname = "/chat";
  });

  it("채팅방 상세 경로만 상세 전용 로딩 화면으로 분류한다", () => {
    expect(isChatRoomPathname("/chat/room-01")).toBe(true);
    expect(isChatRoomPathname("/chat")).toBe(false);
    expect(isChatRoomPathname("/chat/creation-requests")).toBe(false);
    expect(isChatRoomPathname("/chat/creation-requests/request-01")).toBe(false);
  });

  it("목록 복귀에는 cache-aware 목록 화면을 사용한다", () => {
    expect(renderToStaticMarkup(<ChatLoading />)).toContain('data-loading-kind="list"');
  });

  it("채팅방 진입에는 목록 skeleton 대신 상세 로딩 화면을 사용한다", () => {
    navigation.pathname = "/chat/room-01";

    expect(renderToStaticMarkup(<ChatLoading />)).toContain('data-loading-kind="room"');
  });
});
