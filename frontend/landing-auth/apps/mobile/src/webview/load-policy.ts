export function isMainDocumentHttpError(errorUrl: string, currentDocumentUrl: string): boolean {
  try {
    const error = new URL(errorUrl);
    const current = new URL(currentDocumentUrl);
    error.hash = "";
    current.hash = "";
    return error.href === current.href;
  } catch {
    return false;
  }
}
