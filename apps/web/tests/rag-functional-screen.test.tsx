import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RagFunctionalScreen } from "@/components/rag/rag-functional-screen";
import {
  DocumentInspector,
  DocumentWorkspace,
  FolderTree,
  hasActiveRagDocuments,
  buildRagDocumentListPath,
  requestRagBulkAction,
  shouldPollRagJob,
  firstQueryValue,
  jobPanelKey,
  loadRagJob,
  loadRagJobFilename,
  loadRagDocumentVersions,
  mapSettledWithConcurrency,
  MAX_RAG_UPLOAD_BYTES,
  mediaType,
  RAG_ACCEPTED_EXTENSIONS,
  RagMultipartCompletionPendingError,
  multipartFileRecoveryKey,
  createFileRetryKeyStore,
  createRetryOperation,
  RAG_RETRY_NETWORK_MESSAGE,
  RAG_FOLDER_DELETE_NETWORK_MESSAGE,
  createLatestRequestGate,
  deleteRagDocument,
  deleteRagFolder,
  filterRagDocuments,
  processingJobHref,
  ragJobHref,
  resolveInspectedRagDocument,
  resolveFolderMutation,
  resolveFolderEditorMode,
  ragWorkspaceHref,
  ragFolderDialogKey,
  shouldRenderRagFolderDialog,
  resolveWorkspaceFolderId,
  selectedDocumentVersionStatus,
  readAcceptedJobId,
  requestRagJobRetry,
  rejectedInputs,
  RagJobStatusCard,
  ragJobDisplayProgress,
  ragJobFailureMessage,
  readRagJobFilenameFromSummary,
  ragJobTimelineStates,
  ragUploadExclusionMessage,
  ragUploadFailureMessage,
  resolveDeletionDocument,
  sha256Blob,
  settleMultipartCompletionRecovery,
  uploadRagFileMultipart,
  canSelectUploadFiles,
} from "@/components/rag/admin-rag-screen";
import {
  citationHref,
  createQueryOperation,
  parseQuerySubmissionResponse,
  openCitationInline,
  isRetryableRagStatus,
  pollResult,
  problemMessage,
  ragJobStatusMessage,
  waitForStreamedResult,
} from "@/components/rag/participant-rag-screen";
import * as participantRagSession from "@/components/rag/participant-rag-screen";
import { ragReturnTarget } from "@/lib/auth/rag-return-target";
import { ragScreenPrimaryActions } from "@/components/rag/rag-screen-actions";
import { readFailedRagJobs } from "@/components/screens/admin-functional-screen";
import { screenRegistry } from "@/lib/screens/registry";

const ragScreens = screenRegistry.filter(
  (screen) => screen.owner === "RAG" && screen.status === "FUNCTIONAL",
);

const latestWireflowTitles = Object.freeze({
  "U-RAG-001": "AI",
  "U-RAG-002": "AI",
  "U-RAG-003": "AI",
  "A-RAG-001": "문서 관리",
  "A-RAG-002": "문서 관리",
  "A-RAG-003": "문서 관리",
  "A-RAG-004": "선택 폴더에 문서 업로드",
  "A-RAG-005": "문서 준비 상태",
  "A-RAG-006": "문서 관리",
} as const);

function renderedText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
    size: () => values.size,
  };
}

type RagSessionApi = Readonly<{
  clearRagConversationSnapshot: (storage: ReturnType<typeof memoryStorage>) => void;
  latestPendingRagJobId: (messages: ReadonlyArray<Record<string, unknown>>) => string | null;
  readRagConversationSnapshot: (
    storage: ReturnType<typeof memoryStorage>,
    ownerUserId: string,
  ) => Record<string, unknown> | null;
  writeRagConversationSnapshot: (
    storage: ReturnType<typeof memoryStorage>,
    snapshot: Record<string, unknown>,
  ) => void;
}>;

const ragSessionApi = participantRagSession as unknown as RagSessionApi;

describe("9 functional RAG screens", () => {
  it("같은 사용자의 탭 대화는 질문·답변·인용과 RAG 세션을 복원한다", () => {
    const storage = memoryStorage();
    const snapshot = {
      ownerUserId: "00000000-0000-4000-8000-000000000001",
      sessionId: "10000000-0000-4000-8000-000000000001",
      messages: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          question: "정책 내용을 알려줘.",
          askedAt: "11:32",
          answeredAt: "11:33",
          job: {
            job_id: "20000000-0000-4000-8000-000000000001",
            status: "SUCCEEDED",
            answer: "문서 기반 답변입니다.",
            citations: [
              {
                document_version_id: "30000000-0000-4000-8000-000000000001",
                page_number: 1,
                page_count: 4,
                source_object_sha256: "a".repeat(64),
                title: "정책 안내",
              },
            ],
          },
        },
      ],
    };

    expect(ragSessionApi.writeRagConversationSnapshot).toBeTypeOf("function");
    ragSessionApi.writeRagConversationSnapshot(storage, snapshot);

    expect(ragSessionApi.readRagConversationSnapshot(storage, snapshot.ownerUserId)).toEqual(
      snapshot,
    );
  });

  it("다른 사용자의 탭 대화는 복원하지 않고 저장소에서 제거한다", () => {
    const storage = memoryStorage();
    const snapshot = {
      ownerUserId: "00000000-0000-4000-8000-000000000001",
      sessionId: null,
      messages: [],
    };

    expect(ragSessionApi.writeRagConversationSnapshot).toBeTypeOf("function");
    ragSessionApi.writeRagConversationSnapshot(storage, snapshot);

    expect(
      ragSessionApi.readRagConversationSnapshot(storage, "00000000-0000-4000-8000-000000000002"),
    ).toBeNull();
    expect(storage.size()).toBe(0);
  });

  it("복원한 대화에서 마지막 미완료 질의만 재개 대상으로 선택한다", () => {
    expect(ragSessionApi.latestPendingRagJobId).toBeTypeOf("function");
    expect(
      ragSessionApi.latestPendingRagJobId([
        {
          id: "completed-job",
          question: "완료 질문",
          askedAt: "11:30",
          job: { job_id: "completed-job", status: "SUCCEEDED", answer: "완료" },
        },
        { id: "pending-job", question: "진행 질문", askedAt: "11:31" },
      ]),
    ).toBe("pending-job");
    expect(
      ragSessionApi.latestPendingRagJobId([
        {
          id: "failed-job",
          question: "실패 질문",
          askedAt: "11:32",
          job: { job_id: "failed-job", status: "FAILED", failure_code: "PROCESSING_FAILED" },
        },
      ]),
    ).toBeNull();
  });

  it("관리자 문서 목록 표현을 실제 데이터로 검증할 수 있는 경계를 제공한다", async () => {
    const adminRagModule = await import("@/components/rag/admin-rag-screen");
    expect(adminRagModule.DocumentWorkspace).toBeTypeOf("function");
  });

  it("선택 문서 미리보기를 실제 드로어로 검증할 수 있는 경계를 제공한다", async () => {
    const adminRagModule = await import("@/components/rag/admin-rag-screen");
    expect(adminRagModule.DocumentInspector).toBeTypeOf("function");
  });

  it("미리보기 드로어는 PDF와 사람이 이해하는 문서 정보를 함께 표시한다", () => {
    const documentId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
    const versionId = "03aca507-5bd9-4d83-878b-8b39b6f97e63";
    const html = renderToStaticMarkup(
      createElement(DocumentInspector, {
        creatorLabel: "civic-admin@post-ai.com",
        document: {
          document_id: documentId,
          folder_id: "00000000-0000-4000-8000-000000000002",
          filename: "시민참여 정책.pdf",
          created_by: "11111111-1111-4111-8111-111111111111",
          created_at: "2026-08-21T01:02:03Z",
          deleted: false,
          active_version: null,
        },
        onClose: vi.fn(),
        version: {
          document_version_id: versionId,
          document_id: documentId,
          version_number: 2,
          filename: "시민참여 정책.pdf",
          media_type: "application/pdf",
          source_object_sha256: "a".repeat(64),
          source_bytes: 4096,
          page_count: 12,
          created_at: "2026-08-21T01:02:03Z",
          activated_at: "2026-08-21T01:05:00Z",
          status: "ACTIVE",
        },
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="시민참여 정책.pdf 미리보기"');
    expect(html).toContain("문서 접근 권한을 확인하고 있습니다.");
    expect(html).not.toContain("disposition=inline");
    expect(html).toContain("civic-admin@post-ai.com");
    expect(html).toContain("2026. 8. 21.");
    expect(html).toContain("12쪽");
    expect(html).toContain("4 KB");
    expect(html).toContain("검색 사용 중");
    const text = renderedText(html);
    expect(text).not.toContain(documentId);
    expect(text).not.toContain(versionId);
    expect(text).not.toContain("ACTIVE");
  });

  it("원본 형식과 무관하게 처리된 문서는 정규화 PDF로 미리본다", () => {
    const documentId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
    const versionId = "03aca507-5bd9-4d83-878b-8b39b6f97e63";
    const html = renderToStaticMarkup(
      createElement(DocumentInspector, {
        creatorLabel: "civic-admin@post-ai.com",
        document: {
          document_id: documentId,
          folder_id: "00000000-0000-4000-8000-000000000002",
          filename: "정책 안내.docx",
          deleted: false,
          search_enabled: true,
          active_version: null,
        },
        onClose: vi.fn(),
        version: {
          document_version_id: versionId,
          document_id: documentId,
          version_number: 1,
          filename: "정책 안내.docx",
          media_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          source_object_sha256: "a".repeat(64),
          status: "ACTIVE",
        },
      }),
    );

    expect(html).toContain('aria-label="정책 안내.docx 미리보기"');
    expect(html).toContain("문서 접근 권한을 확인하고 있습니다.");
    expect(html).not.toContain(`/versions/${versionId}/preview`);
    expect(html).not.toContain("브라우저 미리보기를 지원하지 않는 형식");
    expect(renderedText(html)).not.toContain(versionId);
  });

  it("재귀 폴더 트리는 깊이와 사람이 읽는 경로를 사용한다", () => {
    const html = renderToStaticMarkup(
      createElement(FolderTree, {
        folders: [
          {
            folder_id: "00000000-0000-4000-8000-000000000001",
            parent_id: null,
            name: "자료",
            kind: "ROOT",
            depth: 0,
            path: ["자료"],
          },
          {
            folder_id: "00000000-0000-4000-8000-000000000002",
            parent_id: "00000000-0000-4000-8000-000000000001",
            name: "복지 정책",
            kind: "NORMAL",
            depth: 1,
            path: ["자료", "복지 정책"],
          },
        ],
        onSelect: vi.fn(),
        selectedFolderId: "00000000-0000-4000-8000-000000000002",
      }),
    );

    expect(html).toContain("복지 정책");
    expect(html).toContain("자료 / 복지 정책");
    expect(renderedText(html)).not.toContain("00000000-0000");
  });

  it("문서 목록 요청은 서버 페이지·하위 폴더·검색·정렬 조건을 보낸다", () => {
    expect(
      buildRagDocumentListPath("folder/정책", {
        page: 2,
        pageSize: 50,
        query: "장학금 안내",
        status: "ACTIVE",
        includeSubfolders: true,
        sort: "filename",
        direction: "asc",
      }),
    ).toBe(
      "/api/v1/rag/documents?folder_id=folder%2F%EC%A0%95%EC%B1%85&include_subfolders=true&page=2&page_size=50&query=%EC%9E%A5%ED%95%99%EA%B8%88+%EC%95%88%EB%82%B4&status=ACTIVE&sort=filename&direction=asc",
    );
  });

  it("일괄 작업은 선택 문서만 전송하고 부분 실패 결과를 보존한다", async () => {
    const request = vi.fn(async () =>
      Response.json({
        action: "REINDEX",
        succeeded: 1,
        failed: 1,
        items: [
          { document_id: "document-1", status: "SUCCEEDED" },
          { document_id: "document-2", status: "FAILED", message: "처리 중" },
        ],
      }),
    );

    await expect(
      requestRagBulkAction(
        { action: "REINDEX", documentIds: ["document-1", "document-2"] },
        request as typeof fetch,
        "bulk-operation-key",
      ),
    ).resolves.toMatchObject({ succeeded: 1, failed: 1 });
    expect(request).toHaveBeenCalledWith(
      "/api/v1/rag/documents/bulk",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "bulk-operation-key" }),
      }),
    );
  });

  it("문서 목록은 UUID 대신 등록자 이메일·등록일·페이지 수·파일 크기를 표시한다", () => {
    const documentId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
    const creatorId = "03aca507-5bd9-4d83-878b-8b39b6f97e63";
    const html = renderToStaticMarkup(
      createElement(DocumentWorkspace, {
        compact: false,
        creatorLabels: new Map([[creatorId, "civic-admin@post-ai.com"]]),
        documents: [
          {
            document_id: documentId,
            folder_id: "00000000-0000-4000-8000-000000000002",
            filename: "시민참여 정책.pdf",
            created_by: creatorId,
            created_at: "2026-08-21T01:02:03Z",
            deleted: false,
            active_version: {
              document_version_id: "20000000-0000-4000-8000-000000000001",
              document_id: documentId,
              version_number: 2,
              filename: "시민참여 정책.pdf",
              media_type: "application/pdf",
              source_object_sha256: "a".repeat(64),
              source_bytes: 4096,
              page_count: 12,
              created_at: "2026-08-21T01:02:03Z",
              activated_at: "2026-08-21T01:05:00Z",
              status: "ACTIVE",
            },
          },
        ],
        folder: {
          folder_id: "00000000-0000-4000-8000-000000000002",
          parent_id: null,
          name: "정책 자료",
          kind: "GENERAL",
        },
        onInspect: vi.fn(),
        selectedDocumentId: undefined,
      }),
    );

    expect(html).toContain("시민참여 정책.pdf");
    expect(html).toContain("civic-admin@post-ai.com");
    expect(html).toContain("2026. 8. 21.");
    expect(html).toContain("12쪽");
    expect(html).toContain("4 KB");
    expect(html).toContain("보기");
    const text = renderedText(html);
    expect(text).not.toContain(documentId);
    expect(text).not.toContain(creatorId);
  });

  it("문서 목록은 선택 작업대·하위 폴더·페이지 크기·페이지 이동을 제공한다", () => {
    const html = renderToStaticMarkup(
      createElement(DocumentWorkspace, {
        compact: false,
        documents: [],
        folder: undefined,
        onInspect: vi.fn(),
        selectedDocumentId: undefined,
        pageState: { page: 2, pageSize: 25, total: 61, totalPages: 3, statusCounts: {} },
        onQueryChange: vi.fn(),
        onBulk: vi.fn(),
      }),
    );

    expect(html).toContain("하위 폴더 포함");
    expect(html).toContain("문서 목록 페이지당 표시 개수");
    expect(html).toContain("선택 문서 재색인");
    expect(html).toContain("선택 문서 이동");
    expect(html).toContain("이전 페이지");
    expect(html).toContain("다음 페이지");
    expect(html).toContain("2 / 3");
  });

  it("등록자 조회에 실패해도 문서 UUID를 대체 문구로 노출하지 않는다", () => {
    const creatorId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
    const html = renderToStaticMarkup(
      createElement(DocumentWorkspace, {
        compact: false,
        creatorLabels: new Map(),
        documents: [
          {
            document_id: "10000000-0000-4000-8000-000000000001",
            folder_id: "00000000-0000-4000-8000-000000000002",
            filename: "정책.pdf",
            created_by: creatorId,
            created_at: "2026-08-21T01:02:03Z",
            deleted: false,
            active_version: null,
          },
        ],
        folder: undefined,
        onInspect: vi.fn(),
        selectedDocumentId: undefined,
      }),
    );

    expect(html).toContain("확인할 수 없는 사용자");
    expect(renderedText(html)).not.toContain(creatorId);
  });

  it("업로드 중에는 새 파일 배치를 선택할 수 없다", () => {
    expect(canSelectUploadFiles(false)).toBe(true);
    expect(canSelectUploadFiles(true)).toBe(false);
  });

  it("60초를 넘긴 정상 작업도 job id를 유지하며 완료까지 계속 조회한다", async () => {
    let attempts = 0;
    const request = vi.fn(async () => {
      attempts += 1;
      return Response.json(
        attempts > 60
          ? { job_id: "slow-job", status: "SUCCEEDED", answer: "완료" }
          : { job_id: "slow-job", status: "RUNNING" },
      );
    });

    await expect(
      pollResult("slow-job", {
        request: request as typeof fetch,
        wait: async () => undefined,
      }),
    ).resolves.toMatchObject({ status: "SUCCEEDED", answer: "완료" });
    expect(request).toHaveBeenCalledTimes(61);
  });

  it("질의 완료 SSE 뒤 정답과 인용은 정식 상태 API에서 한 번만 읽는다", async () => {
    const listeners = new Map<string, () => void>();
    const source = {
      addEventListener: vi.fn((name: string, listener: () => void) =>
        listeners.set(name, listener),
      ),
      close: vi.fn(),
      onerror: null as (() => void) | null,
    };
    const request = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === "/api/v1/rag/stream-session") {
        return Response.json({ stream_path: "/stream/rag/queries/job-1" });
      }
      return Response.json({ job_id: "job-1", status: "SUCCEEDED", answer: "문서 답변" });
    });

    const pending = waitForStreamedResult("job-1", {
      request: request as typeof fetch,
      createSource: () => source,
      fallback: vi.fn(),
    });
    await vi.waitFor(() => expect(listeners.has("query.succeeded")).toBe(true));
    listeners.get("query.succeeded")?.();

    await expect(pending).resolves.toMatchObject({ status: "SUCCEEDED", answer: "문서 답변" });
    expect(source.close).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("처리 작업 폴링은 화면이 보이고 작업이 비종료 상태일 때만 수행한다", () => {
    expect(shouldPollRagJob(undefined, false)).toBe(true);
    expect(shouldPollRagJob("RUNNING", false)).toBe(true);
    expect(shouldPollRagJob("RETRY_WAIT", false)).toBe(true);
    expect(shouldPollRagJob("RUNNING", true)).toBe(false);
    expect(shouldPollRagJob("SUCCEEDED", false)).toBe(false);
    expect(shouldPollRagJob("FAILED", false)).toBe(false);
    expect(shouldPollRagJob("CANCELLED", false)).toBe(false);
  });

  it("보이는 문서 중 처리 대기·처리 중 문서가 있을 때만 목록을 자동 갱신한다", () => {
    expect(
      hasActiveRagDocuments([
        {
          document_id: "document-1",
          folder_id: "folder-1",
          filename: "대기.pdf",
          deleted: false,
          active_version: null,
        },
      ]),
    ).toBe(true);
    expect(
      hasActiveRagDocuments([
        {
          document_id: "document-2",
          folder_id: "folder-1",
          filename: "완료.pdf",
          deleted: false,
          active_version: {
            document_version_id: "version-2",
            document_id: "document-2",
            version_number: 1,
            filename: "완료.pdf",
            media_type: "application/pdf",
            source_object_sha256: "a".repeat(64),
            status: "ACTIVE",
          },
        },
      ]),
    ).toBe(false);
  });

  it("수동 재시도는 pending 동안 한 요청만 허용하고 실패 뒤 같은 키를 재사용한다", () => {
    const operation = createRetryOperation(() => "retry-key-1");
    expect(operation.begin()).toBe("retry-key-1");
    expect(operation.begin()).toBeNull();
    operation.settle(false);
    expect(operation.begin()).toBe("retry-key-1");
    operation.settle(true);
  });

  it("재시도 요청 내용이 바뀌면 불명확 실패 뒤에도 새 키를 발급한다", () => {
    let sequence = 0;
    const operation = createRetryOperation(() => `retry-key-${(sequence += 1)}`);

    expect(operation.begin("PATCH:/folders/1:old-name")).toBe("retry-key-1");
    operation.settle(false);
    expect(operation.begin("PATCH:/folders/1:old-name")).toBe("retry-key-1");
    operation.settle(false);
    expect(operation.begin("PATCH:/folders/1:new-name")).toBe("retry-key-2");
  });

  it("작업 재시도는 확정 오류에서 키를 폐기하고 성공 응답 파싱 실패에서는 보존한다", async () => {
    await expect(
      requestRagJobRetry({
        jobId: "job-1",
        idempotencyKey: "retry-key-1",
        request: vi.fn(async () => new Response(null, { status: 409 })) as typeof fetch,
      }),
    ).resolves.toEqual({ kind: "rejected", definitive: true, acceptedJobId: null });

    await expect(
      requestRagJobRetry({
        jobId: "job-1",
        idempotencyKey: "retry-key-1",
        request: vi.fn(async () => new Response("{", { status: 202 })) as typeof fetch,
      }),
    ).resolves.toEqual({ kind: "malformed", definitive: false, acceptedJobId: null });
  });

  it("작업 상태 새로고침의 전송·응답 해석 실패를 안전한 실패로 반환한다", async () => {
    const unavailable = vi.fn(async () => Promise.reject(new Error("offline")));
    const malformed = vi.fn(async () => Response.json({ status: 17 }));

    await expect(loadRagJob("job-1", unavailable as typeof fetch)).resolves.toBeNull();
    await expect(loadRagJob("job-1", malformed as typeof fetch)).resolves.toBeNull();
  });

  it("수동 재시도의 네트워크 오류는 사용자에게 다시 시도 가능한 상태로 안내한다", () => {
    expect(RAG_RETRY_NETWORK_MESSAGE).toContain("네트워크 오류");
    expect(RAG_RETRY_NETWORK_MESSAGE).toContain("다시 시도");
  });

  it("폴더 삭제의 네트워크 오류도 관리자에게 재시도를 안내한다", () => {
    expect(RAG_FOLDER_DELETE_NETWORK_MESSAGE).toContain("네트워크 오류");
    expect(RAG_FOLDER_DELETE_NETWORK_MESSAGE).toContain("다시 시도");
  });

  it("질의는 같은 질문의 불명확 실패에만 키를 재사용한다", () => {
    let sequence = 0;
    const operation = createQueryOperation(() => `query-key-${(sequence += 1)}`);
    expect(operation.begin("정책은?")).toBe("query-key-1");
    expect(operation.begin("정책은?")).toBeNull();
    operation.settle(false);
    expect(operation.begin("정책은?")).toBe("query-key-1");
    operation.settle(true);
    expect(operation.begin("정책은?")).toBe("query-key-2");
    operation.settle(false);
    expect(operation.begin("예산은?")).toBe("query-key-3");
    operation.clear();
    expect(operation.begin("예산은?")).toBe("query-key-4");
  });

  it("202 응답 본문이 깨지면 질의 키를 유지하고 확정 오류만 교체한다", async () => {
    let sequence = 0;
    const operation = createQueryOperation(() => `query-key-${(sequence += 1)}`);
    const firstKey = operation.begin("정책은?");
    expect(firstKey).toBe("query-key-1");

    await expect(
      parseQuerySubmissionResponse(
        new Response("{", { status: 202, headers: { "content-type": "application/json" } }),
      ),
    ).rejects.toThrow("accepted query response");
    operation.settle(false);
    expect(operation.begin("정책은?")).toBe(firstKey);

    await expect(
      parseQuerySubmissionResponse(
        new Response("{", { status: 409, headers: { "content-type": "application/json" } }),
      ),
    ).resolves.toEqual({ kind: "problem", code: undefined });
    operation.settle(true);
    expect(operation.begin("정책은?")).toBe("query-key-2");
  });

  it("ADD는 선택 폴더의 자식 생성이고 EDIT는 일반 폴더 이름 변경이다", () => {
    const folder = {
      folder_id: "folder-1",
      parent_id: null,
      name: "정책",
      kind: "NORMAL" as const,
    };
    expect(resolveFolderMutation("ADD", folder, " 새 폴더 ")).toEqual({
      path: "/api/v1/rag/folders",
      method: "POST",
      body: { name: "새 폴더", parent_id: "folder-1" },
    });
    expect(resolveFolderMutation("EDIT", folder, " 새 이름 ")).toEqual({
      path: "/api/v1/rag/folders/folder-1",
      method: "PATCH",
      body: { name: "새 이름" },
    });
    expect(
      resolveFolderMutation("EDIT", { ...folder, folder_id: "welfare/policy" }, " 새 이름 ")?.path,
    ).toBe("/api/v1/rag/folders/welfare%2Fpolicy");
    expect(resolveFolderMutation("EDIT", { ...folder, kind: "GENERAL" }, "금지")).toBeNull();
    expect(resolveFolderMutation("ADD", undefined, "상위 미확인")).toBeNull();
  });

  it("DELETE 폴더 모드는 수정 폼이 아니라 삭제 확인 흐름을 유지한다", () => {
    expect(resolveFolderEditorMode("DELETE")).toBe("DELETE");
    expect(resolveFolderEditorMode("ADD")).toBe("ADD");
    expect(resolveFolderEditorMode("unknown")).toBe("EDIT");

    const screen = ragScreens.find((item) => item.id === "A-RAG-002");
    if (!screen) throw new Error("A-RAG-002 missing");
    const html = renderToStaticMarkup(
      createElement(RagFunctionalScreen, {
        screen,
        query: { mode: "DELETE", folderId: "folder-1" },
      }),
    );
    expect(html).toContain("폴더 삭제 확인");
    expect(html).toContain("포함된 문서와 하위 폴더는 상위 폴더로 이동합니다");
    expect(html.match(/href="\/admin\/rag\?folderId=folder-1"/g)).toHaveLength(2);
    expect(html).not.toContain("수정할 폴더 정보");
  });

  it("작업 ID가 바뀌면 상태 패널 인스턴스 키도 바뀐다", () => {
    expect(jobPanelKey("job-1")).toBe("job-job-1");
    expect(jobPanelKey("job-2")).toBe("job-job-2");
    expect(jobPanelKey(undefined)).toBe("missing-job");
  });

  it("목록에서 선택한 문서와 이력 버전을 검사기에 함께 전달한다", () => {
    const firstVersion = {
      document_version_id: "version-1",
      document_id: "document-1",
      version_number: 1,
      filename: "첫.pdf",
      media_type: "application/pdf",
      source_object_sha256: "a".repeat(64),
      status: "READY",
    };
    const selectedVersion = {
      ...firstVersion,
      document_version_id: "version-2-history",
      document_id: "document-2",
      filename: "둘.pdf",
      status: "FAILED",
    };
    const documents = [
      {
        document_id: "document-1",
        folder_id: "folder-1",
        filename: "첫.pdf",
        deleted: false,
        active_version: firstVersion,
      },
      {
        document_id: "document-2",
        folder_id: "folder-1",
        filename: "둘.pdf",
        deleted: false,
        active_version: null,
      },
    ];

    expect(
      resolveInspectedRagDocument(documents, {
        documentId: "document-2",
        version: selectedVersion,
      }),
    ).toEqual({ document: documents[1], version: selectedVersion });
    expect(
      resolveInspectedRagDocument(documents, {
        documentId: "removed-document",
        version: selectedVersion,
      }),
    ).toEqual({ document: undefined, version: null });
    expect(resolveInspectedRagDocument(documents, undefined)).toEqual({
      document: undefined,
      version: null,
    });
  });

  it("문서 삭제 네트워크 오류 뒤 busy를 해제하고 재시도 메시지를 표시한다", async () => {
    const busy: boolean[] = [];
    const messages: string[] = [];
    const complete = vi.fn();

    const responseConfirmed = await deleteRagDocument({
      document: {
        document_id: "document-1",
        folder_id: "folder-1",
        filename: "정책.pdf",
        deleted: false,
        active_version: null,
      },
      onComplete: complete,
      onMessage: (message) => messages.push(message),
      setBusy: (value) => busy.push(value),
      request: vi.fn(async () => {
        throw new TypeError("injected network failure");
      }) as typeof fetch,
      idempotencyKey: () => "delete-key",
    });

    expect(busy).toEqual([true, false]);
    expect(responseConfirmed).toBe(false);
    expect(messages).toEqual(["네트워크 오류로 문서를 삭제하지 못했습니다. 다시 시도하세요."]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("폴더 변경은 네트워크 불명확 실패만 같은 키를 쓰고 확정 응답 뒤 키를 교체한다", () => {
    let sequence = 0;
    const operation = createRetryOperation(() => `folder-operation-key-${(sequence += 1)}`);
    expect(operation.begin()).toBe("folder-operation-key-1");
    expect(operation.begin()).toBeNull();
    operation.settle(false);
    expect(operation.begin()).toBe("folder-operation-key-1");
    operation.settle(true);
    expect(operation.begin()).toBe("folder-operation-key-2");
  });

  it("폴더 삭제의 충돌 응답도 확정 결과로 처리해 다음 시도 키를 교체한다", async () => {
    const messages: string[] = [];
    const complete = vi.fn();
    let sequence = 0;
    const operation = createRetryOperation(() => `delete-key-${(sequence += 1)}`);
    const idempotencyKey = operation.begin();
    expect(idempotencyKey).toBe("delete-key-1");

    const definitiveResponse = await deleteRagFolder({
      folderId: "folder-1",
      idempotencyKey: idempotencyKey!,
      onComplete: complete,
      onMessage: (message) => messages.push(message),
      request: vi.fn(async () => new Response(null, { status: 409 })) as typeof fetch,
    });
    operation.settle(definitiveResponse);

    expect(definitiveResponse).toBe(true);
    expect(operation.begin()).toBe("delete-key-2");
    expect(messages).toEqual(["폴더를 삭제하지 못했습니다."]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("관리자 RAG 모달을 닫을 때 현재 폴더 선택을 유지한다", () => {
    expect(ragWorkspaceHref("welfare/policy")).toBe("/admin/rag?folderId=welfare%2Fpolicy");
    expect(ragWorkspaceHref(undefined)).toBe("/admin/rag");
  });

  it("폴더 저장 완료 뒤 같은 요청의 모달을 다시 열지 않는다", () => {
    const completedAdd = ragFolderDialogKey("ADD", "parent");
    expect(shouldRenderRagFolderDialog("A-RAG-002", "ADD", "parent", completedAdd)).toBe(false);

    const completed = ragFolderDialogKey("DELETE", "deleted-child");
    expect(shouldRenderRagFolderDialog("A-RAG-002", "DELETE", "deleted-child", undefined)).toBe(
      true,
    );
    expect(shouldRenderRagFolderDialog("A-RAG-002", "DELETE", "deleted-child", completed)).toBe(
      false,
    );
    expect(shouldRenderRagFolderDialog("A-RAG-002", "DELETE", "parent", completed)).toBe(true);
  });

  it("문서 삭제 모달의 닫기와 취소가 모두 현재 폴더로 돌아간다", () => {
    const screen = ragScreens.find((item) => item.id === "A-RAG-006");
    if (!screen) throw new Error("A-RAG-006 missing");
    const html = renderToStaticMarkup(
      createElement(RagFunctionalScreen, {
        screen,
        query: { documentId: "document-1", folderId: "welfare/policy" },
      }),
    );

    expect(html.match(/href="\/admin\/rag\?folderId=welfare%2Fpolicy"/g)).toHaveLength(2);
  });

  it("새 버전 업로드 화면은 내부 문서·버전 ID를 관리자에게 노출하지 않는다", () => {
    const screen = ragScreens.find((item) => item.id === "A-RAG-004");
    if (!screen) throw new Error("A-RAG-004 missing");
    const documentId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
    const versionId = "03aca507-5bd9-4d83-878b-8b39b6f97e63";
    const html = renderToStaticMarkup(
      createElement(RagFunctionalScreen, {
        screen,
        query: { documentId, versionId, mode: "NEW_VERSION" },
      }),
    );

    expect(html).not.toContain(documentId);
    expect(html).not.toContain(versionId);
    expect(html).toContain("선택한 문서에 새 버전을 등록합니다");
  });

  it("문서 처리 상태는 작업 UUID 대신 사람이 이해하는 진행 정보만 표시한다", () => {
    const screen = ragScreens.find((item) => item.id === "A-RAG-005");
    if (!screen) throw new Error("A-RAG-005 missing");
    const jobId = "640af5c5-d302-4c32-97ca-c9db40ed22e5";
    const html = renderToStaticMarkup(
      createElement(RagFunctionalScreen, { screen, query: { jobId } }),
    );

    expect(html).not.toContain(jobId);
    expect(html).not.toContain("작업 ID");
    expect(html).toContain("문서 준비 진행 상태");
  });

  it("실패한 문서 처리 상태는 파일명·실패 단계·해결 행동을 한 화면에 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(RagJobStatusCard, {
        filename: "정책자료.hwpx",
        job: {
          job_id: "640af5c5-d302-4c32-97ca-c9db40ed22e5",
          status: "FAILED",
          progress: 10,
          failure_code: "DOCUMENT_READ_FAILED",
        },
        message: "최신 처리 상태를 반영했습니다.",
        onRefresh: vi.fn(),
        onRetry: vi.fn(),
        retrying: false,
        workspaceHref: ragWorkspaceHref("policy-folder"),
      }),
    );

    expect(html).toContain("정책자료.hwpx");
    expect(html).toContain("문서 읽기 실패");
    expect(html).toContain("원본 파일을 확인한 뒤 다시 업로드하세요");
    expect(html).toContain('class="civic-primary-action"');
    expect(html).toContain("실패 파일 다시 처리");
    expect(html).toContain('href="/admin/rag?folderId=policy-folder"');
    expect(html).not.toContain("640af5c5-d302-4c32-97ca-c9db40ed22e5");
  });

  it("실패 진행률은 완료된 단계와 모순되지 않게 표시한다", () => {
    expect(
      ragJobDisplayProgress({
        job_id: "job-1",
        status: "FAILED",
        progress: 10,
        failure_code: "DOCUMENT_READ_FAILED",
      }),
    ).toBe(33);
    expect(
      ragJobDisplayProgress({
        job_id: "job-2",
        status: "FAILED",
        progress: 10,
        failure_code: "PROCESSING_FAILED",
      }),
    ).toBe(67);
    expect(ragJobDisplayProgress({ job_id: "job-3", status: "SUCCEEDED", progress: 80 })).toBe(100);
  });

  it("문서 상태 배지는 활성 버전이 아니라 사용자가 선택한 이력 버전을 표시한다", () => {
    const versions = [
      {
        document_version_id: "version-1",
        document_id: "document-1",
        version_number: 1,
        filename: "정책.pdf",
        media_type: "application/pdf",
        source_object_sha256: "a".repeat(64),
        status: "SUCCEEDED",
      },
      {
        document_version_id: "version-2",
        document_id: "document-1",
        version_number: 2,
        filename: "정책.pdf",
        media_type: "application/pdf",
        source_object_sha256: "b".repeat(64),
        status: "FAILED",
      },
    ];
    expect(selectedDocumentVersionStatus(versions, "version-1")).toBe("SUCCEEDED");
    expect(selectedDocumentVersionStatus(versions, "version-2")).toBe("FAILED");
    expect(selectedDocumentVersionStatus(versions, "missing")).toBe("처리 대기");
  });

  it("문서 버전 조회의 전송·응답 해석 실패를 재시도 가능한 실패로 반환한다", async () => {
    const unavailable = vi.fn(async () => Promise.reject(new Error("offline")));
    const malformed = vi.fn(async () => Response.json({ items: {} }));

    await expect(
      loadRagDocumentVersions("document-1", unavailable as typeof fetch),
    ).resolves.toBeNull();
    await expect(
      loadRagDocumentVersions("document-1", malformed as typeof fetch),
    ).resolves.toBeNull();
  });

  it("뒤에 시작한 폴더 요청만 현재 작업공간을 갱신한다", () => {
    const gate = createLatestRequestGate();
    const first = gate.begin();
    const second = gate.begin();

    expect(first()).toBe(false);
    expect(second()).toBe(true);
    gate.cancel();
    expect(second()).toBe(false);
  });

  it("문서명 검색과 처리 상태 필터가 현재 폴더 문서를 실제로 제한한다", () => {
    const documents = [
      {
        document_id: "ready",
        folder_id: "folder",
        filename: "복지 정책.pdf",
        deleted: false,
        active_version: {
          document_version_id: "version-ready",
          document_id: "ready",
          version_number: 1,
          filename: "복지 정책.pdf",
          media_type: "application/pdf",
          source_object_sha256: "a".repeat(64),
          status: "ACTIVE",
        },
      },
      {
        document_id: "failed",
        folder_id: "folder",
        filename: "교육 계획.pdf",
        deleted: false,
        active_version: {
          document_version_id: "version-failed",
          document_id: "failed",
          version_number: 1,
          filename: "교육 계획.pdf",
          media_type: "application/pdf",
          source_object_sha256: "b".repeat(64),
          status: "FAILED",
        },
      },
    ];

    expect(filterRagDocuments(documents, " 복지 ", "ALL").map((item) => item.document_id)).toEqual([
      "ready",
    ]);
    expect(filterRagDocuments(documents, "", "READY").map((item) => item.document_id)).toEqual([
      "ready",
    ]);
    expect(filterRagDocuments(documents, "", "FAILED").map((item) => item.document_id)).toEqual([
      "failed",
    ]);
    const incomplete = [
      {
        document_id: "incomplete",
        folder_id: "folder",
        deleted: false,
        active_version: null,
      },
    ] as unknown as Parameters<typeof filterRagDocuments>[0];
    expect(filterRagDocuments(incomplete, "파일명 확인 불가", "ALL")).toHaveLength(1);
  });

  it("삭제된 선택 폴더 새로고침은 부모, GENERAL, 첫 폴더 순서로 복구한다", () => {
    const previous = [
      { folder_id: "general", parent_id: null, name: "전체", kind: "GENERAL" as const },
      { folder_id: "parent", parent_id: "general", name: "정책", kind: "NORMAL" as const },
      { folder_id: "deleted", parent_id: "parent", name: "삭제", kind: "NORMAL" as const },
    ];
    const withParent = previous.filter((folder) => folder.folder_id !== "deleted");
    expect(resolveWorkspaceFolderId(withParent, previous, "deleted")).toBe("parent");
    const generalOnly = withParent.filter((folder) => folder.folder_id !== "parent");
    expect(resolveWorkspaceFolderId(generalOnly, previous, "deleted")).toBe("general");
    const firstOnly = [
      { folder_id: "first", parent_id: null, name: "첫 폴더", kind: "ROOT" as const },
    ];
    expect(resolveWorkspaceFolderId(firstOnly, previous, "deleted")).toBe("first");
    expect(resolveWorkspaceFolderId(withParent, previous, "parent")).toBe("parent");
  });

  it("현재 폴더에서 확인된 문서만 삭제 대상으로 해석한다", () => {
    const documents = [
      {
        document_id: "document-1",
        folder_id: "folder-1",
        filename: "정책.pdf",
        deleted: false,
        active_version: null,
      },
    ];

    expect(resolveDeletionDocument(documents, "document-1")?.filename).toBe("정책.pdf");
    expect(resolveDeletionDocument(documents, "stale-document")).toBeUndefined();
  });

  it("빈 folderId 쿼리는 폴더 미지정으로 정규화한다", () => {
    expect(firstQueryValue("")).toBeUndefined();
    expect(firstQueryValue(["", "folder-2"])).toBeUndefined();
    expect(firstQueryValue("folder-1")).toBe("folder-1");
  });

  it("수동 재시도 응답의 새 작업 ID만 후속 상태 링크로 사용한다", () => {
    expect(readAcceptedJobId({ job_id: "job-replacement-2" })).toBe("job-replacement-2");
    expect(readAcceptedJobId({ job_id: "" })).toBeNull();
    expect(readAcceptedJobId({ status: "QUEUED" })).toBeNull();
  });

  it("파일당 500 MiB multipart 한도를 사용자에게 안내한다", () => {
    expect(MAX_RAG_UPLOAD_BYTES).toBe(500 * 1024 * 1024);
    const screen = ragScreens.find((item) => item.id === "A-RAG-004");
    if (!screen) throw new Error("A-RAG-004 missing");
    const html = renderToStaticMarkup(createElement(RagFunctionalScreen, { screen }));
    expect(html).toContain("파일당 최대 500 MiB");
    expect(html).toContain("8 MiB 단위");
    expect(html).not.toContain("파일 크기·요청당 파일 수의 제품 한도는 없습니다");
  });

  it("iKMS 문서 형식과 ODS를 선택하고 올바른 MIME으로 전송한다", () => {
    expect(RAG_ACCEPTED_EXTENSIONS).toEqual([
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
    ]);
    expect(mediaType("정책.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(mediaType("통계.XLSX")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(mediaType("통계.ods")).toBe("application/vnd.oasis.opendocument.spreadsheet");
    expect(mediaType("스캔.jpeg")).toBe("image/jpeg");
    expect(mediaType("안내.md")).toBe("text/markdown");

    const screen = ragScreens.find((item) => item.id === "A-RAG-004");
    if (!screen) throw new Error("A-RAG-004 missing");
    const html = renderToStaticMarkup(createElement(RagFunctionalScreen, { screen }));
    expect(html).toContain(`accept="${RAG_ACCEPTED_EXTENSIONS.join(",")}"`);
    expect(renderedText(html)).toContain("PDF·텍스트·이미지·Office·한글 문서");
  });

  it("지원하지 않는 파일과 용량 초과 파일을 서로 다르게 안내한다", () => {
    const oversized = new File(["x"], "huge.pdf");
    Object.defineProperty(oversized, "size", { value: MAX_RAG_UPLOAD_BYTES + 1 });
    expect(ragUploadExclusionMessage([new File(["x"], "malware.exe")])).toBe(
      "지원하지 않는 형식의 파일은 선택에서 제외했습니다.",
    );
    expect(ragUploadExclusionMessage([oversized])).toContain("500 MiB");
  });

  it("위장 파일 업로드와 처리 실패를 사람이 이해할 수 있는 문장으로 안내한다", async () => {
    const request = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === "/api/v1/rag/uploads") {
        return Response.json({
          upload_id: "upload-disguised",
          part_size: 8 * 1024 * 1024,
          part_count: 1,
          max_bytes: MAX_RAG_UPLOAD_BYTES,
        });
      }
      if (path.endsWith("/complete")) return new Response(null, { status: 400 });
      return new Response(null, { status: 204 });
    });
    const upload = uploadRagFileMultipart({
      file: new File(["plain text"], "disguised.pdf"),
      folderId: "folder-1",
      request: request as typeof fetch,
    });
    const error = await upload.catch((reason: unknown) => reason);
    expect(ragUploadFailureMessage("disguised.pdf", error)).toContain("확장자와 실제 파일 형식");
    expect(ragJobFailureMessage("DOCUMENT_READ_FAILED")).toContain("손상");
    expect(ragJobFailureMessage("DOCUMENT_READ_FAILED")).not.toContain("DOCUMENT_READ_FAILED");
    expect(
      ragJobTimelineStates({ status: "FAILED", failure_code: "DOCUMENT_READ_FAILED" }),
    ).toEqual([
      ["파일 확인", "완료"],
      ["문서 읽기", "실패"],
      ["검색 준비", "시작 전"],
    ]);
  });

  it("전체 파일을 한 번에 버퍼링하지 않고 chunk 단위 SHA-256을 계산한다", async () => {
    expect(await sha256Blob(new Blob(["abc"]), 1)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("기존 실패 URL은 작업 요약에서 현재 문서명을 복구한다", () => {
    expect(
      readRagJobFilenameFromSummary("job-2", {
        recent_failures: [
          { job_id: "job-1", filename: "이전문서.pdf" },
          { job_id: "job-2", filename: "정책자료.hwpx" },
        ],
      }),
    ).toBe("정책자료.hwpx");
    expect(readRagJobFilenameFromSummary("job-3", { recent_failures: [] })).toBeNull();
    expect(readRagJobFilenameFromSummary("job-2", { recent_failures: "invalid" })).toBeNull();
  });

  it("실패 작업 파일명 조회는 네트워크와 잘못된 응답에서 안전하게 비운다", async () => {
    const success = vi.fn(async () =>
      Response.json({ recent_failures: [{ job_id: "job-2", filename: "정책자료.hwpx" }] }),
    );
    const unavailable = vi.fn(async () => new Response(null, { status: 503 }));
    const network = vi.fn(async () => Promise.reject(new Error("offline")));

    await expect(loadRagJobFilename("job-2", success as typeof fetch)).resolves.toBe(
      "정책자료.hwpx",
    );
    await expect(loadRagJobFilename("job-2", unavailable as typeof fetch)).resolves.toBeNull();
    await expect(loadRagJobFilename("job-2", network as typeof fetch)).resolves.toBeNull();
  });

  it("multipart part의 일시 오류를 재시도하고 완료 작업 ID를 반환한다", async () => {
    let partAttempts = 0;
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/v1/rag/uploads") {
        return Response.json(
          {
            upload_id: "upload-1",
            part_size: 8 * 1024 * 1024,
            part_count: 1,
            max_bytes: 500 * 1024 * 1024,
          },
          { status: 201 },
        );
      }
      if (path.endsWith("/parts/1")) {
        partAttempts += 1;
        expect(init?.body).toBeInstanceOf(Blob);
        return new Response(null, { status: partAttempts === 1 ? 503 : 200 });
      }
      if (path.endsWith("/complete")) {
        return Response.json({ job_id: "job-1", status: "QUEUED" }, { status: 202 });
      }
      return new Response(null, { status: 204 });
    });
    const progress = vi.fn();

    await expect(
      uploadRagFileMultipart({
        file: new File(["%PDF-1.7\n%%EOF"], "policy.pdf", { type: "application/pdf" }),
        folderId: "folder-1",
        onProgress: progress,
        request: request as typeof fetch,
      }),
    ).resolves.toEqual({ filename: "policy.pdf", jobId: "job-1" });
    expect(partAttempts).toBe(2);
    expect(progress).toHaveBeenCalledWith(1, 1);
  });

  it("완료 응답 본문 유실 시 같은 upload id로 완료만 다시 조회한다", async () => {
    let initiated = 0;
    let uploadedParts = 0;
    let completed = 0;
    let aborted = 0;
    const request = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === "/api/v1/rag/uploads") {
        initiated += 1;
        return Response.json({
          upload_id: "upload-recovery-1",
          part_size: 8 * 1024 * 1024,
          part_count: 1,
          max_bytes: 500 * 1024 * 1024,
        });
      }
      if (path.endsWith("/parts/1")) {
        uploadedParts += 1;
        return new Response(null, { status: 200 });
      }
      if (path.endsWith("/complete")) {
        completed += 1;
        return completed === 1
          ? new Response("{", { status: 202, headers: { "content-type": "application/json" } })
          : Response.json({ job_id: "recovered-job", status: "QUEUED" }, { status: 202 });
      }
      aborted += 1;
      return new Response(null, { status: 204 });
    });
    const file = new File(["%PDF-1.7\n%%EOF"], "recovery.pdf", {
      type: "application/pdf",
    });
    let pending: RagMultipartCompletionPendingError | undefined;

    try {
      await uploadRagFileMultipart({
        file,
        folderId: "folder-1",
        request: request as typeof fetch,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RagMultipartCompletionPendingError);
      pending = error as RagMultipartCompletionPendingError;
    }
    expect(pending?.uploadId).toBe("upload-recovery-1");
    if (!pending) throw new Error("completion recovery was not retained");

    await expect(
      uploadRagFileMultipart({
        file,
        folderId: "folder-1",
        completionUploadId: pending.uploadId,
        request: request as typeof fetch,
      }),
    ).resolves.toEqual({ filename: "recovery.pdf", jobId: "recovered-job" });
    expect({ initiated, uploadedParts, completed, aborted }).toEqual({
      initiated: 1,
      uploadedParts: 1,
      completed: 2,
      aborted: 0,
    });
  });

  it("완료 요청의 확정 실패는 upload id를 폐기하고 다음 시도를 새로 시작하게 한다", async () => {
    let initiated = 0;
    let uploadedParts = 0;
    let aborted = 0;
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/v1/rag/uploads" && init?.method === "POST") {
        initiated += 1;
        return Response.json({
          upload_id: "upload-definitive-1",
          part_size: 8 * 1024 * 1024,
          part_count: 1,
          max_bytes: 500 * 1024 * 1024,
        });
      }
      if (path.endsWith("/parts/1")) {
        uploadedParts += 1;
        return new Response(null, { status: 200 });
      }
      if (path.endsWith("/complete")) {
        return new Response(null, { status: path.includes("stale") ? 404 : 400 });
      }
      if (init?.method === "DELETE") {
        aborted += 1;
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request: ${path}`);
    });
    const file = new File(["%PDF-1.7\n%%EOF"], "definitive.pdf", {
      type: "application/pdf",
    });

    await expect(
      uploadRagFileMultipart({
        file,
        folderId: "folder-1",
        request: request as typeof fetch,
      }),
    ).rejects.toThrow("RAG upload failed with 400");
    await expect(
      uploadRagFileMultipart({
        file,
        folderId: "folder-1",
        completionUploadId: "upload-stale",
        request: request as typeof fetch,
      }),
    ).rejects.toThrow("RAG upload failed with 404");

    expect({ initiated, uploadedParts, aborted }).toEqual({
      initiated: 1,
      uploadedParts: 1,
      aborted: 2,
    });
  });

  it("초기화 성공 응답 본문 유실 시 같은 파일의 초기화 키를 재사용한다", async () => {
    let sequence = 0;
    let initiations = 0;
    const seenKeys: string[] = [];
    const keys = createFileRetryKeyStore(() => `init-key-${(sequence += 1)}`);
    const file = new File(["%PDF-1.7\n%%EOF"], "init-recovery.pdf", {
      type: "application/pdf",
    });
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/v1/rag/uploads") {
        initiations += 1;
        seenKeys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
        return initiations === 1
          ? new Response("{", { status: 201 })
          : Response.json({
              upload_id: "upload-init-recovery",
              part_size: 8 * 1024 * 1024,
              part_count: 1,
              max_bytes: 500 * 1024 * 1024,
            });
      }
      if (path.endsWith("/complete")) {
        return Response.json({ job_id: "job-init-recovery" }, { status: 202 });
      }
      return new Response(null, { status: 200 });
    });

    await expect(
      uploadRagFileMultipart({
        file,
        folderId: "folder-1",
        initIdempotencyKey: keys.acquire(file),
        onInitiationSettled: () => keys.retire(file),
        request: request as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SyntaxError);
    await expect(
      uploadRagFileMultipart({
        file,
        folderId: "folder-1",
        initIdempotencyKey: keys.acquire(file),
        onInitiationSettled: () => keys.retire(file),
        request: request as typeof fetch,
      }),
    ).resolves.toEqual({ filename: "init-recovery.pdf", jobId: "job-init-recovery" });

    expect(seenKeys).toEqual(["init-key-1", "init-key-1"]);
    expect(keys.acquire(file)).toBe("init-key-2");
  });

  it("같은 메타데이터의 서로 다른 파일은 별도 완료 복구 키를 갖는다", () => {
    const options = { type: "application/pdf", lastModified: 1 };
    const first = new File(["same"], "same.pdf", options);
    const second = new File(["same"], "same.pdf", options);

    expect(multipartFileRecoveryKey(first)).not.toBe(multipartFileRecoveryKey(second));
  });

  it("보관된 완료 ID의 확정 실패는 UI 복구 map에서 폐기한다", () => {
    const file = new File(["same"], "same.pdf", { type: "application/pdf" });
    const recoveries = new Map<File, string>([[file, "upload-stale"]]);

    settleMultipartCompletionRecovery(
      recoveries,
      file,
      new Error("definitive 404"),
      "upload-stale",
    );

    expect(recoveries.has(file)).toBe(false);
    settleMultipartCompletionRecovery(
      recoveries,
      file,
      new RagMultipartCompletionPendingError("upload-ambiguous", new TypeError("invalid JSON")),
      undefined,
    );
    expect(recoveries.get(file)).toBe("upload-ambiguous");
  });

  it("대용량 파일 배치는 동시에 두 개까지만 multipart 업로드한다", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapSettledWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (value === 4) throw new Error("injected upload failure");
      return value * 2;
    });

    expect(peak).toBe(2);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
  });

  it("다중 업로드 재시도 큐에는 실패한 파일만 남긴다", () => {
    const files = ["accepted.pdf", "failed.hwpx", "accepted.hwp"];
    const results: PromiseSettledResult<string>[] = [
      { status: "fulfilled", value: "job-1" },
      { status: "rejected", reason: new Error("injected") },
      { status: "fulfilled", value: "job-2" },
    ];

    expect(rejectedInputs(files, results)).toEqual(["failed.hwpx"]);
  });

  it("실패한 참여자 질의는 준비 중이 아니라 실패 원인을 표시한다", () => {
    expect(
      ragJobStatusMessage({ job_id: "query-1", status: "FAILED", failure_code: "NO_DOCUMENTS" }),
    ).toBe("아직 질문할 수 있는 문서가 없습니다.");
    expect(problemMessage("AI_PROVIDER_DISABLED")).toBe(
      "현재 AI 답변 기능이 비활성화되어 있습니다.",
    );
    expect(problemMessage("PROVIDER_RATE_LIMITED")).toBe(
      "AI 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(problemMessage("PROVIDER_AUTH_FAILED")).toBe(
      "AI 제공자 인증 설정을 확인해야 합니다. 관리자에게 문의해 주세요.",
    );
    expect(problemMessage("OUTPUT_POLICY_REJECTED")).toBe(
      "생성된 답변이 안전성 검사를 통과하지 못했습니다. 다시 시도해 주세요.",
    );
    expect(problemMessage("NO_GROUNDED_ANSWER")).toBe(
      "등록된 문서에서 질문에 맞는 근거를 찾지 못했습니다. 문서명이나 표현을 바꿔 다시 질문해 주세요.",
    );
    expect(ragJobStatusMessage(undefined)).toBe("답변을 준비하고 있습니다.");
  });

  it("문서 상태 링크는 문서 버전 ID가 아니라 API의 처리 작업 ID를 사용한다", () => {
    expect(
      processingJobHref(
        {
          document_version_id: "version-1",
          document_id: "document-1",
          version_number: 1,
          filename: "policy.pdf",
          media_type: "application/pdf",
          source_object_sha256: "a".repeat(64),
          status: "ACTIVE",
          job_id: "job-1",
        },
        "folder-1",
      ),
    ).toBe("/admin/rag/jobs?jobId=job-1&folderId=folder-1&filename=policy.pdf");
    expect(ragJobHref("replacement-job", "folder-1")).toBe(
      "/admin/rag/jobs?jobId=replacement-job&folderId=folder-1",
    );
    const statusScreen = ragScreens.find((item) => item.id === "A-RAG-005");
    if (!statusScreen) throw new Error("A-RAG-005 missing");
    const statusHtml = renderToStaticMarkup(
      createElement(RagFunctionalScreen, {
        screen: statusScreen,
        query: { jobId: "job-1", folderId: "folder-1" },
      }),
    );
    expect(statusHtml).toContain('href="/admin/rag?folderId=folder-1"');
  });

  it("질의 상태 폴링은 일시 오류만 재시도한다", () => {
    expect(isRetryableRagStatus(408)).toBe(true);
    expect(isRetryableRagStatus(429)).toBe(true);
    expect(isRetryableRagStatus(503)).toBe(true);
    expect(isRetryableRagStatus(401)).toBe(false);
    expect(isRetryableRagStatus(404)).toBe(false);
  });

  it("인용 링크에 문서 전체 페이지 수를 전달한다", () => {
    expect(
      citationHref({
        document_version_id: "version/1",
        page_number: 3,
        page_count: 12,
        source_object_sha256: "a".repeat(64),
        title: "복지 정책.pdf",
      }),
    ).toBe(
      "/rag/source?versionId=version%2F1&page=3&total=12&title=%EB%B3%B5%EC%A7%80%20%EC%A0%95%EC%B1%85.pdf",
    );
  });

  it("이전 RAG 응답에 페이지 수가 없으면 인용 페이지를 전체 페이지로 사용한다", () => {
    expect(
      citationHref({
        document_version_id: "version-1",
        page_number: 3,
        source_object_sha256: "a".repeat(64),
        title: "정책.pdf",
      }),
    ).toBe("/rag/source?versionId=version-1&page=3&total=3&title=%EC%A0%95%EC%B1%85.pdf");
  });

  it("인용 문서 로그인 복귀 대상은 모든 쿼리 파라미터를 보존한다", () => {
    expect(
      ragReturnTarget("/rag/source", {
        versionId: "version/1",
        page: "3",
        total: "12",
        title: "복지 정책.pdf",
      }),
    ).toBe(
      "/rag/source?versionId=version%2F1&page=3&total=12&title=%EB%B3%B5%EC%A7%80+%EC%A0%95%EC%B1%85.pdf",
    );
  });

  it("인용 클릭은 라우트를 교체하지 않고 현재 대화 위에 뷰어를 연다", () => {
    const preventDefault = vi.fn();
    const open = vi.fn();
    const citation = {
      document_version_id: "version-1",
      page_number: 2,
      page_count: 7,
      source_object_sha256: "a".repeat(64),
      title: "정책.pdf",
    };

    openCitationInline({ preventDefault }, citation, open);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(citation);
  });

  it("관리 홈 처리 실패는 감사 이벤트가 아니라 RAG 실패 작업 요약만 사용한다", () => {
    expect(readFailedRagJobs({ failed: 3 })).toBe(3);
    expect(readFailedRagJobs({ items: [{ event_type: "ROLE_CHANGED" }] })).toBeNull();
    expect(readFailedRagJobs({ failed: -1 })).toBeNull();
  });

  it("registry와 구현 action map이 정확히 9개 화면을 공유한다", () => {
    expect(ragScreens).toHaveLength(9);
    expect(Object.keys(ragScreenPrimaryActions).sort()).toEqual(
      ragScreens.map((screen) => screen.id).sort(),
    );
  });

  it("Wire Flow의 첫 번째 RAG 행동 문구를 그대로 사용한다", () => {
    expect(ragScreenPrimaryActions).toEqual({
      "U-RAG-001": "질문 전송",
      "U-RAG-002": "다음 페이지",
      "U-RAG-003": "다른 페이지 보기",
      "A-RAG-001": "폴더 추가·수정",
      "A-RAG-002": "폴더 저장",
      "A-RAG-003": "이 폴더에 업로드",
      "A-RAG-004": "업로드 시작",
      "A-RAG-005": "처리 완료 문서",
      "A-RAG-006": "문서 삭제",
    });
  });

  it.each(ragScreens)("$id 최신 Wire Flow 제목·대표 행동을 렌더링한다", (screen) => {
    const html = renderToStaticMarkup(
      createElement(RagFunctionalScreen, { screen, query: { folderId: "folder-current" } }),
    );
    expect(html).toContain(screen.id);
    expect(html).toContain(latestWireflowTitles[screen.id as keyof typeof latestWireflowTitles]);
    expect(html).toContain(ragScreenPrimaryActions[screen.id]);
    expect(html).toContain('class="wf-screen-heading"');
    expect(html).not.toContain('class="civic-screen-meta"');
    expect(html).not.toContain("준비 중");
  });

  it("참여자 RAG에는 업로드·다운로드·새 창 행동이 없다", () => {
    for (const screen of ragScreens.filter((item) => item.id.startsWith("U-RAG"))) {
      const html = renderToStaticMarkup(createElement(RagFunctionalScreen, { screen }));
      expect(html).not.toMatch(/type="file"/);
      expect(html).not.toMatch(/\sdownload(?:=|\s|>)/);
      expect(html).not.toContain('target="_blank"');
      expect(html).not.toContain("blob:");
    }
  });

  it("관리자 업로드는 지원 형식과 LEGAL-05 권리 확인을 함께 표시한다", () => {
    const screen = ragScreens.find((item) => item.id === "A-RAG-004");
    if (!screen) throw new Error("A-RAG-004 missing");
    const html = renderToStaticMarkup(
      createElement(RagFunctionalScreen, { screen, query: { folderId: "folder-current" } }),
    );

    expect(html).toContain('type="file"');
    expect(html).toContain(RAG_ACCEPTED_EXTENSIONS.join(","));
    expect(html).toContain("문서 이용 권한을 보유하고 있습니다");
    expect(html).toContain("새 문서");
    expect(html).toContain('href="/admin/rag?folderId=folder-current"');
    const versionHtml = renderToStaticMarkup(
      createElement(RagFunctionalScreen, {
        screen,
        query: { mode: "NEW_VERSION", documentId: "document-1", versionId: "version-1" },
      }),
    );
    expect(versionHtml).toContain("새 버전");
    expect(versionHtml).toContain("선택한 문서에 새 버전을 등록합니다");
    expect(versionHtml).not.toContain("document-1");
    expect(versionHtml).not.toContain("version-1");
  });

  it("참여자 대화는 유지하고 관리자 문서는 2열 작업공간과 목록 내 업로드를 사용한다", () => {
    const participant = ragScreens.find((item) => item.id === "U-RAG-001");
    const admin = ragScreens.find((item) => item.id === "A-RAG-001");
    if (!participant || !admin) throw new Error("RAG wire flow screens missing");

    const participantHtml = renderToStaticMarkup(
      createElement(RagFunctionalScreen, { screen: participant }),
    );
    const adminHtml = renderToStaticMarkup(createElement(RagFunctionalScreen, { screen: admin }));

    expect(participantHtml).toContain('data-wireflow-screen="U-RAG-001"');
    expect(participantHtml).toContain('data-wireflow-layout="rag-conversation"');
    expect(participantHtml).toContain("궁금한 정보를 질문하세요.");
    expect(participantHtml).toContain("새 질문");
    expect(participantHtml).toContain("메시지 입력");
    expect(participantHtml).toContain(">전송<");
    expect(adminHtml).toContain('data-wireflow-layout="rag-workspace"');
    expect(adminHtml).toContain("폴더 추가");
    expect(adminHtml).toContain("폴더 수정");
    expect(adminHtml).toContain("폴더 삭제");
    expect(adminHtml).toContain('data-rag-inline-upload="true"');
    expect(adminHtml).toContain('type="file"');
    expect(adminHtml).not.toContain('class="civic-document-inspector"');
  });

  it.each(["U-RAG-002", "U-RAG-003"])("%s는 대화 위 읽기 전용 참조 문서 모달이다", (screenId) => {
    const screen = ragScreens.find((item) => item.id === screenId);
    if (!screen) throw new Error(`${screenId} missing`);

    const html = renderToStaticMarkup(
      createElement(RagFunctionalScreen, {
        screen,
        query: { versionId: "version-1", page: "3", total: "12", title: "복지정책.pdf" },
      }),
    );

    expect(html).toContain('data-wireflow-layout="rag-reference-modal"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("참조 문서");
    expect(html).toContain("3 / 12");
    expect(html).toContain("읽기 전용");
    expect(html).toContain("문서 접근 권한을 확인하고 있습니다.");
    expect(html).not.toContain("iframe");
  });

  it.each([
    ["A-RAG-002", "폴더 수정"],
    ["A-RAG-006", "문서를 삭제하시겠습니까?"],
  ])("%s는 문서 작업공간 위 %s 모달이다", (screenId, dialogTitle) => {
    const screen = ragScreens.find((item) => item.id === screenId);
    if (!screen) throw new Error(`${screenId} missing`);

    const html = renderToStaticMarkup(createElement(RagFunctionalScreen, { screen }));

    expect(html).toContain('data-wireflow-layout="rag-workspace"');
    expect(html).toContain('data-wireflow-layout="rag-admin-modal"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(dialogTitle);
    if (screenId === "A-RAG-002") {
      expect(html).toContain("기본 폴더는 이름을 변경할 수 없습니다.");
      expect(html).toMatch(/<button[^>]+disabled=""[^>]*type="submit"/);
    }
    if (screenId === "A-RAG-006") {
      expect(html).toContain("현재 폴더에서 문서를 찾을 수 없습니다.");
      expect(html).toMatch(/<button[^>]+disabled=""[^>]*>문서 삭제<\/button>/);
    }
  });

  it("업로드와 처리 상태는 각각 독립 작업 화면을 사용한다", () => {
    const upload = ragScreens.find((item) => item.id === "A-RAG-004");
    const job = ragScreens.find((item) => item.id === "A-RAG-005");
    if (!upload || !job) throw new Error("RAG task screens missing");

    const uploadHtml = renderToStaticMarkup(createElement(RagFunctionalScreen, { screen: upload }));
    const jobHtml = renderToStaticMarkup(createElement(RagFunctionalScreen, { screen: job }));

    expect(uploadHtml).toContain('data-wireflow-layout="rag-upload"');
    expect(uploadHtml).not.toContain('data-wireflow-layout="rag-workspace"');
    expect(uploadHtml).toContain("파일 선택");
    expect(uploadHtml).not.toContain("<main");
    expect(jobHtml).toContain('data-wireflow-layout="rag-job-status"');
    expect(jobHtml).not.toContain('data-wireflow-layout="rag-workspace"');
    expect(jobHtml).toContain("문서 준비 진행 상태");
    expect(jobHtml).not.toContain("<main");
  });
});
