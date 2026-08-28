export type RagFileKind = "pdf" | "sheet" | "image" | "slide" | "doc" | "text" | "file";

const MEDIA_TYPE_KINDS: Readonly<Record<string, RagFileKind>> = {
  "application/pdf": "pdf",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "sheet",
  "application/vnd.ms-excel": "sheet",
  "application/vnd.oasis.opendocument.spreadsheet": "sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "slide",
  "application/vnd.ms-powerpoint": "slide",
  "application/x-hwp": "doc",
  "application/hwp+zip": "doc",
};

const EXTENSION_KINDS: Readonly<Record<string, RagFileKind>> = {
  pdf: "pdf",
  txt: "text",
  md: "text",
  csv: "sheet",
  xlsx: "sheet",
  xls: "sheet",
  ods: "sheet",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  bmp: "image",
  tiff: "image",
  webp: "image",
  pptx: "slide",
  ppt: "slide",
  docx: "doc",
  doc: "doc",
  hwp: "doc",
  hwpx: "doc",
};

const KIND_LABELS: Readonly<Record<RagFileKind, string>> = {
  pdf: "PDF",
  sheet: "XLS",
  image: "IMG",
  slide: "PPT",
  doc: "DOC",
  text: "TXT",
  file: "FILE",
};

export function ragFileKind(filename?: string, mediaType?: string): RagFileKind {
  if (mediaType) {
    const byType = MEDIA_TYPE_KINDS[mediaType];
    if (byType) return byType;
    if (mediaType.startsWith("image/")) return "image";
  }
  const extension = filename?.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_KINDS[extension] ?? "file";
}

export function ragFileKindLabel(kind: RagFileKind): string {
  return KIND_LABELS[kind];
}

/** 파일 타입 타일 — 문서 목록·업로드 큐에서 파일 종류를 한눈에 보여준다. */
export function RagFileTile({
  filename,
  mediaType,
}: Readonly<{ filename?: string | undefined; mediaType?: string | undefined }>) {
  const kind = ragFileKind(filename, mediaType);
  return (
    <span aria-hidden="true" className="civic-file-tile" data-kind={kind}>
      {ragFileKindLabel(kind)}
    </span>
  );
}

/** 폴더 트리 아이콘 — 프로젝트 공통 stroke 스타일. */
export function RagFolderIcon({ root = false }: Readonly<{ root?: boolean }>) {
  return (
    <svg aria-hidden="true" className="civic-folder-icon" fill="none" viewBox="0 0 18 18">
      <path
        d="M2.2 4.4c0-.66.54-1.2 1.2-1.2h3.3l1.7 1.8h6.2c.66 0 1.2.54 1.2 1.2v7.4c0 .66-.54 1.2-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2z"
        fill={root ? "currentColor" : "none"}
        fillOpacity={root ? 0.18 : undefined}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path d="M2.2 7.3h13.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** 트리 펼침 chevron — aria-expanded 상태에 따라 CSS로 회전한다. */
export function RagTreeChevron() {
  return (
    <svg aria-hidden="true" className="civic-tree-chevron" fill="none" viewBox="0 0 16 16">
      <path
        d="m6 4 4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
