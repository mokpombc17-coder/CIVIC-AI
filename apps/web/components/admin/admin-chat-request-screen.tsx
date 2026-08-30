"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { AdminChatOperationsLayout } from "@/components/admin/admin-chat-operations-layout";
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

export function AdminChatRequestScreen({
  screen,
  query: routeQuery,
}: Readonly<{ screen: ScreenDefinition; query: AdminRouteQuery }>) {
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
  const [listMessage, setListMessage] = useState("");
  const [detailMessage, setDetailMessage] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(Boolean(initialRequestId));
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AdminProblem | null>(null);
  const [rejectMode, setRejectMode] = useState(firstQueryValue(routeQuery.decision) === "reject");
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

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
        setListMessage(formatAdminProblem(problem));
        if (!cursor) setItems([]);
        return;
      }
      const page = readRoomCreationRequestPage(await response.json());
      if (!page) {
        setListMessage("서버의 신청 목록 응답 형식을 확인해야 합니다.");
        if (!cursor) setItems([]);
        return;
      }
      setItems((current) => (cursor ? [...current, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
      setListMessage("");
      const nextLabels = await requestAdminUserLabels(
        page.items.map((item) => item.requesterUserId),
      );
      if (currentGeneration === listGeneration.current && nextLabels) {
        setLabels((current) => new Map([...current, ...nextLabels]));
      }
    } catch {
      if (currentGeneration === listGeneration.current) {
        if (!cursor) setItems([]);
        setListMessage("네트워크 오류로 신청 목록을 불러오지 못했습니다.");
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
        setDetailMessage(formatAdminProblem(await readAdminProblem(response)));
        return null;
      }
      const detail = readRoomCreationRequest(await response.json());
      if (currentGeneration !== detailGeneration.current) return null;
      if (!detail) {
        setSelected(null);
        setDetailMessage("서버의 신청 상세 응답 형식을 확인해야 합니다.");
        return null;
      }
      setSelected(detail);
      setSelectedCategoryIds(detail.categoryIds);
      if (!categoryResponse) {
        setCategories([]);
        setDetailMessage("네트워크 오류로 카테고리 목록을 불러오지 못했습니다.");
      } else if (!categoryResponse.ok) {
        setCategories([]);
        setDetailMessage(formatAdminProblem(await readAdminProblem(categoryResponse)));
      } else {
        const page = readRoomCategoryPage(await categoryResponse.json());
        if (!page) {
          setCategories([]);
          setDetailMessage("서버의 카테고리 목록 응답 형식을 확인해야 합니다.");
        } else {
          setCategories(sortRoomCategories(page.items));
          setDetailMessage("");
        }
      }
      const nextLabels = await requestAdminUserLabels([detail.requesterUserId]);
      if (currentGeneration === detailGeneration.current && nextLabels) {
        setLabels((current) => new Map([...current, ...nextLabels]));
      }
      return detail;
    } catch {
      if (currentGeneration === detailGeneration.current) {
        setDetailMessage("네트워크 오류로 신청 상세를 불러오지 못했습니다.");
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
    if (!selectedRequestId) return;
    const timer = window.setTimeout(() => void loadDetail(selectedRequestId), 0);
    return () => {
      window.clearTimeout(timer);
      detailGeneration.current += 1;
    };
  }, [loadDetail, selectedRequestId]);

  useEffect(() => {
    const syncSelectionFromHistory = () => {
      const parameters = new URL(window.location.href).searchParams;
      const nextRequestId = parameters.get("requestId");
      setSelected(null);
      setDetailLoading(Boolean(nextRequestId));
      setDetailMessage("");
      setSelectedRequestId(nextRequestId);
      setRejectMode(parameters.get("decision") === "reject");
    };
    window.addEventListener("popstate", syncSelectionFromHistory);
    return () => window.removeEventListener("popstate", syncSelectionFromHistory);
  }, []);

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

  const openDetail = useCallback((item: RoomCreationRequest, trigger: HTMLButtonElement) => {
    returnFocusRef.current = trigger;
    setSelected(item);
    setSelectedCategoryIds(item.categoryIds);
    setSelectedRequestId(item.creationRequestId);
    setRejectMode(false);
    setDetailMessage("");
    setProblem(null);
    window.history.pushState(
      null,
      "",
      `/admin/chat/requests?requestId=${encodeURIComponent(item.creationRequestId)}`,
    );
  }, []);

  const closeDetail = useCallback(() => {
    const returnTarget = returnFocusRef.current;
    detailGeneration.current += 1;
    setSelectedRequestId(null);
    setSelected(null);
    setDetailMessage("");
    setProblem(null);
    window.history.replaceState(null, "", "/admin/chat/requests");
    window.setTimeout(() => returnTarget?.focus(), 0);
  }, []);

  async function decide(action: "approve" | "reject", reason?: string) {
    if (!selected || selected.status !== "PENDING" || pending) return;
    if (action === "reject") {
      const validation = validateRejectionReason(reason ?? "");
      if (validation) return setDetailMessage(validation);
    }
    if (action === "approve") {
      const validation = validateCategorySelection(selectedCategoryIds);
      if (validation) return setDetailMessage(validation);
    }
    detailGeneration.current += 1;
    setPending(true);
    setDetailMessage("");
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
        setDetailMessage(formatAdminProblem(problem));
        return;
      }
      const result = readRoomCreationRequest(await response.json());
      if (!result) {
        return setDetailMessage("서버의 처리 결과 응답 형식을 확인해야 합니다.");
      }
      setSelected(result);
      setSelectedCategoryIds(result.categoryIds);
      setItems((current) =>
        current.map((item) =>
          item.creationRequestId === result.creationRequestId ? result : item,
        ),
      );
      setDetailMessage(
        result.replayed
          ? "이미 반영된 동일 결정을 확인했습니다. 방은 중복 생성되지 않았습니다."
          : action === "approve"
            ? "채팅방 생성 신청을 승인했습니다."
            : "채팅방 생성 신청을 반려했습니다.",
      );
    } catch {
      await loadDetail(selected.creationRequestId);
      setDetailMessage("처리 결과가 불명확하여 서버의 최신 신청 상태를 다시 불러왔습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <ScreenFrame screen={screen} title="채팅방 생성 요청">
      <AdminChatOperationsLayout active="requests">
        <div
          className="civic-admin-workbench civic-domain-console"
          data-wireflow-layout="chat-request-admin"
        >
          <div className="civic-domain-toolbar">
            <label className="civic-field">
              <span>신청자 이메일 또는 채팅방 이름 검색</span>
              <input
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="검색어 입력…"
                type="search"
                value={query}
              />
            </label>
            <div aria-label="신청 상태" className="wf-admin-filters" role="group">
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
          </div>
          <RequestTable
            items={filteredItems}
            labels={labels}
            onOpen={openDetail}
            selectedRequestId={selectedRequestId}
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
          {listLoading ? <p aria-live="polite">신청 목록을 불러오는 중입니다.</p> : null}
          {listMessage ? (
            <p aria-live="polite" className="civic-form-message" role="status">
              {listMessage}
            </p>
          ) : null}
        </div>
        {selectedRequestId ? (
          <RequestDetailDrawer
            categories={categories}
            item={selected}
            key={selectedRequestId}
            labels={labels}
            loading={detailLoading}
            message={detailMessage}
            onApprove={() => void decide("approve")}
            onClose={closeDetail}
            onReject={(reason) => void decide("reject", reason)}
            pending={pending}
            problem={problem}
            rejectMode={rejectMode}
            selectedCategoryIds={selectedCategoryIds}
            setRejectMode={setRejectMode}
            setSelectedCategoryIds={setSelectedCategoryIds}
          />
        ) : null}
      </AdminChatOperationsLayout>
    </ScreenFrame>
  );
}

type AdminRouteQuery = Readonly<Record<string, string | readonly string[] | undefined>>;

function firstQueryValue(value: string | readonly string[] | undefined): string | null {
  return typeof value === "string" ? value : (value?.[0] ?? null);
}

function RequestTable({
  items,
  labels,
  onOpen,
  selectedRequestId,
}: Readonly<{
  items: readonly RoomCreationRequest[];
  labels: ReadonlyMap<string, string>;
  onOpen: (item: RoomCreationRequest, trigger: HTMLButtonElement) => void;
  selectedRequestId: string | null;
}>) {
  return (
    <div aria-label="채팅방 생성 신청 표" className="civic-table-scroll" role="region" tabIndex={0}>
      <table className="civic-admin-table">
        <thead>
          <tr>
            <th>채팅방 이름</th>
            <th>신청자</th>
            <th>요청 시각</th>
            <th>상태</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5}>선택한 상태에 해당하는 신청이 없습니다.</td>
            </tr>
          ) : null}
          {items.map((item) => (
            <tr key={item.creationRequestId}>
              <th scope="row">{item.name}</th>
              <td>{adminUserLabel(labels, item.requesterUserId)}</td>
              <td>{formatDate(item.requestedAt)}</td>
              <td>
                <StatusBadge status={item.status} />
              </td>
              <td>
                <button
                  aria-controls="civic-chat-request-detail-drawer"
                  aria-expanded={selectedRequestId === item.creationRequestId}
                  className="civic-primary-action"
                  onClick={(event) => onOpen(item, event.currentTarget)}
                  type="button"
                >
                  상세 검토
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequestDetailDrawer({
  categories,
  item,
  labels,
  loading,
  message,
  onApprove,
  onClose,
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
  loading: boolean;
  message: string;
  onApprove: () => void;
  onClose: () => void;
  onReject: (reason: string) => void;
  pending: boolean;
  problem: AdminProblem | null;
  rejectMode: boolean;
  selectedCategoryIds: readonly string[];
  setSelectedCategoryIds: (value: readonly string[]) => void;
  setRejectMode: (value: boolean) => void;
}>) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="civic-admin-detail-drawer-layer">
      <button
        aria-label="채팅 신청 상세 닫기"
        className="civic-admin-detail-drawer-scrim"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="civic-chat-request-drawer-title"
        aria-modal="true"
        className="civic-admin-detail-drawer civic-chat-request-drawer"
        id="civic-chat-request-detail-drawer"
        onKeyDown={handleKeyDown}
        ref={drawerRef}
        role="dialog"
      >
        <header>
          <div>
            <small>채팅 신청 관리</small>
            <h2 id="civic-chat-request-drawer-title">{item?.name ?? "신청 상세 검토"}</h2>
          </div>
          <button
            aria-label="채팅 신청 상세 닫기"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="civic-chat-request-drawer-body">
          {loading && !item ? <p aria-live="polite">신청 상세를 불러오는 중입니다.</p> : null}
          {!loading || item ? (
            <RequestDetail
              categories={categories}
              item={item}
              labels={labels}
              onApprove={onApprove}
              onClose={onClose}
              onReject={onReject}
              pending={pending}
              problem={problem}
              rejectMode={rejectMode}
              selectedCategoryIds={selectedCategoryIds}
              setRejectMode={setRejectMode}
              setSelectedCategoryIds={setSelectedCategoryIds}
            />
          ) : null}
          {message ? (
            <p aria-live="polite" className="civic-form-message" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function RequestDetail({
  categories,
  item,
  labels,
  onApprove,
  onClose,
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
  onClose: () => void;
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
        <button className="civic-secondary-action" onClick={onClose} type="button">
          닫기
        </button>
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
            <Detail label="채팅방 이름" value={item.name} />
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
                  <small>{[...reason.trim()].length} / 100자 · 한 줄 입력</small>
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
                <button className="civic-secondary-action" onClick={onClose} type="button">
                  닫기
                </button>
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
              <strong>처리 완료</strong>
              <p>승인·반려·취소된 신청에는 추가 결정을 전송하지 않습니다.</p>
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

function StatusBadge({ status }: Readonly<{ status: RoomCreationStatus }>) {
  return (
    <span className={`civic-domain-status is-${status.toLowerCase()}`}>{statusLabel(status)}</span>
  );
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
