import { describe, expect, it } from "vitest";
import { CHAT_QUERY_STALE_TIME_MS, createChatQueryClient } from "./chat-query-client";

describe("createChatQueryClient", () => {
  it("채팅 조회와 command에 맞는 기본 정책을 적용한다", () => {
    const queryClient = createChatQueryClient();
    const options = queryClient.getDefaultOptions();

    expect(options.queries).toMatchObject({
      staleTime: CHAT_QUERY_STALE_TIME_MS,
      retry: 1,
    });
    expect(options.queries).not.toHaveProperty("refetchOnWindowFocus");
    expect(options.mutations).toMatchObject({
      retry: false,
    });

    queryClient.clear();
  });

  it("호출마다 독립된 QueryClient를 생성한다", () => {
    expect(createChatQueryClient()).not.toBe(createChatQueryClient());
  });
});
