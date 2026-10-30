import type { ChatRoomExportApi } from "./chat-room-export-api";
import type { ChatRoomExportInput } from "./chat-room-export-contracts";

export async function downloadAndSaveRoomChatExport({
  api,
  input,
  save,
  shouldSave = () => true,
}: Readonly<{
  api: Pick<ChatRoomExportApi, "download">;
  input: ChatRoomExportInput;
  save: (download: Awaited<ReturnType<ChatRoomExportApi["download"]>>) => void;
  shouldSave?: () => boolean;
}>): Promise<boolean> {
  const download = await api.download(input);

  if (!shouldSave()) {
    return false;
  }

  save(download);
  return true;
}
