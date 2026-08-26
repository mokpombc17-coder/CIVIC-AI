import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { DOWNLOAD_ORIGINS, IS_DEVELOPMENT } from "../config/runtime";

type DownloadRequest = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

export async function downloadAndShareFile(request: DownloadRequest): Promise<string> {
  const url = new URL(request.url);
  if (!DOWNLOAD_ORIGINS.has(url.origin)) {
    throw new Error("Downloads are only allowed from configured origins.");
  }

  if (!IS_DEVELOPMENT && url.protocol !== "https:") {
    throw new Error("Downloads require HTTPS in production.");
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("The system file sharing interface is unavailable.");
  }

  const directory = new Directory(Paths.cache, "web-downloads");
  directory.create({ idempotent: true, intermediates: true });

  const fileName = sanitizeFileName(request.fileName ?? inferFileName(url));
  const destination = new File(directory, fileName);

  try {
    const file = await File.downloadFileAsync(url.toString(), destination, {
      idempotent: true,
    });
    await Sharing.shareAsync(file.uri, {
      dialogTitle: `Save ${fileName}`,
      mimeType: request.mimeType,
    });
    return fileName;
  } finally {
    if (destination.exists) {
      destination.delete();
    }
  }
}

export function sanitizeFileName(value: string): string {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);

  return sanitized || "download";
}

function inferFileName(url: URL): string {
  const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
  if (!lastSegment) {
    return "download";
  }

  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}
