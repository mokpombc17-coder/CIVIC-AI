"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { sha256 as createSha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { RagFileTile, RagFolderIcon, RagTrashIcon, RagTreeChevron } from "./rag-file-icons";
import { adminUserLabel, requestAdminUserLabels } from "@/lib/admin/user-labels";
import type { ScreenDefinition } from "@/lib/screens/registry";
import type { RagQuery } from "./rag-functional-screen";
import { ragScreenPrimaryActions } from "./rag-screen-actions";
import { AdminRagSpreadsheetPreview } from "./admin-rag-spreadsheet-preview";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { AuthenticatedDownloadLink } from "@/components/auth/authenticated-download-link";
import { AuthenticatedResourceFrame } from "@/components/auth/authenticated-resource-frame";

export type Folder = Readonly<{
  folder_id: string;
  parent_id: string | null;
  name: string;
  kind: "ROOT" | "GENERAL" | "NORMAL";
  depth?: number;
  path?: readonly string[];
}>;

export type DocumentVersion = Readonly<{
  document_version_id: string;
  document_id: string;
  version_number: number;
  filename: string;
  media_type: string;
  source_object_sha256: string;
  status: string;
  job_id?: string;
  source_bytes?: number;
  page_count?: number | null;
  created_at?: string;
  activated_at?: string | null;
  processing?: Readonly<{
    status?: string | null;
    progress?: number | null;
    failure_code?: string | null;
  }> | null;
}>;

export const MAX_RAG_UPLOAD_BYTES = 500 * 1024 * 1024;
export const RAG_UPLOAD_HASH_CHUNK_BYTES = 8 * 1024 * 1024;
export const RAG_ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".tiff",
  ".webp",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".ods",
  ".pptx",
  ".ppt",
  ".hwp",
  ".hwpx",
] as const;

const RAG_MEDIA_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  hwp: "application/x-hwp",
  hwpx: "application/hwp+zip",
};

const RAG_DOCUMENT_MEDIA_TYPE_OPTIONS = [
  ["application/pdf", "PDF"],
  ["text/plain", "텍스트"],
  ["text/markdown", "Markdown"],
  ["text/csv", "CSV"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel(XLSX)"],
  ["application/vnd.ms-excel", "Excel(XLS)"],
  ["application/vnd.oasis.opendocument.spreadsheet", "ODS"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word(DOCX)"],
  ["application/msword", "Word(DOC)"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "PowerPoint"],
  ["application/vnd.ms-powerpoint", "PowerPoint(PPT)"],
  ["application/x-hwp", "한글(HWP)"],
  ["application/hwp+zip", "한글(HWPX)"],
  ["image/png", "PNG 이미지"],
  ["image/jpeg", "JPEG 이미지"],
  ["image/gif", "GIF 이미지"],
  ["image/bmp", "BMP 이미지"],
  ["image/tiff", "TIFF 이미지"],
  ["image/webp", "WebP 이미지"],
] as const;

export type RagDocument = Readonly<{
  document_id: string;
  folder_id: string;
  filename: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  deleted: boolean;
  search_enabled?: boolean;
  active_version: DocumentVersion | null;
}>;

export type RagDocumentPageState = Readonly<{
  page: number;
  pageSize: 10 | 25 | 50;
  total: number;
  totalPages: number;
  statusCounts: Readonly<Record<string, number>>;
}>;

export type RagDocumentListQuery = Readonly<{
  page: number;
  pageSize: 10 | 25 | 50;
  query: string;
  status: "" | "PENDING" | "PROCESSING" | "ACTIVE" | "FAILED";
  mediaType?: string;
  createdBy?: string;
  createdFrom?: string;
  createdTo?: string;
  includeSubfolders: boolean;
  sort: "created_at" | "filename" | "source_bytes" | "page_count" | "version_number" | "status";
  direction: "asc" | "desc";
}>;

export type RagBulkActionInput = Readonly<{
  action: "SET_SEARCH_ENABLED" | "MOVE" | "REINDEX" | "CANCEL" | "DELETE";
  documentIds: readonly string[];
  folderId?: string;
  searchEnabled?: boolean;
}>;

export type RagBulkActionResponse = Readonly<{
  action: RagBulkActionInput["action"];
  succeeded: number;
  failed: number;
  items: readonly Readonly<{
    document_id: string;
    status: "SUCCEEDED" | "FAILED";
    job_id?: string;
    job_status?: string;
    message?: string;
  }>[];
}>;

export function successfulBulkJobId(
  result: RagBulkActionResponse,
  documentId: string,
): string | null {
  const jobId = result.items.find(
    (item) => item.document_id === documentId && item.status === "SUCCEEDED",
  )?.job_id;
  return typeof jobId === "string" && jobId.length > 0 ? jobId : null;
}

const DEFAULT_DOCUMENT_QUERY: RagDocumentListQuery = {
  page: 1,
  pageSize: 25,
  query: "",
  status: "",
  includeSubfolders: false,
  sort: "created_at",
  direction: "desc",
};

const EMPTY_DOCUMENT_PAGE: RagDocumentPageState = {
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 0,
  statusCounts: {},
};

export function buildRagDocumentListPath(folderId: string, query: RagDocumentListQuery): string {
  const parameters = new URLSearchParams({
    folder_id: folderId,
    include_subfolders: String(query.includeSubfolders),
    page: String(query.page),
    page_size: String(query.pageSize),
  });
  if (query.query) parameters.set("query", query.query);
  if (query.status) parameters.set("status", query.status);
  if (query.mediaType) parameters.set("media_type", query.mediaType);
  if (query.createdBy) parameters.set("created_by", query.createdBy);
  if (query.createdFrom) parameters.set("created_from", `${query.createdFrom}T00:00:00.000Z`);
  if (query.createdTo) parameters.set("created_to", `${query.createdTo}T23:59:59.999Z`);
  parameters.set("sort", query.sort);
  parameters.set("direction", query.direction);
  return `/api/v1/rag/documents?${parameters.toString()}`;
}

export async function requestRagBulkAction(
  input: RagBulkActionInput,
  request: typeof fetch = authenticatedFetch,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<RagBulkActionResponse> {
  const response = await request("/api/v1/rag/documents/bulk", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      action: input.action,
      document_ids: input.documentIds,
      ...(input.folderId ? { folder_id: input.folderId } : {}),
      ...(input.searchEnabled === undefined ? {} : { search_enabled: input.searchEnabled }),
    }),
  });
  if (!response.ok) throw new Error("bulk document request failed");
  const body = (await response.json()) as RagBulkActionResponse;
  if (!Array.isArray(body.items) || typeof body.succeeded !== "number") {
    throw new Error("bulk document response is invalid");
  }
  return body;
}

export type RagJob = Readonly<{
  job_id: string;
  status: string;
  progress?: number;
  failure_code?: string;
  filename?: string;
}>;

const TERMINAL_RAG_JOB_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

export function shouldPollRagJob(status: string | undefined, hidden: boolean): boolean {
  return !hidden && !TERMINAL_RAG_JOB_STATES.has(status ?? "");
}

export function hasActiveRagDocuments(documents: readonly RagDocument[]): boolean {
  return documents.some((document) => {
    const status = document.active_version?.status;
    return (
      status === undefined ||
      ["PENDING", "PROCESSING", "QUEUED", "RUNNING", "RETRY_WAIT"].includes(status)
    );
  });
}

export type RagDocumentSelection = Readonly<{
  documentId: string;
  version: DocumentVersion | null;
}>;

export function AdminRagScreen({
  screen,
  query,
}: Readonly<{ screen: ScreenDefinition; query: RagQuery }>) {
  const router = useRouter();
  const folderId = firstQueryValue(query.folderId);
  const retryJobId = firstQueryValue(query.retryJobId);
  const retryFilename = firstQueryValue(query.filename);
  const {
    folders,
    documents,
    creatorLabels,
    selectedFolder,
    selectFolder,
    refresh,
    refreshDocuments,
    pageState,
    queryDocuments,
    runBulk,
    message,
    setMessage,
  } = useAdminWorkspace(folderId);
  const hasActiveDocuments = hasActiveRagDocuments(documents);
  useEffect(() => {
    if (!hasActiveDocuments) return;
    const update = () => {
      if (!document.hidden) refreshDocuments();
    };
    const timer = window.setInterval(update, 4_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [hasActiveDocuments, refreshDocuments]);
  const [documentSelection, setDocumentSelection] = useState<RagDocumentSelection>();
  const inspected = resolveInspectedRagDocument(documents, documentSelection);
  const action = ragScreenPrimaryActions[screen.id];
  const folderMode = resolveFolderEditorMode(firstQueryValue(query.mode));
  const folderDialogKey = ragFolderDialogKey(folderMode, folderId);
  const [completedFolderDialog, setCompletedFolderDialog] = useState<string>();
  const deleteReturnHref = ragWorkspaceHref(selectedFolder?.folder_id ?? folderId);

  if (screen.id === "A-RAG-004") {
    return (
      <ScreenFrame
        screen={screen}
        title={
          retryJobId
            ? `${retryFilename ?? "실패 문서"} 재처리`
            : selectedFolder
              ? `${selectedFolder.name} 폴더에 문서 업로드`
              : "선택 폴더에 문서 업로드"
        }
      >
        <div className="wf-rag-task-page" data-wireflow-layout="rag-upload">
          <p className="civic-breadcrumb">
            {retryJobId ? (
              <>문서 / 실패 작업 재처리</>
            ) : (
              <>
                문서 /{" "}
                {ragFolderAncestorPath(folders, selectedFolder)
                  .map((name) => `${name} / `)
                  .join("")}
                {selectedFolder?.name ?? "선택 폴더"}
              </>
            )}
          </p>
          <section className="wf-rag-task-card">
            <header className="wf-rag-task-heading">
              <h2>{retryJobId ? "실패 문서 재처리" : "파일 선택"}</h2>
            </header>
            {retryJobId ? (
              <AutomaticRagJobRetryPanel
                jobId={retryJobId}
                key={retryJobId}
                {...(retryFilename ? { filename: retryFilename } : {})}
              />
            ) : (
              <UploadPanel folder={selectedFolder} onMessage={setMessage} query={query} />
            )}
          </section>
          {message ? (
            <p aria-live="polite" className="civic-form-message">
              {message}
            </p>
          ) : null}
          <span className="civic-screen-action-label">{action}</span>
        </div>
      </ScreenFrame>
    );
  }

  if (screen.id === "A-RAG-005") {
    return (
      <ScreenFrame screen={screen}>
        <div className="wf-rag-task-page" data-wireflow-layout="rag-job-status">
          <section className="wf-rag-task-card">
            <header className="wf-rag-task-heading">
              <h2>업로드한 문서</h2>
              <p>문서가 검색과 AI 답변에 사용될 준비 상태를 확인합니다.</p>
            </header>
            <JobPanel key={jobPanelKey(queryValues(query.jobId))} query={query} />
          </section>
          <span className="civic-screen-action-label">{action}</span>
        </div>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame screen={screen}>
      <div className="civic-rag-admin-layout" data-wireflow-layout="rag-workspace">
        <FolderTree
          folders={folders}
          onSelect={selectFolder}
          selectedFolderId={selectedFolder?.folder_id}
        />
        <section className="civic-rag-admin-workspace">
          <WorkspaceHeading folder={selectedFolder} />
          <details className="civic-inline-upload" data-rag-inline-upload="true">
            <summary>
              <span>
                <strong>문서 업로드</strong>
              </span>
              <span aria-hidden="true" className="civic-inline-upload-toggle">
                파일 등록
              </span>
            </summary>
            <div className="civic-inline-upload-body">
              <UploadPanel
                folder={selectedFolder}
                inline
                onAccepted={refreshDocuments}
                onMessage={setMessage}
                query={{ mode: "NEW_DOCUMENT" }}
              />
            </div>
          </details>
          <DocumentWorkspace
            compact={screen.id !== "A-RAG-003"}
            creatorLabels={creatorLabels}
            documents={documents}
            folder={selectedFolder}
            folders={folders}
            onBulk={runBulk}
            onInspect={(document, version) =>
              setDocumentSelection({ documentId: document.document_id, version })
            }
            selectedDocumentId={inspected.document?.document_id}
            onQueryChange={queryDocuments}
            pageState={pageState}
          />
          {message ? (
            <p aria-live="polite" className="civic-form-message">
              {message}
            </p>
          ) : null}
          <span className="civic-screen-action-label">{action}</span>
        </section>
      </div>
      {inspected.document ? (
        <DocumentInspector
          creatorLabel={adminUserLabel(creatorLabels, inspected.document.created_by)}
          document={inspected.document}
          onClose={() => setDocumentSelection(undefined)}
          version={inspected.version}
        />
      ) : null}
      {shouldRenderRagFolderDialog(screen.id, folderMode, folderId, completedFolderDialog) ? (
        <AdminRagModal
          closeHref={ragWorkspaceHref(selectedFolder?.folder_id ?? folderId)}
          title={
            folderMode === "ADD"
              ? "폴더 추가"
              : folderMode === "DELETE"
                ? "폴더 삭제 확인"
                : "폴더 수정"
          }
        >
          <FolderEditor
            cancelHref={ragWorkspaceHref(selectedFolder?.folder_id ?? folderId)}
            documentCount={pageState.total}
            folder={selectedFolder}
            parentName={
              folderMode === "ADD"
                ? (selectedFolder?.name ?? "문서")
                : (ragFolderAncestorPath(folders, selectedFolder).at(-1) ?? "문서")
            }
            key={`${folderMode}-${selectedFolder?.folder_id ?? "new-folder"}`}
            mode={folderMode}
            onComplete={() => {
              setCompletedFolderDialog(folderDialogKey);
              if (folderMode === "DELETE") {
                router.replace(ragWorkspaceHref(selectedFolder?.parent_id ?? undefined));
                return;
              }
              refresh();
            }}
            onMessage={setMessage}
          />
        </AdminRagModal>
      ) : null}
      {screen.id === "A-RAG-006" ? (
        <AdminRagModal closeHref={deleteReturnHref} title="문서를 삭제하시겠습니까?">
          <DeletePanel
            documents={documents}
            onComplete={() => {
              refresh();
              router.replace(deleteReturnHref);
            }}
            onMessage={setMessage}
            query={query}
          />
        </AdminRagModal>
      ) : null}
    </ScreenFrame>
  );
}

function AdminRagModal({
  children,
  closeHref,
  title,
}: Readonly<{ children: ReactNode; closeHref: Route; title: string }>) {
  return (
    <div className="wf-admin-overlay" data-wireflow-layout="rag-admin-modal">
      <div aria-hidden="true" className="wf-admin-scrim" />
      <section
        aria-labelledby="wf-rag-admin-dialog-title"
        aria-modal="true"
        className="wf-rag-admin-dialog"
        role="dialog"
      >
        <header>
          <h2 id="wf-rag-admin-dialog-title">{title}</h2>
          <Link aria-label={`${title} 닫기`} href={closeHref}>
            ×
          </Link>
        </header>
        {children}
      </section>
    </div>
  );
}

function useAdminWorkspace(initialFolderId?: string) {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [creatorLabels, setCreatorLabels] = useState<Map<string, string>>(new Map());
  const [pageState, setPageState] = useState<RagDocumentPageState>(EMPTY_DOCUMENT_PAGE);
  const [selectedId, setSelectedId] = useState(initialFolderId);
  const selectedIdRef = useRef(initialFolderId);
  const foldersRef = useRef<Folder[]>([]);
  const loadGateRef = useRef(createLatestRequestGate());
  const documentRefreshInFlightRef = useRef<symbol | undefined>(undefined);
  const documentQueryRef = useRef<RagDocumentListQuery>(DEFAULT_DOCUMENT_QUERY);
  const creatorIdsKeyRef = useRef("");
  const bulkOperationRef = useRef(createRetryOperation());
  const [message, setMessage] = useState("");

  const loadDocuments = useCallback(
    async (
      folderId: string,
      query: RagDocumentListQuery,
      isCurrent: () => boolean,
      clearMessageOnSuccess: boolean,
    ) => {
      const documentResponse = await authenticatedFetch(buildRagDocumentListPath(folderId, query), {
        cache: "no-store",
      });
      if (!isCurrent()) return;
      if (!documentResponse.ok) throw new Error("document request failed");
      const documentData = (await documentResponse.json()) as {
        items?: unknown;
        page?: unknown;
        page_size?: unknown;
        total?: unknown;
        total_pages?: unknown;
        status_counts?: unknown;
      };
      if (!Array.isArray(documentData.items)) throw new Error("document response is invalid");
      if (!isCurrent()) return;
      const nextDocuments = documentData.items as RagDocument[];
      const nextCreatorIds = [
        ...new Set(
          nextDocuments.flatMap((document) => (document.created_by ? [document.created_by] : [])),
        ),
      ].sort();
      const nextCreatorIdsKey = nextCreatorIds.join("\u0000");
      const labels =
        nextCreatorIdsKey === creatorIdsKeyRef.current
          ? undefined
          : await requestAdminUserLabels(nextCreatorIds);
      if (!isCurrent()) return;

      setDocuments(nextDocuments);
      setPageState({
        page: typeof documentData.page === "number" ? documentData.page : query.page,
        pageSize:
          documentData.page_size === 10 ||
          documentData.page_size === 25 ||
          documentData.page_size === 50
            ? documentData.page_size
            : query.pageSize,
        total: typeof documentData.total === "number" ? documentData.total : nextDocuments.length,
        totalPages:
          typeof documentData.total_pages === "number"
            ? documentData.total_pages
            : nextDocuments.length > 0
              ? 1
              : 0,
        statusCounts:
          documentData.status_counts && typeof documentData.status_counts === "object"
            ? (documentData.status_counts as Record<string, number>)
            : {},
      });
      if (labels !== undefined && labels !== null) {
        creatorIdsKeyRef.current = nextCreatorIdsKey;
        setCreatorLabels(labels);
      }
      if (clearMessageOnSuccess) setMessage("");
    },
    [],
  );

  const load = useCallback(
    async (folderOverride?: string, queryOverride?: RagDocumentListQuery) => {
      documentRefreshInFlightRef.current = undefined;
      const isCurrent = loadGateRef.current.begin();
      try {
        const folderResponse = await authenticatedFetch("/api/v1/rag/folders", {
          cache: "no-store",
        });
        if (!isCurrent()) return;
        if (!folderResponse.ok) throw new Error("folder request failed");
        const folderData = (await folderResponse.json()) as { items?: unknown };
        if (!Array.isArray(folderData.items)) throw new Error("folder response is invalid");
        const nextFolders = folderData.items as Folder[];
        if (!isCurrent()) return;
        const nextSelected = resolveWorkspaceFolderId(
          nextFolders,
          foldersRef.current,
          folderOverride ?? selectedIdRef.current,
        );
        foldersRef.current = nextFolders;
        setFolders(nextFolders);
        setSelectedId(nextSelected);
        selectedIdRef.current = nextSelected;
        setDocuments([]);
        setCreatorLabels(new Map());
        creatorIdsKeyRef.current = "";
        if (!nextSelected) {
          setMessage("");
          setPageState(EMPTY_DOCUMENT_PAGE);
          return;
        }
        const nextQuery = queryOverride ?? documentQueryRef.current;
        documentQueryRef.current = nextQuery;
        await loadDocuments(nextSelected, nextQuery, isCurrent, true);
      } catch {
        if (!isCurrent()) return;
        setDocuments([]);
        setCreatorLabels(new Map());
        creatorIdsKeyRef.current = "";
        setPageState(EMPTY_DOCUMENT_PAGE);
        setMessage("문서 작업 공간을 불러오지 못했습니다. 다시 시도해 주세요.");
      }
    },
    [loadDocuments],
  );

  useEffect(() => {
    const loadGate = loadGateRef.current;
    const timer = window.setTimeout(() => void load(initialFolderId), 0);
    return () => {
      window.clearTimeout(timer);
      loadGate.cancel();
    };
  }, [initialFolderId, load]);

  const refresh = useCallback(() => void load(selectedIdRef.current), [load]);
  const refreshDocuments = useCallback(() => {
    const selectedFolderId = selectedIdRef.current;
    if (!selectedFolderId || documentRefreshInFlightRef.current !== undefined) return;
    const refreshToken = Symbol("document-refresh");
    documentRefreshInFlightRef.current = refreshToken;
    const isCurrent = loadGateRef.current.begin();
    void loadDocuments(selectedFolderId, documentQueryRef.current, isCurrent, false)
      .catch(() => undefined)
      .finally(() => {
        if (documentRefreshInFlightRef.current === refreshToken) {
          documentRefreshInFlightRef.current = undefined;
        }
      });
  }, [loadDocuments]);

  return {
    folders,
    documents,
    creatorLabels,
    selectedFolder: folders.find((folder) => folder.folder_id === selectedId),
    selectFolder: (id: string) => {
      const nextQuery = { ...documentQueryRef.current, page: 1 };
      documentQueryRef.current = nextQuery;
      void load(id, nextQuery);
    },
    refresh,
    refreshDocuments,
    pageState,
    queryDocuments: (patch: Partial<RagDocumentListQuery>) => {
      const nextQuery = { ...documentQueryRef.current, ...patch };
      documentQueryRef.current = nextQuery;
      void load(selectedIdRef.current, nextQuery);
    },
    runBulk: async (input: RagBulkActionInput) => {
      const operationIdentity = JSON.stringify({
        ...input,
        documentIds: [...input.documentIds].sort(),
      });
      const idempotencyKey = bulkOperationRef.current.begin(operationIdentity);
      if (!idempotencyKey) return;
      try {
        const result = await requestRagBulkAction(input, fetch, idempotencyKey);
        bulkOperationRef.current.settle(true);
        const reindex = input.action === "REINDEX";
        setMessage(
          result.failed === 0
            ? reindex
              ? `${result.succeeded}개 문서 재색인을 접수했습니다. 처리 상태에서 진행 상황을 확인하세요.`
              : `${result.succeeded}개 문서 작업을 완료했습니다.`
            : `${result.succeeded}개 ${reindex ? "접수" : "완료"}, ${result.failed}개 실패했습니다. 실패 문서는 상태와 안내를 확인하세요.`,
        );
        if (reindex && result.failed === 0 && result.succeeded === 1) {
          const reindexedId = input.documentIds[0];
          const jobId = reindexedId ? successfulBulkJobId(result, reindexedId) : null;
          if (jobId) {
            router.push(ragJobHref(jobId, selectedIdRef.current));
            return;
          }
        }
        await load(selectedIdRef.current);
      } catch {
        bulkOperationRef.current.settle(false);
        setMessage("문서 작업을 전송하지 못했습니다. 네트워크 상태를 확인하고 다시 시도하세요.");
      }
    },
    message,
    setMessage,
  };
}

export function resolveWorkspaceFolderId(
  nextFolders: readonly Folder[],
  previousFolders: readonly Folder[],
  requestedId: string | undefined,
): string | undefined {
  if (requestedId && nextFolders.some((folder) => folder.folder_id === requestedId)) {
    return requestedId;
  }
  const previousParent = previousFolders.find(
    (folder) => folder.folder_id === requestedId,
  )?.parent_id;
  if (previousParent && nextFolders.some((folder) => folder.folder_id === previousParent)) {
    return previousParent;
  }
  return (
    nextFolders.find((folder) => folder.kind === "GENERAL")?.folder_id ?? nextFolders[0]?.folder_id
  );
}

export function createLatestRequestGate() {
  let generation = 0;
  return {
    begin() {
      const requestGeneration = ++generation;
      return () => requestGeneration === generation;
    },
    cancel() {
      generation += 1;
    },
  };
}

export function FolderTree({
  folders,
  selectedFolderId,
  onSelect,
}: Readonly<{
  folders: Folder[];
  selectedFolderId: string | undefined;
  onSelect: (id: string) => void;
}>) {
  const parentIds = new Set(
    folders.flatMap((folder) => (folder.parent_id ? [folder.parent_id] : [])),
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const byId = new Map(folders.map((folder) => [folder.folder_id, folder]));
  const visibleFolders = folders.filter((folder) => {
    let parentId = folder.parent_id;
    while (parentId) {
      if (collapsed.has(parentId)) return false;
      parentId = byId.get(parentId)?.parent_id ?? null;
    }
    return true;
  });
  return (
    <aside className="civic-folder-tree">
      <div className="civic-folder-tree-heading">
        <p className="civic-kicker">문서 폴더</p>
        <h2>폴더</h2>
      </div>
      <div aria-label="폴더 작업" className="civic-folder-tree-actions" role="toolbar">
        <Link
          className="civic-secondary-action civic-folder-add"
          href={`/admin/rag/folders?folderId=${encodeURIComponent(selectedFolderId ?? "")}&mode=ADD`}
        >
          폴더 추가
        </Link>
        {selectedFolderId ? (
          <>
            <Link
              aria-label="폴더 수정"
              className="civic-secondary-action"
              href={`/admin/rag/folders?folderId=${encodeURIComponent(selectedFolderId)}&mode=EDIT`}
            >
              수정
            </Link>
            <Link
              aria-label="폴더 삭제"
              className="civic-secondary-action is-danger"
              href={`/admin/rag/folders?folderId=${encodeURIComponent(selectedFolderId)}&mode=DELETE`}
            >
              삭제
            </Link>
          </>
        ) : null}
      </div>
      <ul aria-label="RAG 폴더 트리">
        {visibleFolders.map((folder) => (
          <li
            key={folder.folder_id}
            style={{ "--folder-depth": folder.depth ?? 0 } as React.CSSProperties}
          >
            {parentIds.has(folder.folder_id) ? (
              <button
                aria-expanded={!collapsed.has(folder.folder_id)}
                aria-label={`${folder.name} 하위 폴더 ${collapsed.has(folder.folder_id) ? "펼치기" : "접기"}`}
                className="civic-folder-expander"
                onClick={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(folder.folder_id)) next.delete(folder.folder_id);
                    else next.add(folder.folder_id);
                    return next;
                  })
                }
                type="button"
              >
                <RagTreeChevron />
              </button>
            ) : (
              <span aria-hidden="true" className="civic-folder-expander-placeholder" />
            )}
            <button
              aria-current={folder.folder_id === selectedFolderId ? "true" : undefined}
              onClick={() => onSelect(folder.folder_id)}
              title={(folder.path ?? [folder.name]).join(" / ")}
              type="button"
            >
              <RagFolderIcon root={folder.kind === "ROOT"} />
              <span>
                <strong>{folder.name}</strong>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function resolveInspectedRagDocument(
  documents: readonly RagDocument[],
  selection: RagDocumentSelection | undefined,
): { document: RagDocument | undefined; version: DocumentVersion | null } {
  const document = selection
    ? documents.find((candidate) => candidate.document_id === selection.documentId)
    : undefined;
  return {
    document,
    version: document && selection?.documentId === document.document_id ? selection.version : null,
  };
}

export function DocumentInspector({
  creatorLabel,
  document,
  onClose,
  version,
}: Readonly<{
  creatorLabel: string;
  document: RagDocument;
  onClose: () => void;
  version: DocumentVersion | null;
}>) {
  const filename = displayRagFilename(document.filename);
  const originalHref = version
    ? `/api/v1/rag/documents/${encodeURIComponent(document.document_id)}/versions/${encodeURIComponent(version.document_version_id)}/original`
    : undefined;
  const previewHref = version
    ? `/api/v1/rag/documents/${encodeURIComponent(document.document_id)}/versions/${encodeURIComponent(version.document_version_id)}/preview?disposition=inline`
    : undefined;
  return (
    <div className="civic-document-drawer-layer">
      <button
        aria-label="문서 미리보기 닫기"
        className="civic-document-drawer-scrim"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="civic-document-drawer-title"
        aria-modal="true"
        className="civic-document-inspector"
        role="dialog"
      >
        <header>
          <div>
            <small>문서 미리보기</small>
            <strong id="civic-document-drawer-title">{filename}</strong>
          </div>
          <button aria-label="문서 미리보기 닫기" onClick={onClose} type="button">
            ×
          </button>
        </header>
        {previewHref ? (
          <AuthenticatedResourceFrame
            className="civic-document-preview"
            src={previewHref}
            title={`${filename} 미리보기`}
          />
        ) : (
          <div className="civic-document-preview-empty">
            <strong>브라우저 미리보기를 지원하지 않는 형식입니다.</strong>
            <p>원본 열기를 이용해 문서를 확인하세요.</p>
          </div>
        )}
        <dl>
          <div>
            <dt>상태</dt>
            <dd>
              <span className="civic-status-badge">
                {documentStatusLabel(version?.status ?? "처리 대기")}
              </span>
            </dd>
          </div>
          <div>
            <dt>등록자</dt>
            <dd>{creatorLabel}</dd>
          </div>
          <div>
            <dt>등록일</dt>
            <dd>{formatAdminDate(document.created_at)}</dd>
          </div>
          <div>
            <dt>수정일</dt>
            <dd>{formatAdminDate(document.updated_at)}</dd>
          </div>
          <div>
            <dt>페이지</dt>
            <dd>{formatPageCount(version?.page_count)}</dd>
          </div>
          <div>
            <dt>파일 크기</dt>
            <dd>{formatFileSize(version?.source_bytes)}</dd>
          </div>
          <div>
            <dt>버전</dt>
            <dd>{version ? `v${version.version_number}` : "—"}</dd>
          </div>
          <div>
            <dt>검색 반영</dt>
            <dd>
              {version?.status === "ACTIVE" || version?.status === "READY" ? "사용 가능" : "—"}
            </dd>
          </div>
          <div>
            <dt>현재 처리</dt>
            <dd>{formatProcessingState(version?.processing)}</dd>
          </div>
        </dl>
        {version && isSpreadsheetMediaType(version.media_type) ? (
          <AdminRagSpreadsheetPreview
            documentId={document.document_id}
            versionId={version.document_version_id}
          />
        ) : null}
        <p>원본은 읽기 전용으로 관리되며 삭제는 별도 확인 화면에서 수행합니다.</p>
        <div className="wf-inspector-actions">
          <Link
            className="civic-secondary-action"
            href={processingJobHref(version, document?.folder_id)}
          >
            처리 상태
          </Link>
          {originalHref ? (
            <AuthenticatedDownloadLink className="civic-secondary-action" href={originalHref}>
              원본 열기
            </AuthenticatedDownloadLink>
          ) : null}
          <Link
            className="civic-danger-action"
            href={
              document
                ? `/admin/rag/delete?folderId=${encodeURIComponent(document.folder_id)}&documentId=${encodeURIComponent(document.document_id)}`
                : "/admin/rag"
            }
          >
            문서 삭제
          </Link>
        </div>
      </aside>
    </div>
  );
}

function WorkspaceHeading({ folder }: Readonly<{ folder: Folder | undefined }>) {
  // 마지막 요소는 제목과 중복이므로 상위 경로만 표시한다.
  const ancestors = (folder?.path ?? []).slice(0, -1);
  return (
    <header className="civic-rag-workspace-heading">
      <div>
        {ancestors.length > 0 ? <p className="civic-breadcrumb">{ancestors.join(" / ")}</p> : null}
        <h2>{folder?.name ?? "문서 작업 공간"}</h2>
      </div>
    </header>
  );
}

export function DocumentWorkspace({
  documents,
  folder,
  folders = [],
  creatorLabels = new Map(),
  compact = false,
  onInspect,
  onQueryChange,
  onBulk,
  pageState = EMPTY_DOCUMENT_PAGE,
  selectedDocumentId,
}: Readonly<{
  documents: RagDocument[];
  folder: Folder | undefined;
  folders?: Folder[];
  creatorLabels?: ReadonlyMap<string, string>;
  compact?: boolean;
  onInspect: (document: RagDocument, version: DocumentVersion | null) => void;
  onQueryChange?: (query: Partial<RagDocumentListQuery>) => void;
  onBulk?: (input: RagBulkActionInput) => void | Promise<void>;
  pageState?: RagDocumentPageState;
  selectedDocumentId: string | undefined;
}>) {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>("ALL");
  const [mediaTypeFilter, setMediaTypeFilter] = useState("");
  const [createdByFilter, setCreatedByFilter] = useState("");
  const [includeSubfolders, setIncludeSubfolders] = useState(false);
  const [selection, setSelection] = useState<
    Readonly<{
      scopeKey: string;
      ids: ReadonlySet<string>;
    }>
  >(() => ({ scopeKey: "", ids: new Set() }));
  const [moveFolderId, setMoveFolderId] = useState("");
  const visibleDocuments = onQueryChange
    ? documents
    : filterRagDocuments(documents, searchQuery, statusFilter);
  const visibleDocumentIdsKey = visibleDocuments
    .map((document) => document.document_id)
    .join("\u0000");
  const selectionScopeKey = [
    folder?.folder_id ?? "",
    pageState.page,
    pageState.pageSize,
    searchQuery,
    statusFilter,
    mediaTypeFilter,
    createdByFilter,
    includeSubfolders,
    visibleDocumentIdsKey,
  ].join("\u0001");
  const selectedIds = selection.scopeKey === selectionScopeKey ? selection.ids : new Set<string>();
  const allSelected =
    visibleDocuments.length > 0 &&
    visibleDocuments.every((document) => selectedIds.has(document.document_id));
  const selectedDocumentIds = Array.from(selectedIds);

  function replaceSelectedIds(ids: ReadonlySet<string>) {
    setSelection({ scopeKey: selectionScopeKey, ids });
  }

  function updateSelectedIds(update: (current: ReadonlySet<string>) => ReadonlySet<string>) {
    setSelection((current) => ({
      scopeKey: selectionScopeKey,
      ids: update(current.scopeKey === selectionScopeKey ? current.ids : new Set()),
    }));
  }

  function submitBulk(input: Omit<RagBulkActionInput, "documentIds">) {
    if (selectedDocumentIds.length === 0) return;
    void onBulk?.({ ...input, documentIds: selectedDocumentIds });
  }

  return (
    <div className="civic-document-ledger">
      <div className="civic-ledger-summary">
        <strong>{pageState.total.toLocaleString("ko-KR")}개 문서</strong>
        <span>
          {includeSubfolders ? "하위 폴더 포함" : "선택 폴더만 표시"} · 처리 완료{" "}
          {(pageState.statusCounts.ACTIVE ?? 0).toLocaleString("ko-KR")}개
        </span>
      </div>
      <form
        className="wf-document-filters"
        onSubmit={(event) => {
          event.preventDefault();
          const query = searchInput.trim();
          setSearchQuery(query);
          onQueryChange?.({ query, page: 1 });
        }}
      >
        <label>
          <span className="sr-only">문서명 검색</span>
          <input
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="문서명 검색..."
            type="search"
            value={searchInput}
          />
        </label>
        <button className="civic-secondary-action" type="submit">
          검색
        </button>
        <label>
          <span>처리 상태</span>
          <select
            onChange={(event) => {
              const next = event.target.value as DocumentStatusFilter;
              setStatusFilter(next);
              onQueryChange?.({ status: documentStatusQuery(next), page: 1 });
            }}
            value={statusFilter}
          >
            <option value="ALL">전체</option>
            <option value="READY">처리 완료</option>
            <option value="PROCESSING">처리 중</option>
            <option value="FAILED">실패</option>
          </select>
        </label>
        <label>
          <span>페이지당</span>
          <select
            aria-label="문서 목록 페이지당 표시 개수"
            onChange={(event) =>
              onQueryChange?.({ pageSize: Number(event.target.value) as 10 | 25 | 50, page: 1 })
            }
            value={pageState.pageSize}
          >
            <option value={10}>10개</option>
            <option value={25}>25개</option>
            <option value={50}>50개</option>
          </select>
        </label>
        <details className="wf-filter-advanced">
          <summary>상세 필터</summary>
          <div className="wf-filter-advanced-grid">
            <label>
              <span>문서 형식</span>
              <select
                onChange={(event) => {
                  setMediaTypeFilter(event.target.value);
                  onQueryChange?.({ mediaType: event.target.value, page: 1 });
                }}
                value={mediaTypeFilter}
              >
                <option value="">전체</option>
                {RAG_DOCUMENT_MEDIA_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>등록자</span>
              <select
                onChange={(event) => {
                  setCreatedByFilter(event.target.value);
                  onQueryChange?.({ createdBy: event.target.value, page: 1 });
                }}
                value={createdByFilter}
              >
                <option value="">전체</option>
                {Array.from(creatorLabels.entries()).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="civic-check-row">
              <input
                checked={includeSubfolders}
                onChange={(event) => {
                  setIncludeSubfolders(event.target.checked);
                  onQueryChange?.({ includeSubfolders: event.target.checked, page: 1 });
                }}
                type="checkbox"
              />
              <span>하위 폴더 포함</span>
            </label>
          </div>
        </details>
      </form>
      <div aria-label="선택 문서 작업" className="civic-bulk-toolbar" role="toolbar">
        <strong>{selectedIds.size}개 선택</strong>
        <button
          disabled={selectedIds.size === 0}
          onClick={() => submitBulk({ action: "REINDEX" })}
          type="button"
        >
          선택 문서 재색인
        </button>
        <button
          disabled={selectedIds.size === 0}
          onClick={() => submitBulk({ action: "CANCEL" })}
          type="button"
        >
          처리 중단
        </button>
        <button
          disabled={selectedIds.size === 0}
          onClick={() => submitBulk({ action: "SET_SEARCH_ENABLED", searchEnabled: false })}
          type="button"
        >
          검색 제외
        </button>
        <select
          aria-label="선택 문서 이동 대상 폴더"
          onChange={(event) => setMoveFolderId(event.target.value)}
          value={moveFolderId}
        >
          <option value="">이동할 폴더 선택</option>
          {folders
            .filter((candidate) => candidate.folder_id !== folder?.folder_id)
            .map((candidate) => (
              <option key={candidate.folder_id} value={candidate.folder_id}>
                {(candidate.path ?? [candidate.name]).join(" / ")}
              </option>
            ))}
        </select>
        <button
          disabled={selectedIds.size === 0 || !moveFolderId}
          onClick={() => submitBulk({ action: "MOVE", folderId: moveFolderId })}
          type="button"
        >
          선택 문서 이동
        </button>
        <button
          className="is-danger"
          disabled={selectedIds.size === 0}
          onClick={() => submitBulk({ action: "DELETE" })}
          type="button"
        >
          삭제
        </button>
      </div>
      {documents.length === 0 ? (
        <div className="civic-admin-empty">
          <strong>이 폴더에는 문서가 없습니다.</strong>
          <p>PDF·텍스트·이미지·Office·한글 문서를 올리면 변환과 색인이 시작됩니다.</p>
        </div>
      ) : visibleDocuments.length === 0 ? (
        <div className="civic-admin-empty">
          <strong>검색 조건에 맞는 문서가 없습니다.</strong>
          <p>문서명 또는 처리 상태를 변경해 다시 확인해 주세요.</p>
        </div>
      ) : (
        <div
          aria-label="RAG 작업 목록 표"
          className="civic-table-scroll"
          role="region"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    aria-label="현재 페이지 문서 전체 선택"
                    checked={allSelected}
                    onChange={(event) =>
                      replaceSelectedIds(
                        event.target.checked
                          ? new Set(visibleDocuments.map((document) => document.document_id))
                          : new Set(),
                      )
                    }
                    type="checkbox"
                  />
                </th>
                <th>문서명</th>
                <th>등록자</th>
                <th>
                  <button
                    className="civic-sort-button"
                    onClick={() =>
                      onQueryChange?.({
                        sort: "created_at",
                        direction: DEFAULT_DOCUMENT_QUERY.direction === "desc" ? "asc" : "desc",
                        page: 1,
                      })
                    }
                    type="button"
                  >
                    등록일 ↓
                  </button>
                </th>
                <th>페이지</th>
                <th>처리 상태</th>
                <th>버전</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {visibleDocuments.map((document) => (
                <DocumentRow
                  document={document}
                  folder={folder}
                  creatorLabel={adminUserLabel(creatorLabels, document.created_by)}
                  key={document.document_id}
                  checked={selectedIds.has(document.document_id)}
                  onCheckedChange={(checked) =>
                    updateSelectedIds((current) => {
                      const next = new Set(current);
                      if (checked) next.add(document.document_id);
                      else next.delete(document.document_id);
                      return next;
                    })
                  }
                  {...(onBulk ? { onBulk } : {})}
                  onInspect={onInspect}
                  selected={document.document_id === selectedDocumentId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div aria-label="문서 목록 페이지 이동" className="civic-ledger-pagination">
        <span>
          {pageState.total === 0
            ? "표시할 문서 없음"
            : `${(pageState.page - 1) * pageState.pageSize + 1}-${Math.min(pageState.page * pageState.pageSize, pageState.total)} / ${pageState.total.toLocaleString("ko-KR")}개`}
        </span>
        <button
          disabled={pageState.page <= 1}
          onClick={() => onQueryChange?.({ page: pageState.page - 1 })}
          type="button"
        >
          이전 페이지
        </button>
        <strong>
          {pageState.page} / {Math.max(pageState.totalPages, 1)}
        </strong>
        <button
          disabled={pageState.page >= pageState.totalPages}
          onClick={() => onQueryChange?.({ page: pageState.page + 1 })}
          type="button"
        >
          다음 페이지
        </button>
      </div>
      {compact ? (
        <Link
          className="civic-text-action"
          href={`/admin/rag/documents?folderId=${encodeURIComponent(folder?.folder_id ?? "")}`}
        >
          문서 목록 자세히 보기
        </Link>
      ) : null}
    </div>
  );
}

function documentStatusQuery(status: DocumentStatusFilter): RagDocumentListQuery["status"] {
  if (status === "READY") return "ACTIVE";
  if (status === "PROCESSING") return "PROCESSING";
  if (status === "FAILED") return "FAILED";
  return "";
}

type DocumentStatusFilter = "ALL" | "READY" | "PROCESSING" | "FAILED";

export function filterRagDocuments(
  documents: readonly RagDocument[],
  query: string,
  status: DocumentStatusFilter,
): RagDocument[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  return documents.filter((document) => {
    if (!displayRagFilename(document.filename).toLocaleLowerCase("ko-KR").includes(normalizedQuery))
      return false;
    const documentStatus = document.active_version?.status ?? "PROCESSING";
    if (status === "ALL") return true;
    if (status === "READY") return ["ACTIVE", "READY", "SUCCEEDED"].includes(documentStatus);
    if (status === "FAILED") return documentStatus === "FAILED";
    return !["ACTIVE", "READY", "SUCCEEDED", "FAILED"].includes(documentStatus);
  });
}

function DocumentRow({
  document,
  folder,
  creatorLabel,
  checked,
  onCheckedChange,
  onBulk,
  onInspect,
  selected,
}: Readonly<{
  document: RagDocument;
  folder: Folder | undefined;
  creatorLabel: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onBulk?: (input: RagBulkActionInput) => void | Promise<void>;
  onInspect: (document: RagDocument, version: DocumentVersion | null) => void;
  selected: boolean;
}>) {
  const filename = displayRagFilename(document.filename);
  const [versions, setVersions] = useState<DocumentVersion[]>(
    document.active_version ? [document.active_version] : [],
  );
  const [selectedVersionId, setSelectedVersionId] = useState(
    document.active_version?.document_version_id ?? "",
  );
  const [versionLoadMessage, setVersionLoadMessage] = useState("");
  const activeVersion = document.active_version;
  const displayVersions = activeVersion
    ? versions.some((version) => version.document_version_id === activeVersion.document_version_id)
      ? versions.map((version) =>
          version.document_version_id === activeVersion.document_version_id
            ? activeVersion
            : version,
        )
      : [activeVersion, ...versions]
    : versions;
  const selectedStatus = selectedDocumentVersionStatus(displayVersions, selectedVersionId);
  const selectedVersion =
    displayVersions.find((version) => version.document_version_id === selectedVersionId) ?? null;

  async function loadVersions() {
    const items = await loadRagDocumentVersions(document.document_id);
    if (items === null) {
      setVersionLoadMessage("버전 이력을 불러오지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    setVersions(items);
    setVersionLoadMessage("");
  }

  return (
    <tr aria-selected={selected}>
      <td>
        <input
          aria-label={`${filename} 선택`}
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          type="checkbox"
        />
      </td>
      <td>
        <span className="civic-doc-cell">
          <RagFileTile filename={filename} mediaType={selectedVersion?.media_type} />
          <span className="civic-doc-cell-copy">
            <strong>{filename}</strong>
            <small>
              {mediaTypeLabel(selectedVersion?.media_type)} ·{" "}
              {formatFileSize(selectedVersion?.source_bytes)}
            </small>
          </span>
        </span>
      </td>
      <td>{creatorLabel}</td>
      <td>{formatAdminDate(document.created_at)}</td>
      <td>{formatPageCount(selectedVersion?.page_count)}</td>
      <td>
        {selectedVersion?.job_id ? (
          <Link
            aria-label={`${filename} 처리 상태 보기`}
            className={`civic-job-state is-${selectedStatus.toLowerCase()}`}
            href={processingJobHref(selectedVersion, folder?.folder_id ?? document.folder_id)}
          >
            {documentStatusLabel(selectedStatus)}
          </Link>
        ) : (
          <span className={`civic-job-state is-${selectedStatus.toLowerCase()}`}>
            {documentStatusLabel(selectedStatus)}
          </span>
        )}
        {document.search_enabled === false ? (
          <span className="civic-search-toggle">검색 제외됨</span>
        ) : null}
      </td>
      <td>
        <select
          aria-label={`${filename} 버전 선택`}
          onChange={(event) => {
            const nextVersionId = event.target.value;
            setSelectedVersionId(nextVersionId);
            onInspect(
              document,
              versions.find((version) => version.document_version_id === nextVersionId) ?? null,
            );
          }}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => void loadVersions()}
          value={selectedVersionId}
        >
          {displayVersions.map((version) => (
            <option key={version.document_version_id} value={version.document_version_id}>
              v{version.version_number}
            </option>
          ))}
        </select>
        {versionLoadMessage ? <small role="status">{versionLoadMessage}</small> : null}
      </td>
      <td>
        <div className="civic-row-actions">
          <button
            className="civic-text-action"
            onClick={() => onInspect(document, selectedVersion)}
            type="button"
          >
            미리보기
          </button>
          <details className="civic-row-menu">
            <summary aria-label={`${filename} 추가 작업`}>⋯</summary>
            <div className="civic-row-menu-list" role="menu">
              {selectedVersionId ? (
                <AuthenticatedDownloadLink
                  href={`/api/v1/rag/documents/${encodeURIComponent(document.document_id)}/versions/${encodeURIComponent(selectedVersionId)}/original`}
                >
                  원본 내려받기
                </AuthenticatedDownloadLink>
              ) : null}
              <Link
                href={`/admin/rag/upload?folderId=${encodeURIComponent(folder?.folder_id ?? document.folder_id)}&mode=NEW_VERSION&documentId=${encodeURIComponent(document.document_id)}&versionId=${encodeURIComponent(selectedVersionId)}`}
              >
                새 버전
              </Link>
              <button
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  void onBulk?.({ action: "REINDEX", documentIds: [document.document_id] });
                }}
                type="button"
              >
                재색인
              </button>
              <label className="civic-search-toggle">
                <input
                  aria-label={`${filename} 검색 사용 여부`}
                  checked={document.search_enabled !== false}
                  onChange={(event) =>
                    void onBulk?.({
                      action: "SET_SEARCH_ENABLED",
                      documentIds: [document.document_id],
                      searchEnabled: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
                <span>검색 사용</span>
              </label>
              <Link
                className="is-danger"
                href={`/admin/rag/delete?folderId=${encodeURIComponent(folder?.folder_id ?? document.folder_id)}&documentId=${encodeURIComponent(document.document_id)}`}
              >
                문서 삭제
              </Link>
            </div>
          </details>
        </div>
      </td>
    </tr>
  );
}

export function formatFileSize(value?: number): string {
  if (value === undefined || value < 0 || !Number.isFinite(value)) return "크기 확인 중";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("ko-KR", { maximumFractionDigits: 1 })} MB`;
}

function displayRagFilename(filename: unknown): string {
  return typeof filename === "string" && filename.trim() ? filename : "파일명 확인 불가";
}

export function formatPageCount(value?: number | null): string {
  return value && value > 0 ? `${value.toLocaleString("ko-KR")}쪽` : "분석 중";
}

export function formatAdminDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function formatProcessingState(processing: DocumentVersion["processing"]): string {
  if (!processing?.status) return "처리 내역 없음";
  const progress =
    typeof processing.progress === "number" && Number.isFinite(processing.progress)
      ? ` · ${Math.max(0, Math.min(100, Math.round(processing.progress)))}%`
      : "";
  return `${documentStatusLabel(processing.status)}${progress}`;
}

function isSpreadsheetMediaType(mediaType: string): boolean {
  return [
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.oasis.opendocument.spreadsheet",
  ].includes(mediaType);
}

function mediaTypeLabel(value?: string): string {
  const labels: Readonly<Record<string, string>> = {
    "application/pdf": "PDF",
    "text/plain": "TXT",
    "text/markdown": "Markdown",
    "text/csv": "CSV",
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/gif": "GIF",
    "image/bmp": "BMP",
    "image/tiff": "TIFF",
    "image/webp": "WebP",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.ms-excel": "XLS",
    "application/vnd.oasis.opendocument.spreadsheet": "ODS",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "application/vnd.ms-powerpoint": "PPT",
    "application/x-hwp": "HWP",
    "application/hwp+zip": "HWPX",
  };
  if (value && labels[value]) return labels[value];
  return "문서";
}

function documentStatusLabel(value: string): string {
  return (
    {
      ACTIVE: "처리 완료",
      READY: "처리 완료",
      SUCCEEDED: "처리 완료",
      QUEUED: "처리 대기",
      RUNNING: "처리 중",
      RETRY_WAIT: "재시도 대기",
      FAILED: "처리 실패",
      DELETED: "삭제됨",
      "처리 대기": "처리 대기",
    }[value] ?? "상태 확인 중"
  );
}

function FolderEditor({
  cancelHref,
  documentCount,
  folder,
  mode,
  onComplete,
  onMessage,
  parentName,
}: Readonly<{
  cancelHref: Route;
  documentCount: number;
  folder: Folder | undefined;
  mode: "ADD" | "EDIT" | "DELETE";
  onComplete: () => void;
  onMessage: (message: string) => void;
  parentName?: string;
}>) {
  const editable =
    folder !== undefined && mode !== "DELETE" && (mode === "ADD" || folder.kind === "NORMAL");
  const [name, setName] = useState(mode === "EDIT" && folder?.kind === "NORMAL" ? folder.name : "");
  const saveOperation = useRef(createRetryOperation());
  const removeOperation = useRef(createRetryOperation());
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "DELETE") return;
    const mutation = resolveFolderMutation(mode, folder, name);
    if (!mutation) return;
    const idempotencyKey = saveOperation.current.begin(JSON.stringify(mutation));
    if (!idempotencyKey) return;
    setBusy(true);
    let definitiveResponse = false;
    try {
      const response = await authenticatedFetch(mutation.path, {
        method: mutation.method,
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify(mutation.body),
      });
      definitiveResponse = true;
      onMessage(
        response.ok
          ? mode === "ADD"
            ? "폴더를 추가했습니다."
            : "폴더를 저장했습니다."
          : mode === "ADD"
            ? "폴더를 추가하지 못했습니다."
            : "폴더를 저장하지 못했습니다.",
      );
      if (response.ok) onComplete();
    } catch {
      onMessage("네트워크 오류로 폴더를 저장하지 못했습니다. 다시 시도하세요.");
    } finally {
      saveOperation.current.settle(definitiveResponse);
      setBusy(false);
    }
  }

  async function remove() {
    if (!folder || folder.kind !== "NORMAL") return;
    const idempotencyKey = removeOperation.current.begin();
    if (!idempotencyKey) return;
    setBusy(true);
    let definitiveResponse = false;
    try {
      definitiveResponse = await deleteRagFolder({
        folderId: folder.folder_id,
        idempotencyKey,
        onComplete,
        onMessage,
      });
    } finally {
      removeOperation.current.settle(definitiveResponse);
      setBusy(false);
    }
  }

  return (
    <form className="civic-rag-form" onSubmit={save}>
      <div className="wf-rag-modal-summary">
        <strong>문서 / {folder?.name ?? "Root"}</strong>
        <p>
          포함 문서 <b>{documentCount.toLocaleString("ko-KR")}개</b>
        </p>
      </div>
      {mode === "DELETE" ? (
        <div className="civic-rag-delete-confirmation">
          <h3>폴더 삭제 확인</h3>
          <p>이 폴더를 삭제하면 포함된 문서와 하위 폴더는 상위 폴더로 이동합니다.</p>
          {folder?.kind !== "NORMAL" ? <p role="alert">기본 폴더는 삭제할 수 없습니다.</p> : null}
        </div>
      ) : (
        <>
          <h3>{mode === "ADD" ? "추가할 폴더 정보" : "수정할 폴더 정보"}</h3>
          {mode === "EDIT" && !editable ? (
            <p role="alert">기본 폴더는 이름을 변경할 수 없습니다.</p>
          ) : null}
          <label className="civic-field">
            <span>폴더명</span>
            <input
              disabled={!editable || busy}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="civic-field">
            <span>상위 폴더</span>
            <input disabled value={parentName ?? folder?.name ?? "문서"} />
          </label>
        </>
      )}
      <div className="civic-form-actions">
        <Link className="civic-secondary-action" href={cancelHref}>
          취소
        </Link>
        {mode === "DELETE" && folder?.kind === "NORMAL" ? (
          <button
            className="civic-danger-action"
            disabled={busy}
            onClick={() => void remove()}
            type="button"
          >
            폴더 삭제 확인
          </button>
        ) : null}
        {mode !== "DELETE" ? (
          <button className="civic-primary-action" disabled={!editable || busy} type="submit">
            {mode === "ADD" ? "폴더 추가" : "폴더 저장"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function ragFolderAncestorPath(
  folders: readonly Folder[],
  folder: Folder | undefined,
): string[] {
  const byId = new Map(folders.map((item) => [item.folder_id, item]));
  const names: string[] = [];
  let parentId = folder?.parent_id ?? null;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent || names.length >= 8) break;
    names.unshift(parent.name);
    parentId = parent.parent_id;
  }
  return names;
}

export function resolveFolderEditorMode(value: string | undefined): "ADD" | "EDIT" | "DELETE" {
  if (value === "ADD" || value === "DELETE") return value;
  return "EDIT";
}

export function ragFolderDialogKey(
  mode: "ADD" | "EDIT" | "DELETE",
  requestedFolderId: string | undefined,
): string {
  return `${mode}:${requestedFolderId ?? ""}`;
}

export function shouldRenderRagFolderDialog(
  screenId: string,
  mode: "ADD" | "EDIT" | "DELETE",
  requestedFolderId: string | undefined,
  completedDialog: string | undefined,
): boolean {
  return (
    screenId === "A-RAG-002" && completedDialog !== ragFolderDialogKey(mode, requestedFolderId)
  );
}

export function jobPanelKey(jobId: string | readonly string[] | undefined): string {
  const jobIds = typeof jobId === "string" ? [jobId] : (jobId ?? []);
  return jobIds.length > 0 ? `job-${jobIds.join("-")}` : "missing-job";
}

export function resolveFolderMutation(
  mode: "ADD" | "EDIT",
  folder: Folder | undefined,
  name: string,
) {
  const normalizedName = name.trim();
  if (!normalizedName) return null;
  if (mode === "ADD") {
    if (!folder) return null;
    return {
      path: "/api/v1/rag/folders",
      method: "POST",
      body: { name: normalizedName, parent_id: folder.folder_id },
    } as const;
  }
  if (!folder || folder.kind !== "NORMAL") return null;
  return {
    path: `/api/v1/rag/folders/${encodeURIComponent(folder.folder_id)}`,
    method: "PATCH",
    body: { name: normalizedName },
  } as const;
}

export function selectedDocumentVersionStatus(
  versions: readonly DocumentVersion[],
  selectedVersionId: string,
): string {
  return (
    versions.find((version) => version.document_version_id === selectedVersionId)?.status ??
    "처리 대기"
  );
}

function UploadPanel({
  folder,
  inline = false,
  onAccepted,
  query,
  onMessage,
}: Readonly<{
  folder: Folder | undefined;
  inline?: boolean;
  onAccepted?: () => void;
  query: RagQuery;
  onMessage: (message: string) => void;
}>) {
  const router = useRouter();
  const mode = firstQueryValue(query.mode) === "NEW_VERSION" ? "NEW_VERSION" : "NEW_DOCUMENT";
  const documentId = firstQueryValue(query.documentId);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<ReadonlyMap<File, string>>(() => new Map());
  const [acceptedJobs, setAcceptedJobs] = useState<Array<{ filename: string; jobId: string }>>([]);
  const completionRecoveries = useRef(new Map<File, string>());
  const initiationKeys = useRef(createFileRetryKeyStore());

  function removeQueuedFile(file: File) {
    if (busy) return;
    const recoveryKey = multipartFileRecoveryKey(file);
    completionRecoveries.current.delete(recoveryKey);
    initiationKeys.current.retire(recoveryKey);
    setUploadProgress((current) => {
      const next = new Map(current);
      next.delete(file);
      return next;
    });
    setFiles((current) => current.filter((candidate) => candidate !== file));
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folder || files.length === 0 || (mode === "NEW_VERSION" && !documentId)) {
      return;
    }
    setBusy(true);
    const results = await mapSettledWithConcurrency(files, 2, async (file) => {
      const recoveryKey = multipartFileRecoveryKey(file);
      const completionUploadId = completionRecoveries.current.get(recoveryKey);
      const initIdempotencyKey = completionUploadId
        ? undefined
        : initiationKeys.current.acquire(recoveryKey);
      try {
        const accepted = await uploadRagFileMultipart({
          file,
          folderId: folder.folder_id,
          ...(mode === "NEW_VERSION" && documentId ? { documentId } : {}),
          ...(completionUploadId ? { completionUploadId } : {}),
          ...(initIdempotencyKey ? { initIdempotencyKey } : {}),
          onInitiationSettled: () => initiationKeys.current.retire(recoveryKey),
          onProgress: (uploadedParts, totalParts) => {
            setUploadProgress((current) => {
              const next = new Map(current);
              next.set(file, `${uploadedParts}/${totalParts} part`);
              return next;
            });
            onMessage(`${file.name}: ${uploadedParts}/${totalParts} part 전송 중`);
          },
        });
        completionRecoveries.current.delete(recoveryKey);
        return accepted;
      } catch (error) {
        settleMultipartCompletionRecovery(
          completionRecoveries.current,
          recoveryKey,
          error,
          completionUploadId,
        );
        throw error;
      }
    });
    const failedResults = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [ragUploadFailureMessage(files[index]?.name ?? "선택한 파일", result.reason)]
        : [],
    );
    const failed = failedResults.length;
    const acceptedNow = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    setAcceptedJobs((current) => [...current, ...acceptedNow]);
    setFiles(rejectedInputs(files, results));
    onMessage(
      failed > 0
        ? `${failed}개 파일 전송에 실패했습니다. ${failedResults.join(" ")} 성공 파일은 유지되며 실패 파일만 다시 시도하세요.`
        : `${acceptedNow.length}개 파일을 접수했습니다. 문서 준비 상태로 이동합니다.`,
    );
    if (acceptedNow.length > 0) onAccepted?.();
    setBusy(false);
    if (failed === 0 && acceptedNow.length > 0) {
      router.push(ragJobsHref(acceptedNow, folder.folder_id));
    }
  }

  return (
    <form className={`civic-rag-form${inline ? " is-inline" : ""}`} onSubmit={upload}>
      <div className="civic-upload-mode">
        <strong>{mode === "NEW_VERSION" ? "새 버전" : "새 문서"}</strong>
        <p>
          {mode === "NEW_VERSION"
            ? "선택한 문서에 새 버전을 등록합니다."
            : `${folder?.name ?? "선택 필요"}에 새 불변 문서를 만듭니다.`}
        </p>
      </div>
      <p className="civic-help">
        여러 파일을 한 번에 선택할 수 있습니다. 파일당 최대 500 MiB이며 8 MiB 단위로 안전하게 나누어
        전송합니다. PDF·텍스트·이미지·Office·한글 문서를 지원합니다.
      </p>
      <label
        className="civic-upload-dropzone"
        onDragOver={(event) => {
          if (canSelectUploadFiles(busy)) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!canSelectUploadFiles(busy)) return;
          event.preventDefault();
          completionRecoveries.current.clear();
          initiationKeys.current.clear();
          const accepted = acceptRagUploadFiles(
            Array.from(event.dataTransfer.files),
            mode === "NEW_DOCUMENT",
          );
          setFiles(accepted);
          if (accepted.length !== event.dataTransfer.files.length) {
            onMessage(ragUploadExclusionMessage(Array.from(event.dataTransfer.files)));
          }
        }}
      >
        <strong>원본 파일 선택</strong>
        <span>
          {files.length > 0 ? `${files.length}개 선택됨` : "파일을 여러 개 놓거나 찾아보세요"}
        </span>
        <input
          accept={RAG_ACCEPTED_EXTENSIONS.join(",")}
          disabled={!canSelectUploadFiles(busy)}
          multiple={mode === "NEW_DOCUMENT"}
          onChange={(event) => {
            if (!canSelectUploadFiles(busy)) return;
            completionRecoveries.current.clear();
            initiationKeys.current.clear();
            const selected = Array.from(event.target.files ?? []);
            const accepted = acceptRagUploadFiles(selected, mode === "NEW_DOCUMENT");
            setFiles(accepted);
            if (accepted.length !== selected.length) {
              onMessage(ragUploadExclusionMessage(selected));
            }
            event.target.value = "";
          }}
          type="file"
        />
        <span aria-hidden="true" className="civic-upload-browse">
          파일 찾아보기
        </span>
      </label>
      <ul className="civic-upload-queue">
        {files.map((file) => (
          <li key={`${file.name}-${file.size}-${file.lastModified}`}>
            <span className="civic-doc-cell">
              <RagFileTile filename={file.name} />
              <strong>{file.name}</strong>
            </span>
            <span className="civic-upload-queue-meta">
              <span>
                {formatFileSize(file.size)} · {uploadProgress.get(file) ?? "전송 대기"}
              </span>
              <button
                aria-label={`${file.name} 업로드 목록에서 제거`}
                className="civic-upload-remove"
                disabled={busy}
                onClick={() => removeQueuedFile(file)}
                type="button"
              >
                <RagTrashIcon />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {acceptedJobs.length > 0 ? (
        <ul aria-label="접수된 문서 처리 작업" className="civic-upload-queue">
          {acceptedJobs.map((job) => (
            <li key={job.jobId}>
              <span className="civic-doc-cell">
                <RagFileTile filename={job.filename} />
                <strong>{job.filename}</strong>
              </span>
              <Link
                href={ragJobHref(
                  job.jobId,
                  folder?.folder_id ?? firstQueryValue(query.folderId),
                  job.filename,
                )}
              >
                처리 상태 보기
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="civic-form-actions">
        <Link
          className="civic-secondary-action"
          href={ragWorkspaceHref(folder?.folder_id ?? firstQueryValue(query.folderId))}
        >
          취소
        </Link>
        <button
          className="civic-primary-action"
          disabled={busy || !folder || files.length === 0}
          type="submit"
        >
          업로드 시작
        </button>
      </div>
    </form>
  );
}

function AutomaticRagJobRetryPanel({
  filename,
  jobId,
}: Readonly<{ filename?: string; jobId: string }>) {
  const router = useRouter();
  const retryOperation = useRef(
    createRetryOperation(() => crypto.randomUUID(), automaticRagRetryIdempotencyKey(jobId)),
  );
  const [retrying, setRetrying] = useState(true);
  const [message, setMessage] = useState("실패한 문서의 재처리를 자동으로 요청합니다.");

  const retry = useCallback(async () => {
    const idempotencyKey = retryOperation.current.begin();
    if (!idempotencyKey) return;
    setRetrying(true);
    setMessage("실패한 문서의 재처리를 요청하고 있습니다…");
    let definitiveResponse = false;
    try {
      const result = await requestRagJobRetry({
        jobId,
        idempotencyKey,
      });
      definitiveResponse = result.definitive;
      if (result.kind === "rejected") {
        setMessage("자동 재시도를 접수하지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      if (result.kind === "malformed") {
        setMessage("재시도 응답에서 새 작업 ID를 확인하지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      if (result.kind === "network") {
        setMessage(RAG_RETRY_NETWORK_MESSAGE);
        return;
      }
      setMessage("재처리를 접수했습니다. 새 작업의 처리 상태로 이동합니다.");
      router.replace(ragJobHref(result.acceptedJobId, undefined, filename));
    } finally {
      retryOperation.current.settle(definitiveResponse);
      setRetrying(false);
    }
  }, [filename, jobId, router]);

  useEffect(() => {
    void retry();
  }, [retry]);

  return (
    <div className="civic-rag-form">
      <div className="civic-upload-mode">
        <strong>{filename ?? "선택한 실패 문서"}</strong>
        <p aria-live="polite">{message}</p>
      </div>
      <div className="civic-form-actions">
        <Link className="civic-secondary-action" href="/admin/rag">
          문서 관리
        </Link>
        <button
          className="civic-primary-action"
          disabled={retrying}
          onClick={() => void retry()}
          type="button"
        >
          {retrying ? "재시도 요청 중…" : "다시 시도"}
        </button>
      </div>
    </div>
  );
}

export function canSelectUploadFiles(busy: boolean): boolean {
  return !busy;
}

export function acceptRagUploadFiles(files: readonly File[], multiple: boolean): File[] {
  const accepted = files.filter((file) => {
    const lowerName = file.name.toLocaleLowerCase("en-US");
    return (
      file.size <= MAX_RAG_UPLOAD_BYTES &&
      RAG_ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
    );
  });
  return multiple ? accepted : accepted.slice(0, 1);
}

export function ragUploadExclusionMessage(files: readonly File[]): string {
  const hasOversized = files.some((file) => file.size > MAX_RAG_UPLOAD_BYTES);
  const hasUnsupported = files.some((file) => {
    const lowerName = file.name.toLocaleLowerCase("en-US");
    return !RAG_ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
  });
  if (hasOversized && hasUnsupported) {
    return "지원하지 않거나 500 MiB를 초과한 파일은 선택에서 제외했습니다.";
  }
  if (hasOversized) return "500 MiB를 초과한 파일은 선택에서 제외했습니다.";
  return "지원하지 않는 형식의 파일은 선택에서 제외했습니다.";
}

export function ragUploadFailureMessage(filename: string, error: unknown): string {
  if (error instanceof RagUploadDefinitiveResponseError) {
    if (error.status === 400) {
      return `${filename}: 확장자와 실제 파일 형식이 일치하지 않거나 파일을 읽을 수 없습니다.`;
    }
    if (error.status === 413) return `${filename}: 파일 크기가 500 MiB를 초과합니다.`;
    if (error.status === 409)
      return `${filename}: 이미 등록된 내용이거나 문서 상태가 변경되었습니다.`;
  }
  return `${filename}: 전송을 완료하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.`;
}

export function ragJobFailureMessage(code: string | undefined): string | null {
  if (!code) return null;
  return (
    {
      DOCUMENT_READ_FAILED:
        "파일이 손상되었거나 암호화되었거나 지원되지 않는 구조여서 읽지 못했습니다. 원본 파일을 확인한 뒤 다시 업로드하세요.",
      DOCUMENT_CONVERSION_TIMEOUT:
        "문서 변환 시간이 초과되었습니다. 잠시 후 다시 시도하거나 문서를 나누어 업로드하세요.",
      DOCUMENT_LIMIT_EXCEEDED:
        "문서 변환 결과가 처리 한도를 초과했습니다. 문서를 나누어 업로드하세요.",
      DOCUMENT_OCR_FAILED: "이미지 문자를 읽지 못했습니다. 문서 상태를 확인한 뒤 다시 시도하세요.",
      OBJECT_CLEANUP_FAILED: "실패한 변환 결과를 정리하지 못했습니다. 관리자 확인이 필요합니다.",
      PROCESSING_FAILED: "문서를 처리하지 못했습니다. 원본 파일을 확인한 뒤 다시 시도하세요.",
    }[code] ?? "문서를 처리하지 못했습니다. 잠시 후 다시 시도하세요."
  );
}

export function ragJobTimelineStates(
  job: Pick<RagJob, "status" | "failure_code"> | null,
): readonly (readonly [string, string])[] {
  if (job?.status === "SUCCEEDED") {
    return [
      ["파일 확인", "완료"],
      ["문서 읽기", "완료"],
      ["검색 준비", "완료"],
    ];
  }
  const conversionFailure = [
    "DOCUMENT_READ_FAILED",
    "DOCUMENT_CONVERSION_TIMEOUT",
    "DOCUMENT_LIMIT_EXCEEDED",
    "DOCUMENT_OCR_FAILED",
  ].includes(job?.failure_code ?? "");
  if (job?.status === "FAILED") {
    return [
      ["파일 확인", "완료"],
      ["문서 읽기", conversionFailure ? "실패" : "완료"],
      ["검색 준비", conversionFailure ? "시작 전" : "실패"],
    ];
  }
  return [
    ["파일 확인", job ? "완료" : "확인 중"],
    ["문서 읽기", job?.status === "RUNNING" ? "처리 중" : "대기"],
    ["검색 준비", documentStatusLabel(job?.status ?? "")],
  ];
}

export function ragJobDisplayProgress(job: RagJob | null): number {
  if (!job) return 0;
  if (job.status === "SUCCEEDED") return 100;
  if (job.status === "FAILED") {
    const completed = ragJobTimelineStates(job).filter(([, state]) => state === "완료").length;
    return Math.round((completed / 3) * 100);
  }
  const progress =
    typeof job.progress === "number" && Number.isFinite(job.progress) ? job.progress : 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function ragJobStepClass(state: string): string {
  if (state === "완료") return "is-done";
  if (state === "실패") return "is-failed";
  if (state === "처리 중" || state === "확인 중") return "is-active";
  return "is-waiting";
}

function ragJobStepMarker(state: string): string {
  if (state === "완료") return "✓";
  if (state === "실패") return "!";
  if (state === "처리 중" || state === "확인 중") return "•";
  return "–";
}

export function RagJobStatusCard({
  filename,
  headingId = "civic-job-status-title",
  job,
  message,
  onRefresh,
  onRetry,
  replacementHref,
  retrying,
  workspaceHref = ragWorkspaceHref(undefined),
}: Readonly<{
  filename?: string;
  headingId?: string;
  job: RagJob | null;
  message: string;
  onRefresh: () => void;
  onRetry: () => void;
  replacementHref?: Route;
  retrying: boolean;
  workspaceHref?: Route;
}>) {
  const stages = ragJobTimelineStates(job);
  const displayProgress = ragJobDisplayProgress(job);
  const failedStage = stages.find(([, state]) => state === "실패")?.[0];
  const failureMessage = ragJobFailureMessage(job?.failure_code);
  const statusLabel = documentStatusLabel(job?.status ?? "");
  const displayFilename =
    (filename ?? job?.filename)?.trim() || (job ? "업로드한 문서" : "문서 정보 확인 중");
  const failureTitleId = `${headingId}-failure`;

  return (
    <section
      aria-labelledby={headingId}
      className={`civic-job-panel${job?.status === "FAILED" ? " is-failed" : ""}`}
    >
      <div className="civic-job-summary">
        <header className="civic-job-document">
          <span aria-hidden="true" className="civic-job-file-mark">
            <RagFileTile filename={displayFilename} />
          </span>
          <div>
            <span>처리 문서</span>
            <strong id={headingId}>{displayFilename}</strong>
          </div>
          <b
            className={`civic-job-status-badge is-${job?.status?.toLocaleLowerCase() || "loading"}`}
          >
            {statusLabel}
          </b>
        </header>

        <div className="civic-job-progress">
          <header>
            <strong>문서 준비 진행 상태</strong>
            <b>{displayProgress}%</b>
          </header>
          <progress aria-label="문서 준비 진행률" max={100} value={displayProgress} />
        </div>

        <ol aria-label="문서 처리 단계" className="civic-job-timeline">
          {stages.map(([label, state]) => (
            <li className={ragJobStepClass(state)} key={label}>
              <span aria-hidden="true" className="civic-job-step-marker">
                {ragJobStepMarker(state)}
              </span>
              <div>
                <strong>{label}</strong>
                <small>{state}</small>
              </div>
            </li>
          ))}
        </ol>

        {failureMessage ? (
          <section aria-labelledby={failureTitleId} className="civic-job-failure">
            <span aria-hidden="true">!</span>
            <div>
              <strong id={failureTitleId}>{failedStage ?? "문서 처리"} 실패</strong>
              <p>{failureMessage}</p>
            </div>
          </section>
        ) : null}
      </div>

      <p aria-live="polite" className="civic-job-live-message">
        {message}
      </p>

      <div className="civic-form-actions civic-job-actions">
        <Link className="civic-secondary-action" href={workspaceHref}>
          문서 목록
        </Link>
        <button className="civic-secondary-action" onClick={onRefresh} type="button">
          상태 새로고침
        </button>
        {job?.status === "FAILED" ? (
          <button
            className="civic-primary-action"
            disabled={retrying || Boolean(replacementHref)}
            onClick={onRetry}
            type="button"
          >
            {retrying ? "재처리 요청 중…" : "실패 파일 다시 처리"}
          </button>
        ) : null}
        {replacementHref ? (
          <Link className="civic-primary-action" href={replacementHref}>
            새 작업 상태 보기
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function JobPanel({ query }: Readonly<{ query: RagQuery }>) {
  const jobIds = queryValues(query.jobId);
  const filenames = queryValues(query.filename);
  const folderId = firstQueryValue(query.folderId);
  if (jobIds.length === 0) {
    return (
      <RagJobStatusCard
        job={null}
        message="작업 ID가 필요합니다."
        onRefresh={() => undefined}
        onRetry={() => undefined}
        retrying={false}
        workspaceHref={ragWorkspaceHref(folderId)}
      />
    );
  }
  return (
    <div aria-label="업로드한 문서 준비 상태" className="civic-job-batch">
      {jobIds.map((jobId, index) => (
        <JobStatusItem
          headingId={`civic-job-status-title-${index}`}
          jobId={jobId}
          key={`${jobId}-${index}`}
          {...(folderId ? { folderId } : {})}
          {...(filenames[index] ? { filename: filenames[index] } : {})}
        />
      ))}
    </div>
  );
}

function JobStatusItem({
  filename,
  folderId,
  headingId,
  jobId,
}: Readonly<{
  filename?: string;
  folderId?: string;
  headingId: string;
  jobId: string;
}>) {
  const [job, setJob] = useState<RagJob | null>(null);
  const [replacementJobId, setReplacementJobId] = useState<string | null>(null);
  const retryOperation = useRef(createRetryOperation());
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState("문서 처리 상태를 불러오는 중입니다…");

  const refresh = useCallback(async () => {
    const latest = await loadRagJob(jobId);
    if (!latest) return setMessage("처리 상태를 불러오지 못했습니다. 다시 시도해 주세요.");
    const recoveredFilename =
      !filename && latest.status === "FAILED" ? await loadRagJobFilename(jobId) : null;
    setJob(recoveredFilename ? { ...latest, filename: recoveredFilename } : latest);
    setMessage("최신 처리 상태를 반영했습니다.");
  }, [filename, jobId]);

  useEffect(() => {
    if (!shouldPollRagJob(job?.status, document.hidden)) return;
    const poll = () => {
      if (shouldPollRagJob(job?.status, document.hidden)) void refresh();
    };
    const initial = window.setTimeout(poll, 0);
    const timer = window.setInterval(poll, 2_500);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [job?.status, jobId, refresh]);

  async function retry() {
    if (replacementJobId) return;
    const idempotencyKey = retryOperation.current.begin();
    if (!idempotencyKey) return;
    setRetrying(true);
    let definitiveResponse = false;
    try {
      const result = await requestRagJobRetry({
        jobId,
        idempotencyKey,
      });
      definitiveResponse = result.definitive;
      if (result.kind === "rejected") {
        setMessage("재시도를 접수하지 못했습니다.");
        return;
      }
      if (result.kind === "malformed") {
        setMessage("재시도 응답에서 새 작업 ID를 확인하지 못했습니다.");
        return;
      }
      if (result.kind === "network") {
        setMessage(RAG_RETRY_NETWORK_MESSAGE);
        return;
      }
      setReplacementJobId(result.acceptedJobId);
      setMessage("수동 재시도 한 건을 새 작업으로 접수했습니다.");
    } finally {
      retryOperation.current.settle(definitiveResponse);
      setRetrying(false);
    }
  }

  return (
    <RagJobStatusCard
      headingId={headingId}
      job={job}
      message={message}
      onRefresh={() => void refresh()}
      onRetry={() => void retry()}
      retrying={retrying}
      workspaceHref={ragWorkspaceHref(folderId)}
      {...(filename ? { filename } : {})}
      {...(replacementJobId
        ? { replacementHref: ragJobHref(replacementJobId, folderId, filename) }
        : {})}
    />
  );
}

export async function loadRagJob(
  jobId: string,
  request: typeof fetch = authenticatedFetch,
): Promise<RagJob | null> {
  try {
    const response = await request(`/api/v1/rag/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const value = (await response.json()) as { job_id?: unknown; status?: unknown };
    return typeof value.job_id === "string" && typeof value.status === "string"
      ? (value as RagJob)
      : null;
  } catch {
    return null;
  }
}

export function readRagJobFilenameFromSummary(jobId: string, value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const recentFailures = (value as { recent_failures?: unknown }).recent_failures;
  if (!Array.isArray(recentFailures)) return null;
  for (const item of recentFailures) {
    if (!item || typeof item !== "object") continue;
    const failure = item as { job_id?: unknown; filename?: unknown };
    if (
      failure.job_id === jobId &&
      typeof failure.filename === "string" &&
      failure.filename.trim()
    ) {
      return failure.filename;
    }
  }
  return null;
}

export async function loadRagJobFilename(
  jobId: string,
  request: typeof fetch = authenticatedFetch,
): Promise<string | null> {
  try {
    const response = await request("/api/v1/rag/jobs/summary", { cache: "no-store" });
    if (!response.ok) return null;
    return readRagJobFilenameFromSummary(jobId, await response.json());
  } catch {
    return null;
  }
}

export async function loadRagDocumentVersions(
  documentId: string,
  request: typeof fetch = authenticatedFetch,
): Promise<DocumentVersion[] | null> {
  try {
    const response = await request(
      `/api/v1/rag/documents/${encodeURIComponent(documentId)}/versions`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const value = (await response.json()) as { items?: unknown };
    return Array.isArray(value.items) ? (value.items as DocumentVersion[]) : null;
  } catch {
    return null;
  }
}

export const RAG_FOLDER_DELETE_NETWORK_MESSAGE =
  "네트워크 오류로 폴더 삭제 결과를 확인하지 못했습니다. 다시 시도하세요.";

export const RAG_RETRY_NETWORK_MESSAGE =
  "네트워크 오류로 재시도 접수를 확인하지 못했습니다. 같은 작업을 다시 시도해 주세요.";

export function ragWorkspaceHref(folderId: string | undefined): Route {
  return folderId
    ? (`/admin/rag?folderId=${encodeURIComponent(folderId)}` as Route)
    : ("/admin/rag" as Route);
}

export async function deleteRagFolder({
  folderId,
  idempotencyKey,
  onComplete,
  onMessage,
  request = authenticatedFetch,
}: Readonly<{
  folderId: string;
  idempotencyKey: string;
  onComplete: () => void;
  onMessage: (message: string) => void;
  request?: typeof fetch;
}>): Promise<boolean> {
  try {
    const response = await request(`/api/v1/rag/folders/${encodeURIComponent(folderId)}`, {
      method: "DELETE",
      headers: { "idempotency-key": idempotencyKey },
    });
    onMessage(
      response.ok
        ? "폴더를 삭제하고 하위 항목을 상위 폴더로 이동했습니다."
        : "폴더를 삭제하지 못했습니다.",
    );
    if (response.ok) onComplete();
    return true;
  } catch {
    onMessage(RAG_FOLDER_DELETE_NETWORK_MESSAGE);
    return false;
  }
}

export function createRetryOperation(
  idFactory: () => string = () => crypto.randomUUID(),
  initialIdempotencyKey: string | null = null,
) {
  let pending = false;
  let idempotencyKey = initialIdempotencyKey;
  let operationIdentity: string | undefined;
  return {
    begin(nextOperationIdentity?: string): string | null {
      if (pending) return null;
      pending = true;
      if (operationIdentity !== nextOperationIdentity) {
        idempotencyKey = null;
        operationIdentity = nextOperationIdentity;
      }
      idempotencyKey ??= idFactory();
      return idempotencyKey;
    },
    settle(completed: boolean): void {
      pending = false;
      if (completed) {
        idempotencyKey = null;
        operationIdentity = undefined;
      }
    },
  };
}

export function readAcceptedJobId(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("job_id" in value)) return null;
  const jobId = value.job_id;
  return typeof jobId === "string" && jobId.trim() ? jobId : null;
}

export type RagJobRetryResult =
  | Readonly<{ kind: "accepted"; definitive: true; acceptedJobId: string }>
  | Readonly<{ kind: "rejected"; definitive: true; acceptedJobId: null }>
  | Readonly<{ kind: "malformed"; definitive: false; acceptedJobId: null }>
  | Readonly<{ kind: "network"; definitive: false; acceptedJobId: null }>;

export function automaticRagRetryIdempotencyKey(jobId: string): string {
  return `ADMIN_HOME_RETRY:${jobId}`;
}

export async function requestRagJobRetry({
  jobId,
  idempotencyKey,
  request = authenticatedFetch,
}: Readonly<{
  jobId: string;
  idempotencyKey: string;
  request?: typeof fetch;
}>): Promise<RagJobRetryResult> {
  try {
    const response = await request(`/api/v1/rag/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
    });
    if (!response.ok) return { kind: "rejected", definitive: true, acceptedJobId: null };
    const acceptedJobId = readAcceptedJobId(await response.json().catch(() => null));
    return acceptedJobId
      ? { kind: "accepted", definitive: true, acceptedJobId }
      : { kind: "malformed", definitive: false, acceptedJobId: null };
  } catch {
    return { kind: "network", definitive: false, acceptedJobId: null };
  }
}

export function processingJobHref(
  version: DocumentVersion | null | undefined,
  folderId?: string,
): Route {
  return ragJobHref(version?.job_id, folderId, version?.filename);
}

export function ragJobHref(jobId?: string, folderId?: string, filename?: string): Route {
  const query = [
    jobId ? `jobId=${encodeURIComponent(jobId)}` : "",
    folderId ? `folderId=${encodeURIComponent(folderId)}` : "",
    filename ? `filename=${encodeURIComponent(filename)}` : "",
  ]
    .filter(Boolean)
    .join("&");
  return (query ? `/admin/rag/jobs?${query}` : "/admin/rag/jobs") as Route;
}

export function ragJobsHref(
  jobs: readonly Readonly<{ filename: string; jobId: string }>[],
  folderId?: string,
): Route {
  const parameters = new URLSearchParams();
  for (const job of jobs) {
    parameters.append("jobId", job.jobId);
    parameters.append("filename", job.filename);
  }
  if (folderId) parameters.set("folderId", folderId);
  const query = parameters.toString();
  return (query ? `/admin/rag/jobs?${query}` : "/admin/rag/jobs") as Route;
}

function DeletePanel({
  documents,
  query,
  onComplete,
  onMessage,
}: Readonly<{
  documents: RagDocument[];
  query: RagQuery;
  onComplete: () => void;
  onMessage: (message: string) => void;
}>) {
  const documentId = firstQueryValue(query.documentId);
  const document = resolveDeletionDocument(documents, documentId);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const removeOperation = useRef(createRetryOperation());

  async function remove() {
    if (!document || !confirmed) return;
    const idempotencyKey = removeOperation.current.begin();
    if (!idempotencyKey) return;
    const responseConfirmed = await deleteRagDocument({
      document,
      idempotencyKey: () => idempotencyKey,
      onComplete,
      onMessage,
      setBusy,
    });
    removeOperation.current.settle(responseConfirmed);
  }

  return (
    <section className="civic-delete-panel">
      <p>문서가 삭제되고 과거 답변의 인용을 열 수 없습니다.</p>
      <dl>
        <div>
          <dt>문서</dt>
          <dd>{document?.filename ?? "현재 폴더에서 문서를 찾을 수 없습니다."}</dd>
        </div>
        <div>
          <dt>삭제 영향</dt>
          <dd>검색 결과와 AI 답변에서 더 이상 사용되지 않음</dd>
        </div>
      </dl>
      <label className="civic-check-row">
        <input
          checked={confirmed}
          disabled={!document}
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
        />
        <span>삭제 후 되돌릴 수 없음을 확인했습니다.</span>
      </label>
      <div className="civic-form-actions">
        <Link
          className="civic-secondary-action"
          href={ragWorkspaceHref(document?.folder_id ?? firstQueryValue(query.folderId))}
        >
          취소
        </Link>
        <button
          className="civic-danger-action"
          disabled={!document || !confirmed || busy}
          onClick={() => void remove()}
          type="button"
        >
          문서 삭제
        </button>
      </div>
    </section>
  );
}

export async function deleteRagDocument({
  document,
  onComplete,
  onMessage,
  setBusy,
  request = authenticatedFetch,
  idempotencyKey = () => crypto.randomUUID(),
}: Readonly<{
  document: RagDocument;
  onComplete: () => void;
  onMessage: (message: string) => void;
  setBusy: (busy: boolean) => void;
  request?: typeof fetch;
  idempotencyKey?: () => string;
}>): Promise<boolean> {
  setBusy(true);
  try {
    const response = await request(
      `/api/v1/rag/documents/${encodeURIComponent(document.document_id)}`,
      {
        method: "DELETE",
        headers: { "idempotency-key": idempotencyKey() },
      },
    );
    onMessage(
      response.ok
        ? "문서를 삭제하고 이후 검색·원문 열람을 차단했습니다."
        : "문서 상태가 변경되어 삭제하지 못했습니다. 최신 상태를 확인하세요.",
    );
    if (response.ok) onComplete();
    return true;
  } catch {
    onMessage("네트워크 오류로 문서를 삭제하지 못했습니다. 다시 시도하세요.");
    return false;
  } finally {
    setBusy(false);
  }
}

export function resolveDeletionDocument(documents: RagDocument[], documentId: string | undefined) {
  return documents.find((item) => item.document_id === documentId);
}

export async function sha256Blob(
  blob: Blob,
  chunkBytes = RAG_UPLOAD_HASH_CHUNK_BYTES,
): Promise<string> {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new TypeError("hash chunk size must be a positive integer");
  }
  const digest = createSha256.create();
  for (let offset = 0; offset < blob.size; offset += chunkBytes) {
    const chunk = blob.slice(offset, Math.min(offset + chunkBytes, blob.size));
    digest.update(new Uint8Array(await chunk.arrayBuffer()));
  }
  return bytesToHex(digest.digest());
}

type MultipartUploadResponse = Readonly<{
  upload_id: string;
  part_size: number;
  part_count: number;
  max_bytes: number;
}>;

export class RagMultipartCompletionPendingError extends Error {
  constructor(
    readonly uploadId: string,
    cause: unknown,
  ) {
    super("RAG multipart completion result is pending", { cause });
    this.name = "RagMultipartCompletionPendingError";
  }
}

class RagUploadDefinitiveResponseError extends Error {
  constructor(readonly status: number) {
    super(`RAG upload failed with ${status}`);
    this.name = "RagUploadDefinitiveResponseError";
  }
}

export async function uploadRagFileMultipart({
  file,
  folderId,
  documentId,
  completionUploadId,
  initIdempotencyKey = crypto.randomUUID(),
  onInitiationSettled = () => undefined,
  onProgress = () => undefined,
  request = authenticatedFetch,
}: Readonly<{
  file: File;
  folderId: string;
  documentId?: string;
  completionUploadId?: string;
  initIdempotencyKey?: string;
  onInitiationSettled?: () => void;
  onProgress?: (uploadedParts: number, totalParts: number) => void;
  request?: typeof fetch;
}>): Promise<{ filename: string; jobId: string }> {
  if (file.size <= 0 || file.size > MAX_RAG_UPLOAD_BYTES) {
    throw new RangeError("RAG upload must contain 1 byte to 500 MiB");
  }
  if (completionUploadId) {
    try {
      const jobId = await completeRagMultipartUpload(request, completionUploadId);
      return { filename: file.name, jobId };
    } catch (error) {
      if (!(error instanceof RagUploadDefinitiveResponseError)) {
        throw new RagMultipartCompletionPendingError(completionUploadId, error);
      }
      await abortRagMultipartUpload(request, completionUploadId);
      throw error;
    }
  }
  const contentSha256 = await sha256Blob(file);
  let uploadId: string | undefined;
  let completionStarted = false;
  try {
    const initiated = await fetchWithRetry(
      request,
      "/api/v1/rag/uploads",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": initIdempotencyKey,
        },
        body: JSON.stringify({
          folder_id: folderId,
          document_id: documentId,
          filename: file.name,
          media_type: mediaType(file.name),
          declared_length: file.size,
          content_sha256: contentSha256,
          rights_confirmed: true,
        }),
      },
      onInitiationSettled,
    );
    const upload = (await initiated.json()) as Partial<MultipartUploadResponse>;
    if (
      typeof upload.upload_id !== "string" ||
      !Number.isSafeInteger(upload.part_size) ||
      !Number.isSafeInteger(upload.part_count) ||
      upload.part_size! < 5 * 1024 * 1024 ||
      upload.part_count! <= 0 ||
      upload.max_bytes !== MAX_RAG_UPLOAD_BYTES
    ) {
      throw new TypeError("RAG multipart contract is invalid");
    }
    uploadId = upload.upload_id;
    onInitiationSettled();
    for (let partNumber = 1; partNumber <= upload.part_count!; partNumber += 1) {
      const offset = (partNumber - 1) * upload.part_size!;
      const part = file.slice(offset, Math.min(offset + upload.part_size!, file.size));
      const partSha256 = await sha256Blob(part);
      await fetchWithRetry(
        request,
        `/api/v1/rag/uploads/${encodeURIComponent(uploadId)}/parts/${partNumber}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            "x-content-sha256": partSha256,
          },
          body: part,
        },
      );
      onProgress(partNumber, upload.part_count!);
    }
    completionStarted = true;
    const jobId = await completeRagMultipartUpload(request, uploadId);
    return { filename: file.name, jobId };
  } catch (error) {
    if (uploadId && completionStarted && !(error instanceof RagUploadDefinitiveResponseError)) {
      throw new RagMultipartCompletionPendingError(uploadId, error);
    }
    if (uploadId) {
      await abortRagMultipartUpload(request, uploadId);
    }
    throw error;
  }
}

async function abortRagMultipartUpload(request: typeof fetch, uploadId: string): Promise<void> {
  await request(`/api/v1/rag/uploads/${encodeURIComponent(uploadId)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}

async function completeRagMultipartUpload(
  request: typeof fetch,
  uploadId: string,
): Promise<string> {
  const completed = await fetchWithRetry(
    request,
    `/api/v1/rag/uploads/${encodeURIComponent(uploadId)}/complete`,
    { method: "POST" },
  );
  const accepted = (await completed.json()) as { job_id?: unknown };
  if (typeof accepted.job_id !== "string" || !accepted.job_id) {
    throw new TypeError("RAG completion response is invalid");
  }
  return accepted.job_id;
}

export function multipartFileRecoveryKey(file: File): File {
  return file;
}

export function settleMultipartCompletionRecovery(
  recoveries: Map<File, string>,
  recoveryKey: File,
  error: unknown,
  attemptedUploadId: string | undefined,
): void {
  if (error instanceof RagMultipartCompletionPendingError) {
    recoveries.set(recoveryKey, error.uploadId);
  } else if (attemptedUploadId) {
    recoveries.delete(recoveryKey);
  }
}

export function createFileRetryKeyStore(idFactory: () => string = () => crypto.randomUUID()) {
  const keys = new Map<File, string>();
  return {
    acquire(file: File): string {
      const current = keys.get(file) ?? idFactory();
      keys.set(file, current);
      return current;
    },
    retire(file: File): void {
      keys.delete(file);
    },
    clear(): void {
      keys.clear();
    },
  };
}

export async function mapSettledWithConcurrency<Input, Output>(
  items: readonly Input[],
  concurrency: number,
  operation: (item: Input, index: number) => Promise<Output>,
): Promise<PromiseSettledResult<Output>[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive safe integer");
  }
  const results = new Array<PromiseSettledResult<Output>>(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await operation(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

export function rejectedInputs<Input, Output>(
  inputs: readonly Input[],
  results: readonly PromiseSettledResult<Output>[],
): Input[] {
  return inputs.filter((_, index) => results[index]?.status === "rejected");
}

async function fetchWithRetry(
  request: typeof fetch,
  input: string,
  init: RequestInit,
  onDefinitiveResponse: () => void = () => undefined,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await request(input, init);
    } catch (error) {
      lastError = error;
      continue;
    }
    if (response.ok) return response;
    if (![408, 429].includes(response.status) && response.status < 500) {
      onDefinitiveResponse();
      throw new RagUploadDefinitiveResponseError(response.status);
    }
    lastError = new Error(`RAG upload retryable response ${response.status}`);
  }
  throw lastError instanceof Error ? lastError : new Error("RAG upload failed");
}

export function mediaType(filename: string) {
  const extension = filename.toLocaleLowerCase().split(".").pop();
  if (extension && RAG_MEDIA_TYPES[extension]) return RAG_MEDIA_TYPES[extension];
  throw new TypeError("지원하지 않는 문서 형식입니다.");
}

export function firstQueryValue(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export function queryValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map((item) => item.trim()).filter(Boolean);
}
