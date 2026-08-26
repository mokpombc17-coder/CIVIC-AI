import { createRoomRequestSchema, type CreateRoomResponse } from "@/lib/chat/chat-room-contracts";

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
  const category = formData.get("category");

  return createRoomRequestSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    categories: category === null ? [] : [category],
    visibility: formData.get("visibility"),
    joinPolicy: formData.get("joinPolicy"),
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
