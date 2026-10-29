import { createRoomRequestSchema, type CreateRoomResponse } from "@/lib/chat/chat-room-contracts";

// 서버는 방 이름을 100자까지 받지만, 목록 카드가 이름을 한 줄로만 보여 주므로 사용자가 요청하는 이름은 393px 화면에서 잘리지 않는 16자로 제한함
export const CREATE_ROOM_NAME_MAX_LENGTH = 16;

const createRoomFormRequestSchema = createRoomRequestSchema.refine(
  (request) => request.name.length <= CREATE_ROOM_NAME_MAX_LENGTH,
  {
    message: `제목은 ${CREATE_ROOM_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`,
    path: ["name"],
  },
);

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
  return createRoomFormRequestSchema.safeParse({
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
