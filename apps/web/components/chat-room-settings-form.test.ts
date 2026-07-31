import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createRoomSettingsPatch } from "@/components/chat-room-settings-form";
import type { RoomSettings } from "@/lib/chat/chat-room-contracts";
import { updateRoomSettingsMutationOptions } from "@/lib/chat/chat-room-mutations";
import { chatRoomQueryKeys } from "@/lib/chat/chat-room-queries";
import { createIdempotentCommand } from "@/lib/chat/idempotent-command";

const IDEMPOTENCY_KEY = "550e8400-e29b-41d4-a716-446655440000";

describe("room settings form patch", () => {
  it("서버 canonical 값과 같아지는 공백 차이는 변경으로 보내지 않는다", () => {
    expect(
      createRoomSettingsPatch(CURRENT_SETTINGS, {
        name: " 시민 AI 토론방 ",
        description: "\tAI 정책을 논의합니다.\n",
        visibility: "LISTED",
        joinPolicy: "OPEN",
      }),
    ).toEqual({
      success: true,
      patch: null,
    });
  });

  it("실제로 변경된 설정만 canonical 값으로 patch에 포함한다", () => {
    expect(
      createRoomSettingsPatch(CURRENT_SETTINGS, {
        name: CURRENT_SETTINGS.name,
        description: " 새 설명 ",
        visibility: "UNLISTED",
        joinPolicy: CURRENT_SETTINGS.joinPolicy,
      }),
    ).toEqual({
      success: true,
      patch: {
        description: "새 설명",
        visibility: "UNLISTED",
      },
    });
  });

  it("공백뿐인 description은 빈 문자열로 정규화해 설명 제거 patch를 만든다", () => {
    expect(
      createRoomSettingsPatch(CURRENT_SETTINGS, {
        ...CURRENT_SETTINGS,
        description: " \t\n ",
      }),
    ).toEqual({
      success: true,
      patch: {
        description: "",
      },
    });
  });

  it("description은 JavaScript string.length가 아니라 Unicode code point 기준으로 검증한다", () => {
    const maxLengthDescription = "😀".repeat(500);
    const valid = createRoomSettingsPatch(CURRENT_SETTINGS, {
      ...CURRENT_SETTINGS,
      description: maxLengthDescription,
    });
    const tooLong = createRoomSettingsPatch(CURRENT_SETTINGS, {
      ...CURRENT_SETTINGS,
      description: `${maxLengthDescription}😀`,
    });

    expect(valid).toEqual({
      success: true,
      patch: {
        description: maxLengthDescription,
      },
    });
    expect(tooLong).toMatchObject({
      success: false,
    });
  });

  it("TAB/LF/CR 외의 C0 제어문자가 있거나 필드가 null이면 validation에서 거절한다", () => {
    expect(
      createRoomSettingsPatch(CURRENT_SETTINGS, {
        ...CURRENT_SETTINGS,
        description: "허용되지 않는\u0000설명",
      }),
    ).toMatchObject({
      success: false,
    });
    expect(
      createRoomSettingsPatch(CURRENT_SETTINGS, {
        ...CURRENT_SETTINGS,
        name: null,
      }),
    ).toMatchObject({
      success: false,
    });
  });
});

describe("room settings form to mutation integration", () => {
  it("변경 필드만 같은 멱등 command에 담아 API로 전달하고 설정 관련 cache만 무효화한다", async () => {
    const result = createRoomSettingsPatch(CURRENT_SETTINGS, {
      ...CURRENT_SETTINGS,
      description: " 변경된 설명 ",
      visibility: "UNLISTED",
    });

    expect(result.success).toBe(true);

    if (!result.success || !result.patch) {
      throw new Error("설정 변경 patch가 생성되어야 합니다.");
    }

    const queryClient = createSeededQueryClient();
    const updateRoomSettings = vi.fn(async () => ({
      clientRequestId: IDEMPOTENCY_KEY,
      code: "ROOM_SETTINGS_UPDATED" as const,
      replayed: false,
      roomId: "room-01",
      name: CURRENT_SETTINGS.name,
      description: "변경된 설명",
      visibility: "UNLISTED" as const,
      joinPolicy: CURRENT_SETTINGS.joinPolicy,
      roomVersion: 2,
    }));
    const observer = new MutationObserver(
      queryClient,
      updateRoomSettingsMutationOptions(queryClient, {
        updateRoomSettings,
      }),
    );
    const command = createIdempotentCommand(result.patch, () => IDEMPOTENCY_KEY);

    await observer.mutate({
      roomId: "room-01",
      command,
    });

    expect(updateRoomSettings).toHaveBeenCalledWith("room-01", {
      idempotencyKey: IDEMPOTENCY_KEY,
      body: {
        description: "변경된 설명",
        visibility: "UNLISTED",
      },
    });
    expect(isInvalidated(queryClient, chatRoomQueryKeys.detail("room-01"))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.publicList(20))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.myList(20))).toBe(true);
    expect(isInvalidated(queryClient, chatRoomQueryKeys.myMembership("room-01"))).toBe(false);
    expect(
      isInvalidated(queryClient, chatRoomQueryKeys.membershipList("room-01", "ACTIVE", 20)),
    ).toBe(false);
  });
});

function createSeededQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  });

  queryClient.setQueryData(chatRoomQueryKeys.detail("room-01"), "detail");
  queryClient.setQueryData(chatRoomQueryKeys.publicList(20), "public");
  queryClient.setQueryData(chatRoomQueryKeys.myList(20), "my");
  queryClient.setQueryData(chatRoomQueryKeys.myMembership("room-01"), "membership");
  queryClient.setQueryData(chatRoomQueryKeys.membershipList("room-01", "ACTIVE", 20), "members");
  return queryClient;
}

function isInvalidated(queryClient: QueryClient, queryKey: readonly unknown[]): boolean {
  return queryClient.getQueryState(queryKey)?.isInvalidated ?? false;
}

const CURRENT_SETTINGS = {
  name: "시민 AI 토론방",
  description: "AI 정책을 논의합니다.",
  visibility: "LISTED",
  joinPolicy: "OPEN",
} satisfies RoomSettings;
