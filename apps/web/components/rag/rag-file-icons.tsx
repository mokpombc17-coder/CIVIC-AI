export type RagFileKind = "pdf" | "sheet" | "image" | "slide" | "doc" | "hwp" | "text" | "file";

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
  "application/x-hwp": "hwp",
  "application/hwp+zip": "hwp",
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
  hwp: "hwp",
  hwpx: "hwp",
};

const KIND_LABELS: Readonly<Record<RagFileKind, string>> = {
  pdf: "PDF",
  sheet: "XLS",
  image: "IMG",
  slide: "PPT",
  doc: "DOC",
  hwp: "HWP",
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

const KIND_COLORS: Readonly<Record<RagFileKind, string>> = {
  pdf: "#d3402e",
  sheet: "#1e8e4d",
  image: "#8143d6",
  slide: "#e07020",
  doc: "#2f6fe4",
  hwp: "#0d90a6",
  text: "#64707c",
  file: "#64707c",
};

/** 표시용 확장자 라벨 — 실제 확장자를 우선하고, 없으면 종류 라벨을 쓴다. */
export function ragFileBadgeText(filename?: string, mediaType?: string): string {
  const extension = filename?.toLowerCase().split(".").pop() ?? "";
  if (extension && extension.length <= 4 && EXTENSION_KINDS[extension]) {
    return extension.toUpperCase();
  }
  return ragFileKindLabel(ragFileKind(filename, mediaType));
}

/** 실제 파일 아이콘 형태(종이 + 접힌 모서리 + 확장자 밴드)의 문서 타입 아이콘. */
export function RagFileTile({
  filename,
  mediaType,
}: Readonly<{ filename?: string | undefined; mediaType?: string | undefined }>) {
  const kind = ragFileKind(filename, mediaType);
  const color = KIND_COLORS[kind];
  return (
    <svg aria-hidden="true" className="civic-file-icon" viewBox="0 0 30 38">
      <path
        d="M4 3.5A2.5 2.5 0 0 1 6.5 1H19l7 7v26.5a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 4 34.5z"
        fill="#fff"
        stroke="#c8cfd6"
        strokeWidth="1"
      />
      <path
        d="M19 1v5.5A1.5 1.5 0 0 0 20.5 8H26z"
        fill="#e4e9ee"
        stroke="#c8cfd6"
        strokeWidth="1"
      />
      <path d="M8 14h11M8 18h14M8 22h14" stroke="#d7dde3" strokeLinecap="round" strokeWidth="1.6" />
      <rect fill={color} height="11" rx="2.4" width="26" x="1" y="24" />
      <text
        fill="#fff"
        fontFamily="var(--wf-font)"
        fontSize={ragFileBadgeText(filename, mediaType).length > 3 ? 7.4 : 8.6}
        fontWeight="800"
        letterSpacing="0.3"
        textAnchor="middle"
        x="14"
        y="32.6"
      >
        {ragFileBadgeText(filename, mediaType)}
      </text>
    </svg>
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
