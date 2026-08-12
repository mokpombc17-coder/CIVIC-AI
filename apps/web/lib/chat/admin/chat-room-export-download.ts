"use client";

import type { ChatRoomExportDownload } from "./chat-room-export-contracts";

type DownloadAnchor = Pick<HTMLAnchorElement, "click" | "download" | "hidden" | "href" | "remove">;

export type ChatRoomExportDownloadEnvironment = Readonly<{
  appendAnchor(anchor: DownloadAnchor): void;
  createAnchor(): DownloadAnchor;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
}>;

export function saveChatRoomExport(
  download: Pick<ChatRoomExportDownload, "blob" | "filename">,
  environment: ChatRoomExportDownloadEnvironment = browserDownloadEnvironment,
): void {
  const objectUrl = environment.createObjectUrl(download.blob);
  const anchor = environment.createAnchor();

  try {
    anchor.href = objectUrl;
    anchor.download = download.filename;
    anchor.hidden = true;
    environment.appendAnchor(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    environment.revokeObjectUrl(objectUrl);
  }
}

const browserDownloadEnvironment: ChatRoomExportDownloadEnvironment = {
  appendAnchor: (anchor) => document.body.append(anchor as HTMLAnchorElement),
  createAnchor: () => document.createElement("a"),
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
};
