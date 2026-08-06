import { createRoomRequestSchema } from "@/lib/chat/chat-room-contracts";

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
