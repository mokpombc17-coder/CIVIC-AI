"use client";

import {
  isNativeShell,
  requestNativeContext,
  requestNativeDownload,
  requestNativeResponse,
} from "./bridge-client";

export const AUTHENTICATED_DOWNLOAD_UNSUPPORTED = "AUTHENTICATED_DOWNLOAD_UNSUPPORTED";

export async function downloadFile(input: {
  url: string;
  fileName?: string;
  mimeType?: string;
  requiresAuthentication?: boolean;
}): Promise<void> {
  if (!isNativeShell()) {
    const link = document.createElement("a");
    link.href = input.url;
    link.download = input.fileName ?? "";
    link.rel = "noreferrer";
    link.click();
    return;
  }

  if (input.requiresAuthentication) {
    const context = await requestNativeResponse(requestNativeContext, ["NATIVE_CONTEXT"], 10_000);
    if (
      context.type !== "NATIVE_CONTEXT" ||
      !supportsAuthenticatedNativeDownload(context.payload.capabilities)
    ) {
      throw new Error(AUTHENTICATED_DOWNLOAD_UNSUPPORTED);
    }
  }

  const response = await requestNativeResponse(
    () => requestNativeDownload(input),
    ["DOWNLOAD_RESULT"],
  );
  if (response.type !== "DOWNLOAD_RESULT") {
    throw new Error(`Unexpected native download response: ${response.type}`);
  }
}

export function supportsAuthenticatedNativeDownload(capabilities: readonly string[]): boolean {
  return capabilities.includes("authenticated-download");
}
