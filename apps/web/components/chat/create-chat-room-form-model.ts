import { createRoomRequestSchema, type CreateRoomResponse } from "@/lib/chat/chat-room-contracts";

export const TEMPORARY_CREATE_ROOM_REQUEST_DEFAULTS = {
  joinPolicy: "OPEN",
  visibility: "LISTED",
} as const;

export type CreateChatRoomResultDestination =
  | Readonly<{
      href: `/chat/${string}`;
      kind: "room";
    }>
  | Readonly<{
      kind: "creation-request";
      response: Exclude<CreateRoomResponse, { status: "APPROVED" }>;
    }>;

export function parseCreateChatRoomFormData(formData: FormData) {
  return createRoomRequestSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    visibility: formData.get("visibility") ?? TEMPORARY_CREATE_ROOM_REQUEST_DEFAULTS.visibility,
    joinPolicy: formData.get("joinPolicy") ?? TEMPORARY_CREATE_ROOM_REQUEST_DEFAULTS.joinPolicy,
  });
}

export function resolveCreateChatRoomResultDestination(
  response: CreateRoomResponse,
): CreateChatRoomResultDestination {
  if (response.status === "APPROVED") {
    return {
      href: `/chat/${response.roomId}`,
      kind: "room",
    };
  }

  return {
    kind: "creation-request",
    response,
  };
}
