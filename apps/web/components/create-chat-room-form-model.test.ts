import { describe, expect, it } from "vitest";
import { parseCreateChatRoomFormData } from "@/components/create-chat-room-form-model";

describe("create chat room form model", () => {
  it("선택한 category를 단일 원소 배열로 canonical payload에 포함한다", () => {
    const result = parseCreateChatRoomFormData(
      createFormData({
        category: "ENVIRONMENT",
        description: " 환경 정책을 논의합니다. ",
      }),
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toEqual({
        name: "시민 AI 토론방",
        description: "환경 정책을 논의합니다.",
        categories: ["ENVIRONMENT"],
        visibility: "LISTED",
        joinPolicy: "OPEN",
      });
    }
  });

  it("category 미선택과 알 수 없는 enum을 거절한다", () => {
    expect(parseCreateChatRoomFormData(createFormData()).success).toBe(false);
    expect(parseCreateChatRoomFormData(createFormData({ category: "UNKNOWN" })).success).toBe(
      false,
    );
  });
});

function createFormData(
  patch: Readonly<{
    category?: string;
    description?: string;
  }> = {},
): FormData {
  const formData = new FormData();
  formData.set("name", "시민 AI 토론방");
  formData.set("description", patch.description ?? "");
  formData.set("visibility", "LISTED");
  formData.set("joinPolicy", "OPEN");

  if (patch.category !== undefined) {
    formData.set("category", patch.category);
  }

  return formData;
}
