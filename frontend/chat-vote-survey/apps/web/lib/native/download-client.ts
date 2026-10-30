"use client";

import { isNativeShell, requestNativeDownload, requestNativeResponse } from "./bridge-client";

export async function downloadFile(input: {
  url: string;
  fileName?: string;
  mimeType?: string;
}): Promise<void> {
  if (!isNativeShell()) {
    const link = document.createElement("a");
    link.href = input.url;
    link.download = input.fileName ?? "";
    link.rel = "noreferrer";
    link.click();
    return;
  }

  const response = await requestNativeResponse(
    () => requestNativeDownload(input),
    ["DOWNLOAD_RESULT"],
  );
  if (response.type !== "DOWNLOAD_RESULT") {
    throw new Error(`Unexpected native download response: ${response.type}`);
  }
}
