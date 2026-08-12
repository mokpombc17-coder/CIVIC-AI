import type { ChatRoomExportApi } from "./chat-room-export-api";
import type { ChatRoomExportInput } from "./chat-room-export-contracts";

export async function downloadAndSaveRoomChatExport({
  api,
  input,
  save,
}: Readonly<{
  api: Pick<ChatRoomExportApi, "download">;
  input: ChatRoomExportInput;
  save: (download: Awaited<ReturnType<ChatRoomExportApi["download"]>>) => void;
}>): Promise<void> {
  const download = await api.download(input);
  save(download);
}
