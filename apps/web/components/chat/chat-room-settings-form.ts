import {
  updateRoomSettingsRequestSchema,
  type RoomSettings,
  type UpdateRoomSettingsRequest,
} from "@/lib/chat/chat-room-contracts";

export type RoomSettingsDraft = Readonly<{
  name: unknown;
  description: unknown;
  visibility: unknown;
  joinPolicy: unknown;
}>;

export type RoomEditableDetailsDraft = Readonly<{
  description: unknown;
  name: unknown;
}>;

export type RoomSettingsPatchResult =
  | Readonly<{
      success: true;
      patch: UpdateRoomSettingsRequest | null;
    }>
  | Readonly<{
      success: false;
      message: string;
    }>;

export function createRoomSettingsPatch(
  current: RoomSettings,
  draft: RoomSettingsDraft,
): RoomSettingsPatchResult {
  const parsed = updateRoomSettingsRequestSchema.safeParse(draft);

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "방 설정 정보를 확인해 주세요.",
    };
  }

  const patch: UpdateRoomSettingsRequest = {};

  if (parsed.data.name !== current.name) {
    patch.name = parsed.data.name;
  }

  if (parsed.data.description !== current.description) {
    patch.description = parsed.data.description;
  }

  if (parsed.data.visibility !== current.visibility) {
    patch.visibility = parsed.data.visibility;
  }

  if (parsed.data.joinPolicy !== current.joinPolicy) {
    patch.joinPolicy = parsed.data.joinPolicy;
  }

  return {
    success: true,
    patch: Object.keys(patch).length === 0 ? null : patch,
  };
}

export function createEditableRoomDetailsPatch(
  current: RoomSettings,
  draft: RoomEditableDetailsDraft,
): RoomSettingsPatchResult {
  return createRoomSettingsPatch(current, {
    ...draft,
    joinPolicy: current.joinPolicy,
    visibility: current.visibility,
  });
}

export function hasEditableRoomDetailsChanges(
  current: RoomSettings,
  draft: RoomEditableDetailsDraft,
): boolean {
  const result = createEditableRoomDetailsPatch(current, draft);

  return !result.success || result.patch !== null;
}
