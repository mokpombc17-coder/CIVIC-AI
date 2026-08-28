"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ScreenFrame } from "@/components/screens/screen-frame";
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

const statuses: readonly Readonly<{ label: string; value: RoomCreationStatus }>[] = [
  { value: "PENDING", label: "승인 대기" },
  { value: "APPROVED", label: "승인" },
  { value: "REJECTED", label: "반려" },
  { value: "CANCELED", label: "취소" },
];

export function AdminChatRequestScreen({
  screen,
  query: routeQuery,
}: Readonly<{ screen: ScreenDefinition; query: AdminRouteQuery }>) {
  const detailMode = screen.id === "A-CHAT-005" || screen.id === "A-CHAT-006";
  const requestId = firstQueryValue(routeQuery.requestId);
  const [status, setStatus] = useState<RoomCreationStatus>("PENDING");
  const [items, setItems] = useState<readonly RoomCreationRequest[]>([]);
  const [selected, setSelected] = useState<RoomCreationRequest | null>(null);
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(new Map());
  const [categories, setCategories] = useState<readonly RoomCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<readonly string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState(
    detailMode && !requestId ? "검토할 신청을 목록에서 선택해 주세요." : "",
  );
  const [loading, setLoading] = useState(!(detailMode && !requestId));
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AdminProblem | null>(null);
  const [rejectMode, setRejectMode] = useState(screen.id === "A-CHAT-006");
  const generation = useRef(0);

  const loadList = useCallback(async (nextStatus: RoomCreationStatus, cursor?: string) => {
    const currentGeneration = ++generation.current;
    setLoading(true);
    const parameters = new URLSearchParams({ status: nextStatus, limit: "20" });
    if (cursor) parameters.set("cursor", cursor);
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/room-creation-requests?${parameters.toString()}`,
        { cache: "no-store" },
      );
      if (currentGeneration !== generation.current) return;
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
      if (currentGeneration === generation.current && nextLabels) {
        setLabels((current) => new Map([...current, ...nextLabels]));
      }
    } catch {
      if (currentGeneration === generation.current) {
        if (!cursor) setItems([]);
        setMessage("네트워크 오류로 신청 목록을 불러오지 못했습니다.");
      }
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (requestId: string) => {
    const currentGeneration = ++generation.current;
    setLoading(true);
    try {
      const [response, categoryResponse] = await Promise.all([
        authenticatedFetch(
          `/api/v1/admin/room-creation-requests/${encodeURIComponent(requestId)}`,
          { cache: "no-store" },
        ),
        authenticatedFetch("/api/v1/admin/room-categories", { cache: "no-store" }),
      ]);
      if (currentGeneration !== generation.current) return null;
      if (!response.ok) {
        setSelected(null);
        setMessage(formatAdminProblem(await readAdminProblem(response)));
        return null;
      }
      const detail = readRoomCreationRequest(await response.json());
      if (currentGeneration !== generation.current) return null;
      if (!detail) {
        setSelected(null);
        setMessage("서버의 신청 상세 응답 형식을 확인해야 합니다.");
        return null;
      }
      setSelected(detail);
      setSelectedCategoryIds(detail.categoryIds);
      if (!categoryResponse.ok) {
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
      if (currentGeneration === generation.current && nextLabels) setLabels(nextLabels);
      return detail;
    } catch {
      if (currentGeneration === generation.current) {
        setMessage("네트워크 오류로 신청 상세를 불러오지 못했습니다.");
      }
      return null;
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (detailMode && requestId) void loadDetail(requestId);
      else if (!detailMode) void loadList(status);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      generation.current += 1;
    };
  }, [detailMode, loadDetail, loadList, requestId, status]);

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
    generation.current += 1;
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
      setMessage(
        result.replayed
          ? "이미 반영된 동일 결정을 확인했습니다. 방은 중복 생성되지 않았습니다."
          : action === "approve"
            ? "채팅방 생성 신청을 승인했습니다."
            : "채팅방 생성 신청을 반려했습니다.",
      );
    } catch {
      await loadDetail(selected.creationRequestId);
      setMessage("처리 결과가 불명확하여 서버의 최신 신청 상태를 다시 불러왔습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <ScreenFrame
      {...(detailMode ? { backHref: "/admin/chat/requests" as Route } : {})}
      screen={screen}
      title={detailMode ? "채팅방 생성 요청 검토" : "채팅방 생성 요청"}
    >
      <div
        className="civic-admin-workbench civic-domain-console"
        data-wireflow-layout="chat-request-admin"
      >
        {!detailMode ? (
          <>
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
                {statuses.map((option) => (
                  <button
                    aria-pressed={status === option.value}
                    disabled={loading}
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
            <RequestTable items={filteredItems} labels={labels} />
            {hasNext && nextCursor ? (
              <button
                className="wf-button wf-button-secondary civic-load-more"
                disabled={loading}
                onClick={() => void loadList(status, nextCursor)}
                type="button"
              >
                다음 신청 불러오기
              </button>
            ) : null}
          </>
        ) : (
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
        )}
        {loading ? <p aria-live="polite">최신 정보를 불러오는 중입니다.</p> : null}
        {message ? (
          <p aria-live="polite" className="civic-form-message" role="status">
            {message}
          </p>
        ) : null}
      </div>
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
}: Readonly<{
  items: readonly RoomCreationRequest[];
  labels: ReadonlyMap<string, string>;
}>) {
  return (
    <div aria-label="채팅방 생성 신청 표" className="civic-table-scroll" role="region" tabIndex={0}>
      <table className="civic-admin-table">
        <thead>
          <tr>
            <th>채팅방 이름</th>
            <th>신청자</th>
            <th>공개·참여 방식</th>
            <th>요청 시각</th>
            <th>상태</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6}>선택한 상태에 해당하는 신청이 없습니다.</td>
            </tr>
          ) : null}
          {items.map((item) => (
            <tr key={item.creationRequestId}>
              <th scope="row">{item.name}</th>
              <td>{adminUserLabel(labels, item.requesterUserId)}</td>
              <td>{roomPolicyLabel(item.visibility, item.joinPolicy)}</td>
              <td>{formatDate(item.requestedAt)}</td>
              <td>
                <StatusBadge status={item.status} />
              </td>
              <td>
                <Link
                  className="civic-primary-action"
                  href={
                    `/admin/chat/requests/detail?requestId=${encodeURIComponent(item.creationRequestId)}` as Route
                  }
                >
                  상세 검토
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
        <Link className="civic-secondary-action" href="/admin/chat/requests">
          신청 목록으로
        </Link>
      </div>
    );
  }
  const actionable = item.status === "PENDING";
  return (
    <section className="civic-domain-detail">
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
        <Detail label="공개·참여 방식" value={roomPolicyLabel(item.visibility, item.joinPolicy)} />
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
            <Link className="civic-secondary-action" href="/admin/chat/requests">
              목록으로
            </Link>
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
  return statuses.find((item) => item.value === status)?.label ?? status;
}

function roomPolicyLabel(visibility: string, joinPolicy: string): string {
  const visibilityLabels: Readonly<Record<string, string>> = {
    LISTED: "목록 공개",
    UNLISTED: "링크 공개",
    PUBLIC: "공개",
    PRIVATE: "비공개",
  };
  const visibilityLabel = visibilityLabels[visibility] ?? visibility;
  const joinLabel =
    joinPolicy === "OPEN" ? "바로 참여" : joinPolicy === "INVITE_ONLY" ? "초대 참여" : joinPolicy;
  return `${visibilityLabel} · ${joinLabel}`;
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
