import { describe, expect, it } from "vitest";
import {
  CHAT_ROOM_CATEGORY_OPTIONS,
  getChatRoomCategoryLabel,
} from "@/components/chat-room-category";

describe("chat room category presentation", () => {
  it("Backend enum을 고정된 한글 문구로 표시한다", () => {
    expect(CHAT_ROOM_CATEGORY_OPTIONS).toEqual(["POLICY", "ENVIRONMENT", "LOCAL_ISSUE"]);
    expect(getChatRoomCategoryLabel("POLICY")).toBe("정책");
    expect(getChatRoomCategoryLabel("ENVIRONMENT")).toBe("환경");
    expect(getChatRoomCategoryLabel("LOCAL_ISSUE")).toBe("지역 현안");
  });
});
