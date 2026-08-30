"use client";

import type { Route } from "next";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { AdminChatOperationsLayout } from "@/components/admin/admin-chat-operations-layout";
import { ConsoleDataGrid, type ConsoleColumn } from "@/components/admin/console/console-data-grid";
import {
  ConsoleEmpty,
  ConsolePane,
  ConsoleStatus,
  ConsoleWorkspace,
} from "@/components/admin/console/console-ui";
import { RoomCategorySelector } from "@/components/admin/room-category-selector";
import { adminUserLabel, requestAdminUserLabels } from "@/lib/admin/user-labels";
import {
  adminFieldError,
  formatAdminProblem,
  readAdminProblem,
  readRoomCreationRequest,
  readRoomCreationRequestPage,
  validateRejectionReason,
  type RoomCreationRequest,
  type RoomCreationStatus,
  type AdminProblem,
} from "@/lib/admin/domain-contracts";
import {
  readRoomCategoryPage,
  sortRoomCategories,
  validateCategorySelection,
  type RoomCategory,
} from "@/lib/admin/room-category-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { ScreenDefinition } from "@/lib/screens/registry";

const statusLabels: Readonly<Record<RoomCreationStatus, string>> = {
  PENDING: "승인 대기",
  APPROVED: "승인",
  REJECTED: "반려",
  CANCELED: "취소",
};

const filterStatuses: readonly Readonly<{ label: string; value: RoomCreationStatus }>[] = [
  { value: "PENDING", label: "승인 대기" },
  { value: "APPROVED", label: "승인" },
  { value: "REJECTED", label: "반려" },
];

export type ChatRequestRow = Readonly<{
  creationRequestId: string;
  name: string;
  requesterLabel: string;
  requestedLabel: string;
  statusLabel: string;
}>;

export const CHAT_REQUEST_GRID_COLUMNS: ReadonlyArray<ConsoleColumn<ChatRequestRow>> = [
  { field: "name", headerName: "토론방 이름", flex: 2, minWidth: 150 },
  { field: "requesterLabel", headerName: "신청자", flex: 2, minWidth: 140 },
  { field: "requestedLabel", headerName: "요청 시각", minWidth: 130 },
  { field: "statusLabel", headerName: "상태", minWidth: 90 },
];

export function chatRequestRowFromItem(
  item: RoomCreationRequest,
  labels: ReadonlyMap<string, string>,
): ChatRequestRow {
  return {
    creationRequestId: item.creationRequestId,
    name: item.name,
    requesterLabel: adminUserLabel(labels, item.requesterUserId),
    requestedLabel: formatDate(item.requestedAt),
    statusLabel: statusLabel(item.status),
  };
}

export function chatRequestDetailPath(requestId: string): string {
  return `/admin/chat/requests/detail?requestId=${encodeURIComponent(requestId)}`;
}

export function AdminChatRequestScreen({
  screen,
  query: routeQuery,
}: Readonly<{ screen: ScreenDefinition; query: AdminRouteQuery }>) {
  const detailScreen = screen.id === "A-CHAT-005" || screen.id === "A-CHAT-006";
  const initialRequestId = firstQueryValue(routeQuery.requestId);
  const [status, setStatus] = useState<RoomCreationStatus>("PENDING");
  const [items, setItems] = useState<readonly RoomCreationRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(initialRequestId);
  const [selected, setSelected] = useState<RoomCreationRequest | null>(null);
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(new Map());
  const [categories, setCategories] = useState<readonly RoomCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<readonly string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(Boolean(initialRequestId));
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AdminProblem | null>(null);
  const [rejectMode, setRejectMode] = useState(screen.id === "A-CHAT-006");
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);

  const loadList = useCallback(async (nextStatus: RoomCreationStatus, cursor?: string) => {
    const currentGeneration = ++listGeneration.current;
    setListLoading(true);
    const parameters = new URLSearchParams({ status: nextStatus, limit: "20" });
    if (cursor) parameters.set("cursor", cursor);
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/room-creation-requests?${parameters.toString()}`,
        { cache: "no-store" },
      );
      if (currentGeneration !== listGeneration.current) return;
      if (!response.ok) {
        const problem = await readAdminProblem(response);
        setMessage(formatAdminProblem(problem));
        if (!cursor) setItems([]);
        return;
      }
      const page = readRoomCreationRequestPage(await response.json());
      if (!page) {
        setMessage("서버의 신청 목록 응답 형식을 확인해야 합니다.");
        if (!cursor) setItems([]);
        return;
      }
      setItems((current) => (cursor ? [...current, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
      setMessage("");
      const nextLabels = await requestAdminUserLabels(
        page.items.map((item) => item.requesterUserId),
      );
      if (currentGeneration === listGeneration.current && nextLabels) {
        setLabels((current) => new Map([...current, ...nextLabels]));
      }
    } catch {
      if (currentGeneration === listGeneration.current) {
        if (!cursor) setItems([]);
        setMessage("네트워크 오류로 신청 목록을 불러오지 못했습니다.");
      }
    } finally {
      if (currentGeneration === listGeneration.current) setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (requestId: string) => {
    const currentGeneration = ++detailGeneration.current;
    setDetailLoading(true);
    try {
      const [response, categoryResponse] = await Promise.all([
        authenticatedFetch(
          `/api/v1/admin/room-creation-requests/${encodeURIComponent(requestId)}`,
          { cache: "no-store" },
        ),
        authenticatedFetch("/api/v1/admin/room-categories", { cache: "no-store" }).catch(
          () => null,
        ),
      ]);
      if (currentGeneration !== detailGeneration.current) return null;
      if (!response.ok) {
        setSelected(null);
        setMessage(formatAdminProblem(await readAdminProblem(response)));
        return null;
      }
      const detail = readRoomCreationRequest(await response.json());
      if (currentGeneration !== detailGeneration.current) return null;
      if (!detail) {
        setSelected(null);
        setMessage("서버의 신청 상세 응답 형식을 확인해야 합니다.");
        return null;
      }
      setSelected(detail);
      setSelectedCategoryIds(detail.categoryIds);
      if (!categoryResponse) {
        setCategories([]);
        setMessage("네트워크 오류로 카테고리 목록을 불러오지 못했습니다.");
      } else if (!categoryResponse.ok) {
        setCategories([]);
        setMessage(formatAdminProblem(await readAdminProblem(categoryResponse)));
      } else {
        const page = readRoomCategoryPage(await categoryResponse.json());
        if (!page) {
          setCategories([]);
          setMessage("서버의 카테고리 목록 응답 형식을 확인해야 합니다.");
        } else {
          setCategories(sortRoomCategories(page.items));
          setMessage("");
        }
      }
      const nextLabels = await requestAdminUserLabels([detail.requesterUserId]);
      if (currentGeneration === detailGeneration.current && nextLabels) {
        setLabels((current) => new Map([...current, ...nextLabels]));
      }
      return detail;
    } catch {
      if (currentGeneration === detailGeneration.current) {
        setMessage("네트워크 오류로 신청 상세를 불러오지 못했습니다.");
      }
      return null;
    } finally {
      if (currentGeneration === detailGeneration.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList(status);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      listGeneration.current += 1;
    };
  }, [loadList, status]);

  useEffect(() => {
    if (!initialRequestId) return;
    const timer = window.setTimeout(() => {
      void loadDetail(initialRequestId);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      detailGeneration.current += 1;
    };
  }, [initialRequestId, loadDetail]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return items;
    return items.filter((item) =>
      [item.name, adminUserLabel(labels, item.requesterUserId)]
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(normalized),
    );
  }, [items, labels, query]);

  const rows = useMemo(
    () => filteredItems.map((item) => chatRequestRowFromItem(item, labels)),
    [filteredItems, labels],
  );

  function selectRequest(row: ChatRequestRow) {
    setSelectedRequestId(row.creationRequestId);
    syncRequestUrl(row.creationRequestId);
    void loadDetail(row.creationRequestId);
  }

  async function decide(action: "approve" | "reject", reason?: string) {
    if (!selected || selected.status !== "PENDING" || pending) return;
    if (action === "reject") {
      const validation = validateRejectionReason(reason ?? "");
      if (validation) return setMessage(validation);
    }
    if (action === "approve") {
      const validation = validateCategorySelection(selectedCategoryIds);
      if (validation) return setMessage(validation);
    }
    detailGeneration.current += 1;
    setPending(true);
    setMessage("");
    setProblem(null);
    const url = `/api/v1/admin/room-creation-requests/${encodeURIComponent(selected.creationRequestId)}/${action}`;
    try {
      const response = await authenticatedFetch(url, {
        method: "POST",
        ...(action === "reject"
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ reason: reason?.trim() }),
            }
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ categoryIds: selectedCategoryIds }),
            }),
      });
      if (!response.ok) {
        const problem = await readAdminProblem(response);
        setProblem(problem);
        if (response.status === 409) await loadDetail(selected.creationRequestId);
        setMessage(formatAdminProblem(problem));
        return;
      }
      const result = readRoomCreationRequest(await response.json());
      if (!result) return setMessage("서버의 처리 결과 응답 형식을 확인해야 합니다.");
      setSelected(result);
      setSelectedCategoryIds(result.categoryIds);
      setItems((current) =>
        current.map((item) =>
          item.creationRequestId === result.creationRequestId ? result : item,
        ),
      );
      setMessage(
        result.replayed
          ? "이미 반영된 동일 결정을 확인했습니다. 방은 중복 생성되지 않았습니다."
          : action === "approve"
            ? "토론방 생성 신청을 승인했습니다."
            : "토론방 생성 신청을 반려했습니다.",
      );
    } catch {
      await loadDetail(selected.creationRequestId);
      setMessage("처리 결과가 불명확하여 서버의 최신 신청 상태를 다시 불러왔습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <ScreenFrame screen={screen}>
      <AdminChatOperationsLayout>
        <ConsoleWorkspace layout="admin-chat-request-console">
          <ConsolePane
            ariaLabel="개설 신청 목록"
            subtitle={`${filteredItems.length}건 표시`}
            title="개설 신청"
          >
            <div className="console-toolbar">
              <input
                aria-label="신청자 이메일 또는 토론방 이름 검색"
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="검색어 입력…"
                type="search"
                value={query}
              />
            </div>
            <div aria-label="신청 상태" className="console-filter-group" role="group">
              {filterStatuses.map((option) => (
                <button
                  aria-pressed={status === option.value}
                  disabled={listLoading}
                  key={option.value}
                  onClick={() => {
                    setStatus(option.value);
                    setItems([]);
                    setNextCursor(null);
                    setHasNext(false);
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <ConsoleDataGrid
              ariaLabel="토론방 생성 신청 표"
              columnDefs={CHAT_REQUEST_GRID_COLUMNS}
              emptyText="선택한 상태에 해당하는 신청이 없습니다."
              getRowId={(row) => row.creationRequestId}
              height={460}
              onRowClicked={selectRequest}
              rowData={rows}
              selectedRowId={selectedRequestId}
            />
            {hasNext && nextCursor ? (
              <button
                className="wf-button wf-button-secondary civic-load-more"
                disabled={listLoading}
                onClick={() => void loadList(status, nextCursor)}
                type="button"
              >
                다음 신청 불러오기
              </button>
            ) : null}
            {listLoading ? <ConsoleStatus>최신 신청 목록을 불러오는 중입니다.</ConsoleStatus> : null}
          </ConsolePane>

          <ConsolePane
            ariaLabel="신청 상세"
            subtitle={selected ? statusLabel(selected.status) : "목록에서 선택"}
            title={selected?.name ?? "신청을 선택하세요"}
          >
            {selected ? (
              <div className="civic-domain-console" data-wireflow-layout="chat-request-admin">
                <RequestDetail
                  item={selected}
                  categories={categories}
                  labels={labels}
                  onApprove={() => void decide("approve")}
                  onReject={(reason) => void decide("reject", reason)}
                  pending={pending}
                  problem={problem}
                  rejectMode={rejectMode}
                  selectedCategoryIds={selectedCategoryIds}
                  setSelectedCategoryIds={setSelectedCategoryIds}
                  setRejectMode={setRejectMode}
                />
              </div>
            ) : detailLoading ? (
              <ConsoleStatus>신청 상세를 불러오는 중입니다.</ConsoleStatus>
            ) : (
              <ConsoleEmpty title="목록에서 신청을 선택하세요." />
            )}
            {message ? <ConsoleStatus>{message}</ConsoleStatus> : null}
          </ConsolePane>
        </ConsoleWorkspace>
      </AdminChatOperationsLayout>
    </ScreenFrame>
  );
}

function syncRequestUrl(requestId: string) {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", chatRequestDetailPath(requestId));
}

type AdminRouteQuery = Readonly<Record<string, string | readonly string[] | undefined>>;

function firstQueryValue(value: string | readonly string[] | undefined): string | null {
  return typeof value === "string" ? value : (value?.[0] ?? null);
}

function RequestDetail({
  categories,
  item,
  labels,
  onApprove,
  onReject,
  pending,
  problem,
  rejectMode,
  selectedCategoryIds,
  setSelectedCategoryIds,
  setRejectMode,
}: Readonly<{
  categories: readonly RoomCategory[];
  item: RoomCreationRequest | null;
  labels: ReadonlyMap<string, string>;
  onApprove: () => void;
  onReject: (reason: string) => void;
  pending: boolean;
  problem: AdminProblem | null;
  rejectMode: boolean;
  selectedCategoryIds: readonly string[];
  setSelectedCategoryIds: (value: readonly string[]) => void;
  setRejectMode: (value: boolean) => void;
}>) {
  const [reason, setReason] = useState("");
  if (!item) {
    return (
      <div className="civic-domain-empty">
        <p>신청 상세를 선택하지 않았거나 불러오지 못했습니다.</p>
      </div>
    );
  }
  const actionable = item.status === "PENDING";
  return (
    <section className="civic-domain-detail civic-chat-request-detail">
      <div className="civic-chat-request-detail-grid">
        <div aria-label="신청 정보" className="civic-chat-request-context" role="region">
          <div className="civic-user-summary-grid">
            <Detail label="신청자" value={adminUserLabel(labels, item.requesterUserId)} />
            <Detail label="요청 시각" value={formatDate(item.requestedAt)} />
            <Detail label="토론방 이름" value={item.name} />
            <Detail label="상태" value={statusLabel(item.status)} />
            <Detail
              label="카테고리"
              value={
                item.categoryIds
                  .map(
                    (categoryId) =>
                      categories.find((category) => category.categoryId === categoryId)?.name ??
                      categoryId,
                  )
                  .join(", ") || "지정 없음"
              }
            />
          </div>
          <article className="civic-domain-description">
            <h2>신청 설명</h2>
            <p>{item.description || "설명이 없습니다."}</p>
          </article>
          {item.rejectionReason ? (
            <article className="civic-domain-description">
              <h2>반려 사유</h2>
              <p>{item.rejectionReason}</p>
            </article>
          ) : null}
        </div>
        <aside aria-label="신청 처리" className="civic-chat-request-decision">
          {actionable ? (
            <form
              className="civic-domain-action-panel"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                if (rejectMode) onReject(reason);
                else onApprove();
              }}
            >
              <fieldset>
                <legend>처리 방법</legend>
                <label>
                  <input
                    checked={!rejectMode}
                    disabled={pending}
                    name="decision"
                    onChange={() => setRejectMode(false)}
                    type="radio"
                  />
                  <span>신청 내용 그대로 승인</span>
                </label>
                <label>
                  <input
                    checked={rejectMode}
                    disabled={pending}
                    name="decision"
                    onChange={() => setRejectMode(true)}
                    type="radio"
                  />
                  <span>사유를 입력해 반려</span>
                </label>
              </fieldset>
              {rejectMode ? (
                <label className="civic-field">
                  <span>반려 사유</span>
                  <textarea
                    aria-describedby={
                      adminFieldError(problem, "reason") ? "chat-rejection-reason-error" : undefined
                    }
                    aria-invalid={Boolean(adminFieldError(problem, "reason"))}
                    className="civic-chat-request-rejection-reason"
                    disabled={pending}
                    maxLength={100}
                    onChange={(event) => setReason(event.currentTarget.value)}
                    required
                    rows={4}
                    value={reason}
                  />
                  <FieldError
                    id="chat-rejection-reason-error"
                    message={adminFieldError(problem, "reason")}
                  />
                  <small>{[...reason.trim()].length} / 100자</small>
                </label>
              ) : (
                <RoomCategorySelector
                  categories={categories}
                  disabled={pending}
                  legend="승인 카테고리"
                  onChange={setSelectedCategoryIds}
                  selectedCategoryIds={selectedCategoryIds}
                />
              )}
              <div className="civic-form-actions">
                <button
                  className={rejectMode ? "civic-danger-action" : "civic-primary-action"}
                  disabled={pending}
                  type="submit"
                >
                  {pending ? "처리 확인 중…" : rejectMode ? "반려" : "승인"}
                </button>
              </div>
            </form>
          ) : (
            <div className="civic-boundary-note">
              <p>이미 처리된 신청으로, 결정을 변경할 수 없습니다.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FieldError({ id, message }: Readonly<{ id: string; message: string | null }>) {
  return message ? (
    <small className="civic-field-error" id={id}>
      {message}
    </small>
  ) : null;
}

function statusLabel(status: RoomCreationStatus): string {
  return statusLabels[status];
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Seoul",
      }).format(date);
}
