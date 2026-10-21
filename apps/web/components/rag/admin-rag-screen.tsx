"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { sha256 as createSha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  ConsoleBadge,
  ConsoleMetricStrip,
  ConsoleSearchControl,
  type ConsoleMetricItem,
} from "@/components/admin/console/console-ui";
import { ConsoleDrawer, ConsoleModal } from "@/components/admin/console/console-modal";
import {
  loadRagJobSummary,
  type RagJobSummaryState,
} from "@/components/screens/admin-functional-screen";
import { RagFileTile, RagFolderIcon, RagTrashIcon, RagTreeChevron } from "./rag-file-icons";
import { adminUserLabel, requestAdminUserLabels } from "@/lib/admin/user-labels";
import type { ScreenDefinition } from "@/lib/screens/registry";
import type { RagQuery } from "./rag-functional-screen";
import { ragScreenPrimaryActions } from "./rag-screen-actions";
import { AdminRagSpreadsheetPreview } from "./admin-rag-spreadsheet-preview";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { AuthenticatedDownloadLink } from "@/components/auth/authenticated-download-link";
import { AuthenticatedResourceFrame } from "@/components/auth/authenticated-resource-frame";
import { errorMessage } from "@/lib/user-facing-message";

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
  document_id?: string;
  upload_cancel_allowed?: boolean;
  status: string;
  progress?: number;
  failure_code?: string;
  filename?: string;
}>;

const TERMINAL_RAG_JOB_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);
const CANCELLABLE_RAG_UPLOAD_STATES = new Set(["QUEUED", "RETRY_WAIT", "FAILED"]);

export function shouldPollRagJob(status: string | undefined, hidden: boolean): boolean {
  return !hidden && !TERMINAL_RAG_JOB_STATES.has(status ?? "");
}

export function canCancelRagUpload(job: RagJob | null): boolean {
  return Boolean(
    job?.document_id && job.upload_cancel_allowed && CANCELLABLE_RAG_UPLOAD_STATES.has(job.status),
  );
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
  const initialDocumentQuery = useMemo(() => ragDocumentQueryFromRoute(query), [query]);
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
    documentQuery,
    runBulk,
    message,
    setMessage,
  } = useAdminWorkspace(folderId, initialDocumentQuery);
  const [jobSummary, setJobSummary] = useState<RagJobSummaryState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    void loadRagJobSummary().then((summary) => {
      if (!cancelled) setJobSummary(summary);
    });
    return () => {
      cancelled = true;
    };
  }, []);
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
  const deleteReturnHref = ragWorkspaceHref(selectedFolder?.folder_id ?? folderId, documentQuery);
  const jobIds = queryValues(query.jobId);
  const showRetryOverlay = screen.id === "A-RAG-004" && retryJobId !== undefined;
  const showUploadOverlay = screen.id === "A-RAG-004" && retryJobId === undefined;
  const showJobOverlay = screen.id === "A-RAG-005" && jobIds.length > 0;

  return (
    <ScreenFrame screen={screen}>
      <div className="civic-rag-admin-layout" data-wireflow-layout="rag-workspace">
        <FolderTree
          folders={folders}
          onSelect={selectFolder}
          selectedFolderId={selectedFolder?.folder_id}
        />
        <section className="civic-rag-admin-workspace">
          <div className="civic-rag-workspace-overview">
            <WorkspaceHeading folder={selectedFolder} />
            <ConsoleMetricStrip
              ariaLabel="문서 처리 현황"
              metrics={ragJobSummaryMetrics(jobSummary, pageState.total)}
            />
          </div>
          <DocumentWorkspace
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
            initialQuery={initialDocumentQuery}
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
          deleteHref={ragDocumentDeleteHref(
            inspected.document.folder_id,
            inspected.document.document_id,
            documentQuery,
          )}
          document={inspected.document}
          onBulk={runBulk}
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
      {showUploadOverlay ? (
        <AdminRagModal closeHref={deleteReturnHref} title="문서 업로드">
          <UploadPanel
            folder={selectedFolder}
            onAccepted={refreshDocuments}
            onMessage={setMessage}
            query={query}
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
            returnHref={deleteReturnHref}
          />
        </AdminRagModal>
      ) : null}
      {showRetryOverlay && retryJobId !== undefined ? (
        <AdminRagModal
          closeHref={deleteReturnHref}
          title={`${retryFilename ?? "실패 문서"} 재처리`}
        >
          <AutomaticRagJobRetryPanel
            jobId={retryJobId}
            key={retryJobId}
            {...(retryFilename ? { filename: retryFilename } : {})}
          />
        </AdminRagModal>
      ) : null}
      {showJobOverlay ? (
        <AdminRagModal closeHref={deleteReturnHref} title="업로드한 문서">
          <div className="civic-job-overlay" data-wireflow-layout="rag-job-status">
            <JobPanel key={jobPanelKey(queryValues(query.jobId))} query={query} />
          </div>
        </AdminRagModal>
      ) : null}
    </ScreenFrame>
  );
}

export function ragJobSummaryMetrics(
  summary: RagJobSummaryState,
  totalDocuments: number,
): readonly ConsoleMetricItem[] {
  const pendingValue = summary.status === "loading" ? "확인 중" : "확인 불가";
  const pendingDescription =
    summary.status === "loading"
      ? "문서 처리 상태 확인 중"
      : "문서 처리 현황을 불러오지 못했습니다";
  return [
    {
      label: "문서 수",
      value: `${totalDocuments.toLocaleString("ko-KR")}개`,
      description: "현재 목록 기준",
    },
    summary.status === "ready"
      ? {
          label: "처리 중",
          value: `${summary.active.toLocaleString("ko-KR")}건`,
          description: "변환·색인 진행 작업",
        }
      : { label: "처리 중", value: pendingValue, description: pendingDescription },
    summary.status === "ready"
      ? {
          label: "실패",
          value: `${summary.failed.toLocaleString("ko-KR")}건`,
          description: summary.failed > 0 ? "실패 작업 재시도 가능" : "실패한 작업 없음",
          ...(summary.failed > 0 ? { alert: true } : {}),
        }
      : { label: "실패", value: pendingValue, description: pendingDescription },
  ];
}

function AdminRagModal({
  children,
  closeHref,
  title,
}: Readonly<{ children: ReactNode; closeHref: Route; title: string }>) {
  const router = useRouter();
  return (
    <ConsoleModal ariaLabel={title} onClose={() => router.push(closeHref)} open>
      <section className="wf-rag-admin-dialog" data-wireflow-layout="rag-admin-modal">
        <header>
          <h2 id="wf-rag-admin-dialog-title">{title}</h2>
          <Link aria-label={`${title} 닫기`} href={closeHref}>
            ×
          </Link>
        </header>
        {children}
      </section>
    </ConsoleModal>
  );
}

function useAdminWorkspace(
  initialFolderId: string | undefined,
  initialDocumentQuery: RagDocumentListQuery,
) {
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
  const [documentQuery, setDocumentQuery] = useState(initialDocumentQuery);
  const documentQueryRef = useRef<RagDocumentListQuery>(initialDocumentQuery);
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
        setDocumentQuery(nextQuery);
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
    const timer = window.setTimeout(() => void load(initialFolderId, initialDocumentQuery), 0);
    return () => {
      window.clearTimeout(timer);
      loadGate.cancel();
    };
  }, [initialDocumentQuery, initialFolderId, load]);

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
    documentQuery,
    queryDocuments: (patch: Partial<RagDocumentListQuery>) => {
      const nextQuery = { ...documentQueryRef.current, ...patch };
      documentQueryRef.current = nextQuery;
      setDocumentQuery(nextQuery);
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
      <ul aria-label="문서 폴더 트리">
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
  deleteHref,
  document,
  onBulk,
  onClose,
  version,
}: Readonly<{
  creatorLabel: string;
  deleteHref?: Route;
  document: RagDocument;
  onBulk?: (input: RagBulkActionInput) => void | Promise<void>;
  onClose: () => void;
  version: DocumentVersion | null;
}>) {
  const filename = displayRagFilename(document.filename);
  const resolvedDeleteHref =
    deleteHref ??
    ragDocumentDeleteHref(document.folder_id, document.document_id, DEFAULT_DOCUMENT_QUERY);
  const originalHref = version
    ? `/api/v1/rag/documents/${encodeURIComponent(document.document_id)}/versions/${encodeURIComponent(version.document_version_id)}/original`
    : undefined;
  const previewHref = version
    ? `/api/v1/rag/documents/${encodeURIComponent(document.document_id)}/versions/${encodeURIComponent(version.document_version_id)}/preview?disposition=inline`
    : undefined;
  const newVersionHref = version
    ? (`/admin/rag/upload?folderId=${encodeURIComponent(document.folder_id)}&mode=NEW_VERSION&documentId=${encodeURIComponent(document.document_id)}&versionId=${encodeURIComponent(version.document_version_id)}` as Route)
    : undefined;
  return (
    <ConsoleDrawer ariaLabel={`${filename} 문서 미리보기`} onClose={onClose} open>
      <aside className="civic-document-inspector">
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
            <p>다운로드를 이용해 문서를 확인하세요.</p>
          </div>
        )}
        <dl>
          <div>
            <dt>상태</dt>
            <dd>
              <ConsoleBadge tone={ragStatusBadgeTone(version?.status ?? "처리 대기")}>
                {documentStatusLabel(version?.status ?? "처리 대기")}
              </ConsoleBadge>
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
        <div className="wf-inspector-actions">
          <Link
            className="civic-secondary-action"
            href={processingJobHref(version, document?.folder_id)}
          >
            처리 상태
          </Link>
          {originalHref ? (
            <AuthenticatedDownloadLink className="civic-secondary-action" href={originalHref}>
              다운로드
            </AuthenticatedDownloadLink>
          ) : null}
          {newVersionHref ? (
            <Link className="civic-secondary-action" href={newVersionHref}>
              새 버전
            </Link>
          ) : null}
          {onBulk ? (
            <button
              className="civic-secondary-action"
              onClick={() =>
                void onBulk({ action: "REINDEX", documentIds: [document.document_id] })
              }
              type="button"
            >
              다시 처리
            </button>
          ) : null}
          {onBulk ? (
            <label className="civic-secondary-action civic-inspector-search-toggle">
              <input
                aria-label={`${filename} 검색에서 제외`}
                checked={document.search_enabled === false}
                onChange={(event) =>
                  void onBulk({
                    action: "SET_SEARCH_ENABLED",
                    documentIds: [document.document_id],
                    searchEnabled: searchEnabledFromExcluded(event.target.checked),
                  })
                }
                type="checkbox"
              />
              <span>검색에서 제외</span>
            </label>
          ) : null}
          <Link className="civic-danger-action" href={resolvedDeleteHref}>
            문서 삭제
          </Link>
        </div>
      </aside>
    </ConsoleDrawer>
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
  onInspect,
  onQueryChange,
  onBulk,
  pageState = EMPTY_DOCUMENT_PAGE,
  initialQuery = DEFAULT_DOCUMENT_QUERY,
  selectedDocumentId,
}: Readonly<{
  documents: RagDocument[];
  folder: Folder | undefined;
  folders?: Folder[];
  creatorLabels?: ReadonlyMap<string, string>;
  onInspect: (document: RagDocument, version: DocumentVersion | null) => void;
  onQueryChange?: (query: Partial<RagDocumentListQuery>) => void;
  onBulk?: (input: RagBulkActionInput) => void | Promise<void>;
  pageState?: RagDocumentPageState;
  initialQuery?: RagDocumentListQuery;
  selectedDocumentId: string | undefined;
}>) {
  const [searchInput, setSearchInput] = useState(initialQuery.query);
  const [searchQuery, setSearchQuery] = useState(initialQuery.query);
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>(() =>
    documentStatusFilter(initialQuery.status),
  );
  const [mediaTypeFilter, setMediaTypeFilter] = useState(initialQuery.mediaType ?? "");
  const [createdByFilter, setCreatedByFilter] = useState(initialQuery.createdBy ?? "");
  const [includeSubfolders, setIncludeSubfolders] = useState(initialQuery.includeSubfolders);
  const [sortDirection, setSortDirection] = useState<RagDocumentListQuery["direction"]>(
    initialQuery.direction,
  );
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
  const retainedQuery: RagDocumentListQuery = {
    page: pageState.page,
    pageSize: pageState.pageSize,
    query: searchQuery,
    status: documentStatusQuery(statusFilter),
    ...(mediaTypeFilter ? { mediaType: mediaTypeFilter } : {}),
    ...(createdByFilter ? { createdBy: createdByFilter } : {}),
    includeSubfolders,
    sort: initialQuery.sort,
    direction: sortDirection,
  };

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
      <form
        className="wf-document-filters"
        onSubmit={(event) => {
          event.preventDefault();
          const query = searchInput.trim();
          setSearchQuery(query);
          onQueryChange?.({ query, page: 1 });
        }}
      >
        <ConsoleSearchControl
          ariaLabel="문서명 검색"
          onChange={setSearchInput}
          placeholder="문서명을 검색해 주세요."
          value={searchInput}
        />
        <label>
          <span>검색 준비 상태</span>
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
      <div className="civic-bulk-action-row">
        <div aria-label="선택 문서 작업" className="civic-bulk-toolbar" role="toolbar">
          <strong>{selectedIds.size}개 선택</strong>
          <button
            className="civic-secondary-action"
            disabled={selectedIds.size === 0}
            onClick={() => submitBulk({ action: "REINDEX" })}
            type="button"
          >
            선택 문서 다시 처리
          </button>
          <button
            className="civic-danger-action"
            disabled={selectedIds.size === 0}
            onClick={() => submitBulk({ action: "CANCEL" })}
            type="button"
          >
            처리 중단
          </button>
          <button
            className="civic-secondary-action"
            disabled={selectedIds.size === 0}
            onClick={() => submitBulk({ action: "SET_SEARCH_ENABLED", searchEnabled: false })}
            type="button"
          >
            검색에서 제외
          </button>
          <select
            aria-label="선택 문서 이동 대상 폴더"
            onChange={(event) => setMoveFolderId(event.target.value)}
            value={moveFolderId}
          >
            <option value="">이동할 폴더</option>
            {folders
              .filter((candidate) => candidate.folder_id !== folder?.folder_id)
              .map((candidate) => (
                <option key={candidate.folder_id} value={candidate.folder_id}>
                  {(candidate.path ?? [candidate.name]).join(" / ")}
                </option>
              ))}
          </select>
          <button
            className="civic-secondary-action"
            disabled={selectedIds.size === 0 || !moveFolderId}
            onClick={() => submitBulk({ action: "MOVE", folderId: moveFolderId })}
            type="button"
          >
            선택 문서 이동
          </button>
          <button
            className="civic-danger-action is-danger"
            disabled={selectedIds.size === 0}
            onClick={() => submitBulk({ action: "DELETE" })}
            type="button"
          >
            삭제
          </button>
        </div>
        <Link
          className="civic-primary-action civic-upload-dialog-trigger"
          href={ragUploadHref(folder?.folder_id, retainedQuery)}
        >
          + 문서 업로드
        </Link>
      </div>
      {documents.length === 0 ? (
        <div className="civic-admin-empty">
          <strong>이 폴더에는 문서가 없습니다.</strong>
          <p>PDF·텍스트·이미지·Office·한글 문서를 올리면 변환과 색인이 시작됩니다.</p>
        </div>
      ) : visibleDocuments.length === 0 ? (
        <div className="civic-admin-empty">
          <strong>검색 조건에 맞는 문서가 없습니다.</strong>
          <p>문서명 또는 검색 준비 상태를 변경해 다시 확인해 주세요.</p>
        </div>
      ) : (
        <div aria-label="문서 목록 표" className="civic-table-scroll" role="region" tabIndex={0}>
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
                <th>페이지</th>
                <th>검색 준비 상태</th>
                <th>등록자</th>
                <th aria-sort={sortDirection === "desc" ? "descending" : "ascending"}>
                  <button
                    className="civic-sort-button"
                    onClick={() => {
                      const nextDirection = sortDirection === "desc" ? "asc" : "desc";
                      setSortDirection(nextDirection);
                      onQueryChange?.({
                        sort: "created_at",
                        direction: nextDirection,
                        page: 1,
                      });
                    }}
                    type="button"
                  >
                    등록일 {sortDirection === "desc" ? "↓" : "↑"}
                  </button>
                </th>
                <th>버전</th>
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
            : `${(pageState.page - 1) * pageState.pageSize + 1}-${Math.min(pageState.page * pageState.pageSize, pageState.total)} / 전체 ${pageState.total.toLocaleString("ko-KR")}개`}
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
    </div>
  );
}

function documentStatusQuery(status: DocumentStatusFilter): RagDocumentListQuery["status"] {
  if (status === "READY") return "ACTIVE";
  if (status === "PROCESSING") return "PROCESSING";
  if (status === "FAILED") return "FAILED";
  return "";
}

function documentStatusFilter(status: RagDocumentListQuery["status"]): DocumentStatusFilter {
  if (status === "ACTIVE") return "READY";
  if (status === "PROCESSING") return "PROCESSING";
  if (status === "FAILED") return "FAILED";
  return "ALL";
}

export function searchEnabledFromExcluded(excluded: boolean): boolean {
  return !excluded;
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
  onInspect,
  selected,
}: Readonly<{
  document: RagDocument;
  folder: Folder | undefined;
  creatorLabel: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
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
    <tr
      aria-label={`${filename} 미리보기`}
      aria-selected={selected}
      className="civic-document-row"
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("a, button, input, select, textarea, label, details, summary")
        )
          return;
        onInspect(document, selectedVersion);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        onInspect(document, selectedVersion);
      }}
      tabIndex={0}
    >
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
      <td>{formatPageCount(selectedVersion?.page_count)}</td>
      <td>
        {selectedVersion?.job_id ? (
          <Link
            aria-label={`${filename} 처리 상태 보기`}
            href={processingJobHref(selectedVersion, folder?.folder_id ?? document.folder_id)}
          >
            <ConsoleBadge tone={ragStatusBadgeTone(selectedStatus)}>
              {documentStatusLabel(selectedStatus)}
            </ConsoleBadge>
          </Link>
        ) : (
          <ConsoleBadge tone={ragStatusBadgeTone(selectedStatus)}>
            {documentStatusLabel(selectedStatus)}
          </ConsoleBadge>
        )}
        {document.search_enabled === false ? (
          <span className="civic-search-toggle">검색에서 제외</span>
        ) : null}
      </td>
      <td>{creatorLabel}</td>
      <td>{formatAdminDate(document.created_at)}</td>
      <td>
        {(activeVersion?.version_number ?? 1) <= 1 && displayVersions.length <= 1 ? (
          <span className="civic-version-single">v{activeVersion?.version_number ?? 1}</span>
        ) : (
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
        )}
        {versionLoadMessage ? <small role="status">{versionLoadMessage}</small> : null}
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
  // 필터 옵션(RAG_DOCUMENT_MEDIA_TYPE_OPTIONS)과 동일한 표기를 사용해
  // 목록 행과 필터의 문서 형식 라벨을 통일한다.
  const label = value
    ? RAG_DOCUMENT_MEDIA_TYPE_OPTIONS.find(([mediaTypeValue]) => mediaTypeValue === value)?.[1]
    : undefined;
  return label ?? "문서";
}

export function ragStatusBadgeTone(status: string): "neutral" | "active" | "danger" | "success" {
  if (["ACTIVE", "READY", "SUCCEEDED"].includes(status)) return "success";
  if (status === "FAILED") return "danger";
  if (["PROCESSING", "QUEUED", "RUNNING", "RETRY_WAIT"].includes(status)) return "active";
  return "neutral";
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

type RagUploadProblem = Readonly<{
  code?: unknown;
  details?: unknown;
  message?: unknown;
}>;

export type RagUploadDuplicateResolution = Readonly<{
  action: "KEEP_EXISTING" | "RETRY_FAILED" | "UPLOAD_NEW_VERSION";
  conflictKind: "SAME_CONTENT" | "SAME_FILENAME";
  documentId: string;
  existingFilename?: string;
  jobId?: string;
}>;

export type PendingRagUploadConflict = Readonly<{
  file: File;
  resolution: RagUploadDuplicateResolution;
}>;

export function readRagUploadDuplicateResolution(
  error: unknown,
): RagUploadDuplicateResolution | undefined {
  if (
    !(error instanceof RagUploadDefinitiveResponseError) ||
    error.status !== 409 ||
    error.problem?.code !== "DOCUMENT_ALREADY_EXISTS" ||
    !error.problem.details ||
    typeof error.problem.details !== "object"
  ) {
    return undefined;
  }
  const details = error.problem.details as Record<string, unknown>;
  const documentId = details.document_id;
  const conflictKind = details.conflict_kind;
  const action = details.suggested_action;
  const jobId = details.job_id;
  if (
    typeof documentId !== "string" ||
    !documentId ||
    (conflictKind !== "SAME_CONTENT" && conflictKind !== "SAME_FILENAME") ||
    (action !== "KEEP_EXISTING" && action !== "RETRY_FAILED" && action !== "UPLOAD_NEW_VERSION") ||
    (action === "RETRY_FAILED" && (typeof jobId !== "string" || !jobId))
  ) {
    return undefined;
  }
  return {
    action,
    conflictKind,
    documentId,
    ...(typeof details.filename === "string" && details.filename
      ? { existingFilename: details.filename }
      : {}),
    ...(typeof jobId === "string" && jobId ? { jobId } : {}),
  };
}

export function RagUploadConflictDialog({
  busy,
  conflict,
  onCancel,
  onConfirm,
}: Readonly<{
  busy: boolean;
  conflict: PendingRagUploadConflict;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const { action, existingFilename } = conflict.resolution;
  const filename = existingFilename ?? conflict.file.name;
  const copy =
    action === "UPLOAD_NEW_VERSION"
      ? {
          confirmLabel: "새 버전으로 갱신",
          description: (
            <p>
              <strong>{filename}</strong> 문서가 이미 있습니다. 선택한 파일을 기존 문서의 새
              버전으로 등록하시겠습니까?
            </p>
          ),
          title: "이미 업로드된 문서입니다",
        }
      : action === "RETRY_FAILED"
        ? {
            confirmLabel: "기존 문서 다시 처리",
            description: (
              <p>
                <strong>{filename}</strong> 문서와 내용이 같은 파일이 처리 실패 상태로 남아
                있습니다. 파일을 중복 저장하지 않고 기존 문서를 다시 처리하시겠습니까?
              </p>
            ),
            title: "실패한 동일 문서가 있습니다",
          }
        : {
            confirmLabel: "업로드 목록에서 제외",
            description: (
              <p>
                <strong>{filename}</strong> 문서와 동일한 내용이 이미 등록되어 있습니다. 내용이 같아
                새 버전을 만들지 않습니다.
              </p>
            ),
            title: "동일한 문서가 이미 등록되어 있습니다",
          };
  return (
    <ConfirmDialog
      busy={busy}
      busyLabel="처리 중…"
      confirmLabel={copy.confirmLabel}
      description={copy.description}
      onCancel={onCancel}
      onConfirm={onConfirm}
      open
      title={copy.title}
    />
  );
}

function UploadPanel({
  folder,
  onAccepted,
  query,
  onMessage,
}: Readonly<{
  folder: Folder | undefined;
  onAccepted?: () => void;
  query: RagQuery;
  onMessage: (message: string) => void;
}>) {
  const router = useRouter();
  const mode = firstQueryValue(query.mode) === "NEW_VERSION" ? "NEW_VERSION" : "NEW_DOCUMENT";
  const documentId = firstQueryValue(query.documentId);
  const uploadReturnHref = ragWorkspaceHref(
    folder?.folder_id ?? firstQueryValue(query.folderId),
    ragDocumentQueryFromRoute(query),
  );
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeUpload, setActiveUpload] = useState<
    Readonly<{ filename: string; index: number; total: number }> | undefined
  >();
  const [uploadProgress, setUploadProgress] = useState<ReadonlyMap<File, string>>(() => new Map());
  const [acceptedJobs, setAcceptedJobs] = useState<Array<{ filename: string; jobId: string }>>([]);
  const [pendingConflicts, setPendingConflicts] = useState<PendingRagUploadConflict[]>([]);
  const completionRecoveries = useRef(new Map<File, string>());
  const initiationKeys = useRef(createFileRetryKeyStore());
  const conflictRetryKeys = useRef(createFileRetryKeyStore());
  const activeConflict = pendingConflicts[0];

  function discardQueuedFile(file: File) {
    const recoveryKey = multipartFileRecoveryKey(file);
    completionRecoveries.current.delete(recoveryKey);
    initiationKeys.current.retire(recoveryKey);
    conflictRetryKeys.current.retire(recoveryKey);
    setUploadProgress((current) => {
      const next = new Map(current);
      next.delete(file);
      return next;
    });
    setFiles((current) => current.filter((candidate) => candidate !== file));
  }

  function removeQueuedFile(file: File) {
    if (busy) return;
    discardQueuedFile(file);
  }

  async function uploadFile(file: File, targetDocumentId?: string) {
    if (!folder) throw new Error("RAG upload folder is unavailable");
    const recoveryKey = multipartFileRecoveryKey(file);
    const completionUploadId = completionRecoveries.current.get(recoveryKey);
    const initIdempotencyKey = completionUploadId
      ? undefined
      : initiationKeys.current.acquire(recoveryKey);
    const effectiveDocumentId =
      targetDocumentId ?? (mode === "NEW_VERSION" ? documentId : undefined);
    try {
      const accepted = await uploadRagFileMultipart({
        file,
        folderId: folder.folder_id,
        ...(effectiveDocumentId ? { documentId: effectiveDocumentId } : {}),
        ...(completionUploadId ? { completionUploadId } : {}),
        ...(initIdempotencyKey ? { initIdempotencyKey } : {}),
        onInitiationSettled: () => initiationKeys.current.retire(recoveryKey),
        onProgress: (uploadedParts, totalParts) => {
          setUploadProgress((current) => {
            const next = new Map(current);
            next.set(file, `${uploadedParts}/${totalParts} 전송됨`);
            return next;
          });
          onMessage(`${file.name}: ${uploadedParts}/${totalParts} 전송 중`);
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
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folder || files.length === 0 || (mode === "NEW_VERSION" && !documentId)) {
      return;
    }
    setBusy(true);
    const uploadBatch = [...files];
    const results = await mapSettledWithConcurrency(uploadBatch, 1, (file, index) => {
      setActiveUpload({ filename: file.name, index: index + 1, total: uploadBatch.length });
      onMessage(`${file.name}: ${index + 1}/${uploadBatch.length} 업로드를 시작합니다.`);
      return uploadFile(file);
    });
    const conflicts = results.flatMap((result, index) => {
      const file = uploadBatch[index];
      const resolution =
        result.status === "rejected" ? readRagUploadDuplicateResolution(result.reason) : undefined;
      return file && resolution ? [{ file, resolution }] : [];
    });
    const failedResults = results.flatMap((result, index) => {
      if (result.status !== "rejected" || readRagUploadDuplicateResolution(result.reason)) {
        return [];
      }
      return [ragUploadFailureMessage(uploadBatch[index]?.name ?? "선택한 파일", result.reason)];
    });
    const rejected = results.filter((result) => result.status === "rejected").length;
    const acceptedNow = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    setPendingConflicts(conflicts);
    setAcceptedJobs((current) => [...current, ...acceptedNow]);
    setFiles(rejectedInputs(uploadBatch, results));
    const messages = [
      ...(conflicts.length > 0
        ? [`${conflicts.length}개 파일은 기존 문서 처리 방법을 확인해 주세요.`]
        : []),
      ...(failedResults.length > 0
        ? [`${failedResults.length}개 파일 전송에 실패했습니다. ${failedResults.join(" ")}`]
        : []),
      ...(acceptedNow.length > 0 ? [`${acceptedNow.length}개 파일을 접수했습니다.`] : []),
    ];
    onMessage(messages.join(" "));
    if (acceptedNow.length > 0) onAccepted?.();
    setActiveUpload(undefined);
    setBusy(false);
    if (rejected === 0 && acceptedNow.length > 0) {
      router.push(ragJobsHref(acceptedNow, folder.folder_id, ragDocumentQueryFromRoute(query)));
    }
  }

  function cancelActiveConflict() {
    if (!activeConflict || busy) return;
    setPendingConflicts((current) => current.slice(1));
    onMessage(`${activeConflict.file.name}: 기존 문서를 변경하지 않았습니다.`);
  }

  async function confirmActiveConflict() {
    if (!activeConflict || !folder || busy) return;
    const { file, resolution } = activeConflict;
    if (resolution.action === "KEEP_EXISTING") {
      discardQueuedFile(file);
      setPendingConflicts((current) => current.slice(1));
      onMessage(`${file.name}: 동일 내용이 이미 등록되어 업로드 목록에서 제외했습니다.`);
      return;
    }

    setBusy(true);
    try {
      let accepted: { filename: string; jobId: string };
      if (resolution.action === "RETRY_FAILED") {
        if (!resolution.jobId) throw new Error("실패 작업 정보를 확인할 수 없습니다.");
        const retryKey = conflictRetryKeys.current.acquire(file);
        const result = await requestRagJobRetry({
          jobId: resolution.jobId,
          idempotencyKey: retryKey,
        });
        if (result.definitive) conflictRetryKeys.current.retire(file);
        if (result.kind !== "accepted" || !result.acceptedJobId) {
          throw new Error(
            result.kind === "network" || result.kind === "malformed"
              ? "네트워크 오류로 기존 문서를 다시 처리하지 못했습니다. 다시 시도하세요."
              : "문서 상태가 변경되어 다시 처리를 시작하지 못했습니다. 목록을 새로고침하세요.",
          );
        }
        accepted = {
          filename: resolution.existingFilename ?? file.name,
          jobId: result.acceptedJobId,
        };
      } else {
        accepted = await uploadFile(file, resolution.documentId);
      }
      discardQueuedFile(file);
      setPendingConflicts((current) => current.slice(1));
      setAcceptedJobs((current) => [...current, accepted]);
      onAccepted?.();
      onMessage(
        resolution.action === "RETRY_FAILED"
          ? `${accepted.filename}: 기존 문서 재처리를 접수했습니다.`
          : `${accepted.filename}: 새 버전 업로드를 접수했습니다.`,
      );
    } catch (error) {
      onMessage(
        resolution.action === "UPLOAD_NEW_VERSION"
          ? ragUploadFailureMessage(file.name, error)
          : errorMessage(error, `${file.name}: 기존 문서를 다시 처리하지 못했습니다.`),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="civic-rag-form" onSubmit={upload}>
      <div className="civic-upload-mode">
        {mode === "NEW_VERSION" ? <strong>새 버전</strong> : null}
        <p>
          {mode === "NEW_VERSION"
            ? "선택한 문서에 새 버전을 등록합니다."
            : `${folder?.name ?? "선택 필요"} 폴더에 새 문서를 업로드합니다.`}
        </p>
      </div>
      <p className="civic-help">
        여러 파일을 한 번에 선택할 수 있습니다. PDF·텍스트·이미지·Office·한글 문서를 지원합니다.
      </p>
      <label
        className="civic-upload-dropzone"
        onDragOver={(event) => {
          if (canSelectUploadFiles(busy)) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!canSelectUploadFiles(busy)) return;
          event.preventDefault();
          const selected = Array.from(event.dataTransfer.files);
          const accepted = acceptRagUploadFiles(selected, mode === "NEW_DOCUMENT");
          setFiles((current) => appendRagUploadFiles(current, selected, mode === "NEW_DOCUMENT"));
          if (accepted.length !== event.dataTransfer.files.length) {
            onMessage(ragUploadExclusionMessage(selected));
          }
        }}
      >
        <strong>파일 선택</strong>
        {files.length > 0 ? <span>{files.length}개 선택됨</span> : null}
        <input
          accept={RAG_ACCEPTED_EXTENSIONS.join(",")}
          disabled={!canSelectUploadFiles(busy)}
          multiple={mode === "NEW_DOCUMENT"}
          onChange={(event) => {
            if (!canSelectUploadFiles(busy)) return;
            const selected = Array.from(event.target.files ?? []);
            const accepted = acceptRagUploadFiles(selected, mode === "NEW_DOCUMENT");
            setFiles((current) => appendRagUploadFiles(current, selected, mode === "NEW_DOCUMENT"));
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
      {activeUpload ? (
        <div aria-live="polite" className="civic-upload-batch-progress">
          <span className="civic-doc-cell">
            <RagFileTile filename={activeUpload.filename} />
            <strong>{activeUpload.filename}</strong>
          </span>
          <b>
            {activeUpload.index}/{activeUpload.total}
          </b>
        </div>
      ) : null}
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
        <Link className="civic-secondary-action" href={uploadReturnHref}>
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
      {activeConflict ? (
        <RagUploadConflictDialog
          busy={busy}
          conflict={activeConflict}
          onCancel={cancelActiveConflict}
          onConfirm={() => void confirmActiveConflict()}
        />
      ) : null}
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

export function appendRagUploadFiles(
  current: readonly File[],
  selected: readonly File[],
  multiple: boolean,
): File[] {
  const accepted = acceptRagUploadFiles(selected, multiple);
  if (!multiple) return accepted;
  const known = new Set(current.map(multipartFileRecoveryKey));
  return [
    ...current,
    ...accepted.filter((file) => {
      const key = multipartFileRecoveryKey(file);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    }),
  ];
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
    if (readRagUploadDuplicateResolution(error)) {
      return `${filename}: 기존 문서 처리 방법을 확인해 주세요.`;
    }
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
  cancelling = false,
  filename,
  headingId = "civic-job-status-title",
  job,
  message,
  onCancelUpload,
  onRetry,
  replacementHref,
  retrying,
  workspaceHref = ragWorkspaceHref(undefined),
}: Readonly<{
  filename?: string;
  headingId?: string;
  job: RagJob | null;
  message: string;
  onCancelUpload?: () => void;
  onRetry: () => void;
  cancelling?: boolean;
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
  const canCancelUpload = canCancelRagUpload(job);

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
          <ConsoleBadge tone={job ? ragStatusBadgeTone(job.status) : "neutral"}>
            {statusLabel}
          </ConsoleBadge>
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

      {message ? (
        <p aria-live="polite" className="civic-job-live-message">
          {message}
        </p>
      ) : null}

      <div className="civic-form-actions civic-job-actions">
        <Link className="civic-secondary-action" href={workspaceHref}>
          문서 목록
        </Link>
        {canCancelUpload ? (
          <button
            className="civic-danger-action"
            disabled={cancelling || retrying || Boolean(replacementHref) || !onCancelUpload}
            onClick={onCancelUpload}
            type="button"
          >
            {cancelling ? "업로드 취소 중…" : "업로드 취소"}
          </button>
        ) : null}
        {job?.status === "FAILED" ? (
          <button
            className="civic-primary-action"
            disabled={cancelling || retrying || Boolean(replacementHref)}
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
  const [currentIndex, setCurrentIndex] = useState(0);
  if (jobIds.length === 0) {
    return (
      <RagJobStatusCard
        job={null}
        message="작업 ID가 필요합니다."
        onRetry={() => undefined}
        retrying={false}
        workspaceHref={ragWorkspaceHref(folderId)}
      />
    );
  }
  const safeIndex = Math.min(currentIndex, jobIds.length - 1);
  const jobId = jobIds[safeIndex]!;
  return (
    <div aria-label="업로드한 문서 준비 상태" className="civic-job-batch">
      <div aria-label="업로드 결과 이동" className="civic-job-batch-navigation">
        <button
          disabled={safeIndex === 0}
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          type="button"
        >
          이전
        </button>
        <strong>
          {safeIndex + 1} / {jobIds.length}
        </strong>
        <button
          disabled={safeIndex >= jobIds.length - 1}
          onClick={() => setCurrentIndex((index) => Math.min(jobIds.length - 1, index + 1))}
          type="button"
        >
          이후
        </button>
      </div>
      <JobStatusItem
        headingId={`civic-job-status-title-${safeIndex}`}
        jobId={jobId}
        key={`${jobId}-${safeIndex}`}
        {...(folderId ? { folderId } : {})}
        {...(filenames[safeIndex] ? { filename: filenames[safeIndex] } : {})}
      />
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
  const router = useRouter();
  const [job, setJob] = useState<RagJob | null>(null);
  const [replacementJobId, setReplacementJobId] = useState<string | null>(null);
  const retryOperation = useRef(createRetryOperation());
  const cancellationOperation = useRef(createRetryOperation());
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState("문서 처리 상태를 불러오는 중입니다…");

  const refresh = useCallback(async () => {
    const latest = await loadRagJob(jobId);
    if (!latest) return setMessage("처리 상태를 불러오지 못했습니다. 다시 시도해 주세요.");
    const recoveredFilename =
      !filename && latest.status === "FAILED" ? await loadRagJobFilename(jobId) : null;
    setJob(recoveredFilename ? { ...latest, filename: recoveredFilename } : latest);
    setMessage("");
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

  async function cancelUpload() {
    if (!canCancelRagUpload(job) || !job?.document_id || cancelling) {
      setCancelDialogOpen(false);
      return;
    }
    const idempotencyKey = cancellationOperation.current.begin(job.job_id);
    if (!idempotencyKey) {
      setCancelDialogOpen(false);
      return;
    }
    setCancelling(true);
    setMessage("업로드를 취소하고 문서를 정리하는 중입니다…");
    let definitiveResponse = false;
    try {
      const result = await requestRagUploadCancellation({
        documentId: job.document_id,
        jobId: job.job_id,
        status: job.status,
        idempotencyKey,
      });
      definitiveResponse = result.definitive;
      if (result.kind === "network") {
        setMessage("네트워크 오류로 업로드를 취소하지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      if (result.kind === "rejected") {
        setMessage("문서 상태가 변경되어 업로드를 취소하지 못했습니다.");
        return;
      }
      setJob((current) => (current ? { ...current, status: "CANCELLED", progress: 0 } : current));
      setMessage("업로드를 취소하고 문서를 정리했습니다.");
      router.replace(ragWorkspaceHref(folderId));
    } finally {
      cancellationOperation.current.settle(definitiveResponse);
      setCancelling(false);
      setCancelDialogOpen(false);
    }
  }

  return (
    <>
      <RagJobStatusCard
        cancelling={cancelling}
        headingId={headingId}
        job={job}
        message={message}
        onCancelUpload={() => setCancelDialogOpen(true)}
        onRetry={() => void retry()}
        retrying={retrying}
        workspaceHref={ragWorkspaceHref(folderId)}
        {...(filename ? { filename } : {})}
        {...(replacementJobId
          ? { replacementHref: ragJobHref(replacementJobId, folderId, filename) }
          : {})}
      />
      <ConfirmDialog
        busy={cancelling}
        busyLabel="취소 중…"
        cancelLabel="돌아가기"
        confirmLabel="업로드 취소"
        description={
          job?.status === "FAILED"
            ? "실패한 업로드를 취소하면 이 문서와 처리 결과가 삭제됩니다."
            : "대기 중인 업로드를 취소하면 이 문서와 준비 중인 처리 결과가 삭제됩니다."
        }
        destructive
        onCancel={() => setCancelDialogOpen(false)}
        onConfirm={() => void cancelUpload()}
        open={cancelDialogOpen}
        title="업로드를 취소하시겠습니까?"
      />
    </>
  );
}

export type RagUploadCancellationResult = Readonly<{
  kind: "cancelled" | "rejected" | "network";
  definitive: boolean;
}>;

export async function requestRagUploadCancellation({
  documentId,
  jobId,
  status = "FAILED",
  idempotencyKey,
  request = authenticatedFetch,
}: Readonly<{
  documentId: string;
  jobId: string;
  status?: string;
  idempotencyKey: string;
  request?: typeof fetch;
}>): Promise<RagUploadCancellationResult> {
  try {
    const response =
      status === "FAILED"
        ? await request(
            `/api/v1/rag/documents/${encodeURIComponent(documentId)}?failed_job_id=${encodeURIComponent(jobId)}`,
            {
              method: "DELETE",
              headers: { "idempotency-key": idempotencyKey },
            },
          )
        : await request(`/api/v1/rag/jobs/${encodeURIComponent(jobId)}/cancel-upload`, {
            method: "POST",
            headers: { "idempotency-key": idempotencyKey },
          });
    return response.ok
      ? { kind: "cancelled", definitive: true }
      : { kind: "rejected", definitive: true };
  } catch {
    return { kind: "network", definitive: false };
  }
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

export function ragWorkspaceHref(
  folderId: string | undefined,
  query?: RagDocumentListQuery,
): Route {
  const parameters = ragWorkspaceParameters(folderId, query);
  const suffix = parameters.toString();
  return (suffix ? `/admin/rag?${suffix}` : "/admin/rag") as Route;
}

export function ragUploadHref(folderId: string | undefined, query?: RagDocumentListQuery): Route {
  const parameters = ragWorkspaceParameters(folderId, query);
  parameters.set("mode", "NEW_DOCUMENT");
  return `/admin/rag/upload?${parameters.toString()}` as Route;
}

export function ragDocumentDeleteHref(
  folderId: string,
  documentId: string,
  query: RagDocumentListQuery,
): Route {
  const parameters = ragWorkspaceParameters(folderId, query);
  parameters.set("documentId", documentId);
  return `/admin/rag/delete?${parameters.toString()}` as Route;
}

function ragWorkspaceParameters(
  folderId: string | undefined,
  query?: RagDocumentListQuery,
): URLSearchParams {
  const parameters = new URLSearchParams();
  if (folderId) parameters.set("folderId", folderId);
  if (!query) return parameters;
  if (query.query) parameters.set("q", query.query);
  if (query.status) parameters.set("status", query.status);
  if (query.page > 1) parameters.set("page", String(query.page));
  if (query.pageSize !== DEFAULT_DOCUMENT_QUERY.pageSize) {
    parameters.set("pageSize", String(query.pageSize));
  }
  if (query.mediaType) parameters.set("mediaType", query.mediaType);
  if (query.createdBy) parameters.set("createdBy", query.createdBy);
  if (query.includeSubfolders) parameters.set("includeSubfolders", "true");
  if (query.sort !== DEFAULT_DOCUMENT_QUERY.sort) parameters.set("sort", query.sort);
  if (query.direction !== DEFAULT_DOCUMENT_QUERY.direction) {
    parameters.set("direction", query.direction);
  }
  return parameters;
}

export function ragDocumentQueryFromRoute(query: RagQuery): RagDocumentListQuery {
  const page = Number(firstQueryValue(query.page));
  const pageSize = Number(firstQueryValue(query.pageSize));
  const status = firstQueryValue(query.status);
  const sort = firstQueryValue(query.sort);
  const direction = firstQueryValue(query.direction);
  const mediaType = firstQueryValue(query.mediaType);
  const createdBy = firstQueryValue(query.createdBy);
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : DEFAULT_DOCUMENT_QUERY.page,
    pageSize: pageSize === 10 || pageSize === 25 || pageSize === 50 ? pageSize : 25,
    query: firstQueryValue(query.q) ?? "",
    status:
      status === "PENDING" || status === "PROCESSING" || status === "ACTIVE" || status === "FAILED"
        ? status
        : "",
    ...(mediaType ? { mediaType } : {}),
    ...(createdBy ? { createdBy } : {}),
    includeSubfolders: firstQueryValue(query.includeSubfolders) === "true",
    sort:
      sort === "filename" ||
      sort === "source_bytes" ||
      sort === "page_count" ||
      sort === "version_number" ||
      sort === "status"
        ? sort
        : "created_at",
    direction: direction === "asc" ? "asc" : "desc",
  };
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
  query?: RagDocumentListQuery,
): Route {
  const parameters = ragWorkspaceParameters(folderId, query);
  for (const job of jobs) {
    parameters.append("jobId", job.jobId);
    parameters.append("filename", job.filename);
  }
  const suffix = parameters.toString();
  return (suffix ? `/admin/rag/jobs?${suffix}` : "/admin/rag/jobs") as Route;
}

function DeletePanel({
  documents,
  query,
  onComplete,
  onMessage,
  returnHref,
}: Readonly<{
  documents: RagDocument[];
  query: RagQuery;
  onComplete: () => void;
  onMessage: (message: string) => void;
  returnHref: Route;
}>) {
  const documentId = firstQueryValue(query.documentId);
  const listedDocument = resolveDeletionDocument(documents, documentId);
  const [loadedDocument, setLoadedDocument] = useState<
    Readonly<{ document: RagDocument | null; documentId: string }> | undefined
  >();
  const document =
    listedDocument ??
    (loadedDocument?.documentId === documentId
      ? (loadedDocument?.document ?? undefined)
      : undefined);
  const loadingDocument = Boolean(
    documentId && !listedDocument && loadedDocument?.documentId !== documentId,
  );
  const [confirmedDocumentId, setConfirmedDocumentId] = useState<string>();
  const confirmed = confirmedDocumentId === documentId;
  const [busy, setBusy] = useState(false);
  const removeOperation = useRef(createRetryOperation());

  useEffect(() => {
    if (!documentId || listedDocument) return;
    let cancelled = false;
    void loadRagDocumentById(documentId).then((loaded) => {
      if (cancelled) return;
      setLoadedDocument({ document: loaded, documentId });
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, listedDocument]);

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
          <dd>
            {loadingDocument
              ? "문서 정보를 불러오는 중입니다."
              : (document?.filename ?? "삭제할 문서를 찾을 수 없습니다.")}
          </dd>
        </div>
        <div>
          <dt>삭제 영향</dt>
          <dd>검색 결과와 AI 답변에서 더 이상 사용되지 않음</dd>
        </div>
      </dl>
      <label className="civic-check-row">
        <input
          checked={confirmed}
          disabled={loadingDocument || !document}
          onChange={(event) =>
            setConfirmedDocumentId(event.target.checked ? documentId : undefined)
          }
          type="checkbox"
        />
        <span>삭제 후 되돌릴 수 없음을 확인했습니다.</span>
      </label>
      <div className="civic-form-actions">
        <Link className="civic-secondary-action" href={returnHref}>
          취소
        </Link>
        <button
          className="civic-danger-action"
          disabled={loadingDocument || !document || !confirmed || busy}
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

export async function loadRagDocumentById(
  documentId: string,
  request: typeof fetch = authenticatedFetch,
): Promise<RagDocument | null> {
  try {
    const response = await request(`/api/v1/rag/documents/${encodeURIComponent(documentId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<RagDocument>;
    if (
      body.document_id !== documentId ||
      typeof body.folder_id !== "string" ||
      typeof body.filename !== "string" ||
      typeof body.deleted !== "boolean" ||
      !(body.active_version === null || typeof body.active_version === "object")
    ) {
      return null;
    }
    return body as RagDocument;
  } catch {
    return null;
  }
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
  constructor(
    readonly status: number,
    readonly problem: RagUploadProblem | undefined,
  ) {
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
      throw new RagUploadDefinitiveResponseError(
        response.status,
        await readRagUploadProblem(response),
      );
    }
    lastError = new Error(`RAG upload retryable response ${response.status}`);
  }
  throw lastError instanceof Error ? lastError : new Error("RAG upload failed");
}

async function readRagUploadProblem(response: Response): Promise<RagUploadProblem | undefined> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? (value as RagUploadProblem) : undefined;
  } catch {
    return undefined;
  }
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
