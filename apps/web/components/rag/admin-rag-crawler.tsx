"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { Folder } from "./admin-rag-screen";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

type CrawlSource = Readonly<{
  source_id: string;
  name: string;
  start_url: string;
  target_folder_id: string;
  traversal: "BFS" | "DFS";
  max_depth: number;
  max_pages: number;
  same_origin: boolean;
  same_path: boolean;
  include_patterns: readonly string[];
  exclude_patterns: readonly string[];
  body_selector: string | null;
  link_selector: string | null;
  collect_attachments: boolean;
  schedule: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  enabled: boolean;
  version: number;
}>;

type CrawlRun = Readonly<{
  run_id: string;
  state: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  discovered_count: number;
  ingested_count: number;
  skipped_count: number;
  safe_error_code?: string | null;
}>;

type CrawlSourceReference = Readonly<{ source_id: string }>;
type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type Draft = Readonly<{
  name: string;
  startUrl: string;
  targetFolderId: string;
  traversal: "BFS" | "DFS";
  maxDepth: number;
  maxPages: number;
  schedule: CrawlSource["schedule"];
}>;

type CrawlPreview = Readonly<{
  title: string;
  text_preview: string;
  media_type: string;
  link_count: number;
}>;

const EMPTY_DRAFT: Draft = {
  name: "",
  startUrl: "https://",
  targetFolderId: "",
  traversal: "BFS",
  maxDepth: 2,
  maxPages: 100,
  schedule: "NONE",
};

export async function loadLatestCrawlRuns(
  sources: readonly CrawlSourceReference[],
  request: FetchRequest = authenticatedFetch,
): Promise<Readonly<Record<string, CrawlRun | undefined>>> {
  const entries = await Promise.all(
    sources.map(async (source) => {
      try {
        const response = await request(
          `/api/v1/rag/crawler/sources/${encodeURIComponent(source.source_id)}/runs`,
          { cache: "no-store" },
        );
        if (!response.ok) return [source.source_id, undefined] as const;
        const body = (await response.json()) as { items?: CrawlRun[] };
        return [source.source_id, Array.isArray(body.items) ? body.items[0] : undefined] as const;
      } catch {
        return [source.source_id, undefined] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export type CrawlSourceRemovalResult =
  | Readonly<{ kind: "deleted"; refreshFailed: boolean }>
  | Readonly<{ kind: "network" }>
  | Readonly<{ kind: "rejected" }>;

export async function removeCrawlSourceAndRefresh(
  sourceId: string,
  refreshSources: () => Promise<void>,
  request: FetchRequest = authenticatedFetch,
): Promise<CrawlSourceRemovalResult> {
  let response: Response;
  try {
    response = await request(`/api/v1/rag/crawler/sources/${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
    });
  } catch {
    return { kind: "network" };
  }
  if (!response.ok) return { kind: "rejected" };

  try {
    await refreshSources();
    return { kind: "deleted", refreshFailed: false };
  } catch {
    return { kind: "deleted", refreshFailed: true };
  }
}

export function AdminRagCrawler({ folders }: Readonly<{ folders: readonly Folder[] }>) {
  const [sources, setSources] = useState<readonly CrawlSource[]>([]);
  const [runs, setRuns] = useState<Readonly<Record<string, CrawlRun | undefined>>>({});
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<CrawlSource>();
  const [sourceToRemove, setSourceToRemove] = useState<CrawlSource>();
  const [removingSource, setRemovingSource] = useState(false);
  const [message, setMessage] = useState("");
  const [previewCookies, setPreviewCookies] = useState("");
  const [previewAuthorization, setPreviewAuthorization] = useState("");
  const [preview, setPreview] = useState<CrawlPreview>();

  const refresh = useCallback(async () => {
    const response = await authenticatedFetch("/api/v1/rag/crawler/sources", { cache: "no-store" });
    if (!response.ok) throw new Error("웹 수집원 목록을 불러오지 못했습니다.");
    const body = (await response.json()) as { items?: CrawlSource[] };
    const nextSources = Array.isArray(body.items) ? body.items : [];
    setSources(nextSources);
    const nextRuns = await loadLatestCrawlRuns(nextSources);
    setRuns(nextRuns);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : "웹 수집원을 불러오지 못했습니다."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("저장 중...");
    const payload = {
      name: draft.name,
      start_url: draft.startUrl,
      target_folder_id: draft.targetFolderId,
      traversal: draft.traversal,
      max_depth: draft.maxDepth,
      max_pages: draft.maxPages,
      same_origin: true,
      same_path: true,
      include_patterns: [],
      exclude_patterns: [],
      body_selector: null,
      link_selector: null,
      collect_attachments: true,
      schedule: draft.schedule,
      enabled: true,
      ...(editing ? { version: editing.version } : {}),
    };
    const response = await authenticatedFetch(
      editing
        ? `/api/v1/rag/crawler/sources/${encodeURIComponent(editing.source_id)}`
        : "/api/v1/rag/crawler/sources",
      {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      setMessage("주소가 공개 웹인지와 입력값을 확인해 주세요.");
      return;
    }
    setDraft(EMPTY_DRAFT);
    setEditing(undefined);
    setMessage("웹 수집원을 저장했습니다.");
    await refresh();
  }

  async function run(source: CrawlSource) {
    setMessage(`${source.name} 수집을 요청했습니다.`);
    const response = await authenticatedFetch(
      `/api/v1/rag/crawler/sources/${encodeURIComponent(source.source_id)}/runs`,
      { method: "POST" },
    );
    if (!response.ok) {
      setMessage("이미 실행 중인지 확인해 주세요.");
      return;
    }
    const next = (await response.json()) as CrawlRun;
    setRuns((current) => ({ ...current, [source.source_id]: next }));
  }

  async function stop(source: CrawlSource, run: CrawlRun) {
    const response = await authenticatedFetch(
      `/api/v1/rag/crawler/runs/${encodeURIComponent(run.run_id)}/stop`,
      { method: "POST" },
    );
    if (!response.ok) {
      setMessage("이미 끝난 수집 작업입니다.");
      return;
    }
    const stopped = (await response.json()) as CrawlRun;
    setRuns((current) => ({ ...current, [source.source_id]: stopped }));
    setMessage("수집 중단을 요청했습니다.");
  }

  async function remove() {
    const source = sourceToRemove;
    if (!source || removingSource) {
      setSourceToRemove(undefined);
      return;
    }
    setRemovingSource(true);
    try {
      const result = await removeCrawlSourceAndRefresh(source.source_id, refresh);
      if (result.kind === "network") {
        setMessage("네트워크 오류로 수집 설정을 삭제하지 못했습니다.");
        return;
      }
      if (result.kind === "rejected") {
        setMessage("수집 설정을 삭제하지 못했습니다.");
        return;
      }
      setSources((current) => current.filter((item) => item.source_id !== source.source_id));
      setMessage(
        result.refreshFailed
          ? "수집 설정은 삭제했지만 최신 목록을 불러오지 못했습니다. 화면을 새로고침해 주세요."
          : "수집 설정을 삭제했습니다.",
      );
    } finally {
      setRemovingSource(false);
      setSourceToRemove(undefined);
    }
  }

  async function checkAuthenticatedPreview() {
    setMessage("접속을 확인하고 있습니다...");
    setPreview(undefined);
    let sessionHandle: string | undefined;
    try {
      const cookies = Object.fromEntries(
        previewCookies
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const separator = part.indexOf("=");
            if (separator < 1) throw new Error("쿠키를 이름=값 형식으로 입력해 주세요.");
            return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
          }),
      );
      if (Object.keys(cookies).length || previewAuthorization.trim()) {
        const sessionResponse = await authenticatedFetch("/api/v1/rag/crawler/preview-sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cookies,
            headers: previewAuthorization.trim()
              ? { Authorization: previewAuthorization.trim() }
              : {},
          }),
        });
        if (!sessionResponse.ok) throw new Error("로그인 정보를 확인해 주세요.");
        const session = (await sessionResponse.json()) as { session_handle: string };
        sessionHandle = session.session_handle;
      }
      const response = await authenticatedFetch("/api/v1/rag/crawler/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: draft.startUrl,
          ...(sessionHandle ? { session_handle: sessionHandle } : {}),
        }),
      });
      if (!response.ok) throw new Error("주소 또는 로그인 정보를 확인해 주세요.");
      setPreview((await response.json()) as CrawlPreview);
      setPreviewCookies("");
      setPreviewAuthorization("");
      setMessage("접속을 확인했습니다. 로그인 정보는 저장하지 않았습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "접속 확인에 실패했습니다.");
    } finally {
      if (sessionHandle) {
        await authenticatedFetch(
          `/api/v1/rag/crawler/preview-sessions/${encodeURIComponent(sessionHandle)}`,
          {
            method: "DELETE",
          },
        ).catch(() => undefined);
      }
    }
  }

  function edit(source: CrawlSource) {
    setEditing(source);
    setDraft({
      name: source.name,
      startUrl: source.start_url,
      targetFolderId: source.target_folder_id,
      traversal: source.traversal,
      maxDepth: source.max_depth,
      maxPages: source.max_pages,
      schedule: source.schedule,
    });
  }

  return (
    <details className="civic-inline-upload" data-rag-crawler="true">
      <summary>
        <span>
          <strong>웹 문서 수집</strong>
        </span>
        <span aria-hidden="true" className="civic-inline-upload-toggle">
          수집 설정
        </span>
      </summary>
      <div className="civic-inline-upload-body">
        <form className="civic-admin-form" onSubmit={submit}>
          <label>
            <span>표시 이름</span>
            <input
              maxLength={255}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
              value={draft.name}
            />
          </label>
          <label>
            <span>시작 주소</span>
            <input
              onChange={(event) => setDraft({ ...draft, startUrl: event.target.value })}
              placeholder="https://example.org/notices/"
              required
              type="url"
              value={draft.startUrl}
            />
          </label>
          <label>
            <span>저장 폴더</span>
            <select
              onChange={(event) => setDraft({ ...draft, targetFolderId: event.target.value })}
              required
              value={draft.targetFolderId}
            >
              <option value="">폴더 선택</option>
              {folders.map((folder) => (
                <option key={folder.folder_id} value={folder.folder_id}>
                  {(folder.path ?? [folder.name]).join(" / ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>탐색 순서</span>
            <select
              onChange={(event) =>
                setDraft({ ...draft, traversal: event.target.value as Draft["traversal"] })
              }
              value={draft.traversal}
            >
              <option value="BFS">너비 우선</option>
              <option value="DFS">깊이 우선</option>
            </select>
          </label>
          <label>
            <span>최대 깊이</span>
            <input
              max={5}
              min={0}
              onChange={(event) => setDraft({ ...draft, maxDepth: Number(event.target.value) })}
              type="number"
              value={draft.maxDepth}
            />
          </label>
          <label>
            <span>최대 페이지</span>
            <input
              max={500}
              min={1}
              onChange={(event) => setDraft({ ...draft, maxPages: Number(event.target.value) })}
              type="number"
              value={draft.maxPages}
            />
          </label>
          <label>
            <span>자동 재수집</span>
            <select
              onChange={(event) =>
                setDraft({ ...draft, schedule: event.target.value as Draft["schedule"] })
              }
              value={draft.schedule}
            >
              <option value="NONE">사용 안 함</option>
              <option value="DAILY">매일</option>
              <option value="WEEKLY">매주</option>
              <option value="MONTHLY">매월</option>
            </select>
          </label>
          <div className="civic-form-actions">
            <button className="civic-primary-action" type="submit">
              {editing ? "수정 저장" : "수집원 추가"}
            </button>
            {editing ? (
              <button
                onClick={() => {
                  setEditing(undefined);
                  setDraft(EMPTY_DRAFT);
                }}
                type="button"
              >
                취소
              </button>
            ) : null}
          </div>
        </form>
        <details className="civic-admin-subsection">
          <summary>로그인 필요 사이트 접속 확인</summary>
          <p>
            쿠키와 인증 헤더는 30분 이내의 암호화된 임시 세션에서만 사용하며 수집 설정에는 저장하지
            않습니다.
          </p>
          <div className="civic-admin-form">
            <label>
              <span>쿠키</span>
              <input
                autoComplete="off"
                onChange={(event) => setPreviewCookies(event.target.value)}
                placeholder="session=값; access=값"
                type="password"
                value={previewCookies}
              />
            </label>
            <label>
              <span>Authorization 헤더</span>
              <input
                autoComplete="off"
                onChange={(event) => setPreviewAuthorization(event.target.value)}
                placeholder="Bearer ..."
                type="password"
                value={previewAuthorization}
              />
            </label>
            <div className="civic-form-actions">
              <button onClick={() => void checkAuthenticatedPreview()} type="button">
                현재 시작 주소 접속 확인
              </button>
            </div>
          </div>
          {preview ? (
            <article aria-label="웹 문서 미리보기" className="civic-admin-preview-result">
              <strong>{preview.title}</strong>
              <p>{preview.text_preview}</p>
              <small>
                {preview.media_type} · 발견 링크 {preview.link_count}개
              </small>
            </article>
          ) : null}
        </details>
        {sources.length ? (
          <div className="civic-table-scroll" role="region" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>수집원</th>
                  <th>저장 폴더</th>
                  <th>주기</th>
                  <th>최근 작업</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => {
                  const current = runs[source.source_id];
                  const folder = folders.find((item) => item.folder_id === source.target_folder_id);
                  return (
                    <tr key={source.source_id}>
                      <td>
                        <strong>{source.name}</strong>
                        <small>{source.start_url}</small>
                      </td>
                      <td>{folder ? (folder.path ?? [folder.name]).join(" / ") : "삭제된 폴더"}</td>
                      <td>{scheduleLabel(source.schedule)}</td>
                      <td>{current ? runLabel(current) : "실행 기록 없음"}</td>
                      <td>
                        <button onClick={() => edit(source)} type="button">
                          수정
                        </button>
                        {current && ["QUEUED", "RUNNING"].includes(current.state) ? (
                          <button onClick={() => stop(source, current)} type="button">
                            중단
                          </button>
                        ) : (
                          <button onClick={() => run(source)} type="button">
                            지금 수집
                          </button>
                        )}
                        <button
                          className="is-danger"
                          onClick={() => setSourceToRemove(source)}
                          type="button"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>등록된 웹 수집원이 없습니다.</p>
        )}
        {message ? <p aria-live="polite">{message}</p> : null}
      </div>
      <ConfirmDialog
        busy={removingSource}
        busyLabel="삭제 중…"
        cancelLabel="유지"
        confirmLabel="수집 설정 삭제"
        description={`‘${sourceToRemove?.name ?? ""}’ 수집 설정을 삭제합니다. 삭제 후에는 되돌릴 수 없습니다.`}
        destructive
        onCancel={() => setSourceToRemove(undefined)}
        onConfirm={() => void remove()}
        open={sourceToRemove !== undefined}
        title="수집 설정을 삭제할까요?"
      />
    </details>
  );
}

function scheduleLabel(schedule: CrawlSource["schedule"]): string {
  return { NONE: "수동", DAILY: "매일", WEEKLY: "매주", MONTHLY: "매월" }[schedule];
}

function runLabel(run: CrawlRun): string {
  const status = {
    QUEUED: "대기 중",
    RUNNING: "수집 중",
    SUCCEEDED: "완료",
    FAILED: "실패",
    CANCELLED: "중단됨",
  }[run.state];
  return `${status} · 발견 ${run.discovered_count} · 등록 ${run.ingested_count} · 변경 없음 ${run.skipped_count}`;
}
