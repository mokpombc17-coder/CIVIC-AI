"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AdminChatOperationsLayout } from "@/components/admin/admin-chat-operations-layout";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  readAdminRoomPage,
  type AdminRoom,
  type AdminRoomPage,
  type AdminRoomStatus,
} from "@/lib/admin/admin-room-contracts";
import { formatAdminProblem, readAdminProblem } from "@/lib/admin/domain-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import {
  ConversationExportError,
  parseConversationExportArchive,
  readConversationExportResponse,
  type ConversationExportAnalysis,
  type ConversationExportMetrics,
  type ConversationMetricBucket,
} from "@/lib/chat/conversation-export";
import type { ScreenDefinition } from "@/lib/screens/registry";
import styles from "./admin-chat-insights.module.css";

export type AnalysisPeriod = "all" | "custom";
type AdminRouteQuery = Readonly<Record<string, string | readonly string[] | undefined>>;

export function AdminChatInsightsScreen({
  query: routeQuery,
  screen,
}: Readonly<{ query: AdminRouteQuery; screen: ScreenDefinition }>) {
  const initialRoomId = firstQueryValue(routeQuery.roomId);
  const [rooms, setRooms] = useState<readonly AdminRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRoomId);
  const [roomQuery, setRoomQuery] = useState("");
  const [roomStatus, setRoomStatus] = useState<AdminRoomStatus | "">("");
  const [activeRoomQuery, setActiveRoomQuery] = useState("");
  const [activeRoomStatus, setActiveRoomStatus] = useState<AdminRoomStatus | "">("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomMessage, setRoomMessage] = useState("");
  const [roomOperationNotice, setRoomOperationNotice] = useState<{
    text: string;
    tone: "error" | "success";
  } | null>(null);
  const [roomToClose, setRoomToClose] = useState<AdminRoom | null>(null);
  const [closingRoom, setClosingRoom] = useState(false);
  const [analysisPeriod, setAnalysisPeriod] = useState<AnalysisPeriod>("all");
  const [fromLocal, setFromLocal] = useState("");
  const [toLocal, setToLocal] = useState("");
  const [analysis, setAnalysis] = useState<ConversationExportAnalysis | null>(null);
  const [archive, setArchive] = useState<Uint8Array | null>(null);
  const [archiveName, setArchiveName] = useState("conversation-export.zip");
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const exportAbort = useRef<AbortController | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.roomId === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const loadRooms = useCallback(
    async (
      query = "",
      status: AdminRoomStatus | "" = "",
      cursor: string | null = null,
    ): Promise<AdminRoomPage | null> => {
      setRoomsLoading(true);
      setRoomMessage("");
      const parameters = adminRoomParameters(query, status, cursor);
      try {
        const response = await authenticatedFetch(`/api/v1/admin/rooms?${parameters.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cursor) setRooms([]);
          setRoomMessage(formatAdminProblem(await readAdminProblem(response)));
          return null;
        }
        const page = readAdminRoomPage(await response.json());
        if (!page) {
          if (!cursor) setRooms([]);
          setRoomMessage("서버의 관리자 채팅방 목록 응답 형식을 확인해야 합니다.");
          return null;
        }
        setRooms((current) => (cursor ? mergeRooms(current, page.items) : page.items));
        setNextCursor(page.nextCursor);
        setHasNext(page.hasNext);
        return page;
      } catch {
        if (!cursor) setRooms([]);
        setRoomMessage("네트워크 오류로 관리자 채팅방 목록을 불러오지 못했습니다.");
        return null;
      } finally {
        setRoomsLoading(false);
      }
    },
    [],
  );

  const loadAnalysis = useCallback(
    async (roomId: string, range: Readonly<{ fromInclusive: string; toExclusive: string }>) => {
      exportAbort.current?.abort();
      const controller = new AbortController();
      exportAbort.current = controller;
      setAnalyzing(true);
      setAnalysis(null);
      setArchive(null);
      setAnalysisMessage("");
      try {
        const response = await authenticatedFetch(
          `/api/v1/admin/rooms/${encodeURIComponent(roomId)}/conversation-exports`,
          {
            method: "POST",
            headers: { accept: "application/zip", "content-type": "application/json" },
            body: JSON.stringify(range),
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          setAnalysisMessage(await exportProblemMessage(response));
          return;
        }
        const contentType = response.headers.get("content-type")?.toLocaleLowerCase() ?? "";
        if (!contentType.startsWith("application/zip")) {
          setAnalysisMessage("서버가 application/zip 대신 다른 형식으로 응답했습니다.");
          return;
        }
        const bytes = await readConversationExportResponse(response);
        const parsed = await parseConversationExportArchive(bytes, { roomId, range });
        if (controller.signal.aborted) return;
        setAnalysis(parsed);
        setArchive(bytes);
        setArchiveName(exportFilename(response, parsed.manifest.roomName));
        setAnalysisMessage(
          parsed.warnings.length > 0
            ? "분석은 완료됐지만 대화 기록 건수 일치 여부를 확인해야 합니다."
            : "대화 기록 무결성을 확인하고 분석을 완료했습니다.",
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setAnalysisMessage(
          error instanceof ConversationExportError
            ? error.message
            : "대화 기록을 불러오거나 분석하는 중 오류가 발생했습니다.",
        );
      } finally {
        if (exportAbort.current === controller) {
          exportAbort.current = null;
          setAnalyzing(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRooms();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      exportAbort.current?.abort();
    };
  }, [loadRooms]);

  useEffect(() => {
    const syncSelectionFromHistory = () => {
      const roomId = new URL(window.location.href).searchParams.get("roomId");
      exportAbort.current?.abort();
      setSelectedRoomId(roomId);
      setAnalysis(null);
      setArchive(null);
      setAnalysisMessage("");
      setRoomOperationNotice(null);
    };
    window.addEventListener("popstate", syncSelectionFromHistory);
    return () => window.removeEventListener("popstate", syncSelectionFromHistory);
  }, []);

  const selectedRoomCreatedAt = selectedRoom?.createdAt;
  const analysisRange = useMemo(
    () =>
      selectedRoomCreatedAt
        ? resolveConversationAnalysisRange({
            createdAt: selectedRoomCreatedAt,
            period: analysisPeriod,
            fromLocal,
            toLocal,
          })
        : null,
    [analysisPeriod, fromLocal, selectedRoomCreatedAt, toLocal],
  );
  const customRangeInvalid =
    analysisPeriod === "custom" &&
    Boolean(selectedRoomId && fromLocal && toLocal) &&
    analysisRange === null;

  useEffect(() => {
    if (!selectedRoomId || !analysisRange) return;
    const timer = window.setTimeout(
      () => void loadAnalysis(selectedRoomId, analysisRange),
      analysisPeriod === "all" ? 0 : 400,
    );
    return () => {
      window.clearTimeout(timer);
      exportAbort.current?.abort();
    };
  }, [analysisPeriod, analysisRange, loadAnalysis, selectedRoomId]);

  function searchRooms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    exportAbort.current?.abort();
    setSelectedRoomId(null);
    setAnalysis(null);
    setArchive(null);
    setAnalysisMessage("");
    setRoomOperationNotice(null);
    window.history.replaceState(null, "", "/admin/chat");
    const query = roomQuery.trim();
    setActiveRoomQuery(query);
    setActiveRoomStatus(roomStatus);
    void loadRooms(query, roomStatus);
  }

  function selectRoom(room: AdminRoom, trigger: HTMLButtonElement) {
    exportAbort.current?.abort();
    returnFocusRef.current = trigger;
    setSelectedRoomId(room.roomId);
    setAnalysis(null);
    setArchive(null);
    setAnalysisMessage("");
    setRoomOperationNotice(null);
    window.history.pushState(null, "", `/admin/chat?roomId=${encodeURIComponent(room.roomId)}`);
  }

  const closeRoomDrawer = useCallback(() => {
    const returnTarget = returnFocusRef.current;
    exportAbort.current?.abort();
    setSelectedRoomId(null);
    setAnalysis(null);
    setArchive(null);
    setAnalysisMessage("");
    setRoomOperationNotice(null);
    window.history.replaceState(null, "", "/admin/chat");
    window.setTimeout(() => returnTarget?.focus(), 0);
  }, []);

  function filterRooms(nextStatus: AdminRoomStatus | "") {
    exportAbort.current?.abort();
    setSelectedRoomId(null);
    setAnalysis(null);
    setArchive(null);
    setAnalysisMessage("");
    setRoomOperationNotice(null);
    setRoomStatus(nextStatus);
    setActiveRoomQuery(roomQuery.trim());
    setActiveRoomStatus(nextStatus);
    window.history.replaceState(null, "", "/admin/chat");
    void loadRooms(roomQuery.trim(), nextStatus);
  }

  function selectAnalysisPeriod(period: AnalysisPeriod) {
    exportAbort.current?.abort();
    setAnalysis(null);
    setArchive(null);
    setAnalysisMessage("");
    if (period === "custom" && (!fromLocal || !toLocal)) {
      const range = defaultCustomLocalRange(selectedRoom?.createdAt);
      setFromLocal(range.from);
      setToLocal(range.to);
    }
    setAnalysisPeriod(period);
  }

  function changeCustomRange(field: "from" | "to", value: string) {
    exportAbort.current?.abort();
    setAnalysis(null);
    setArchive(null);
    setAnalysisMessage("");
    if (field === "from") setFromLocal(value);
    else setToLocal(value);
  }

  function applyRoomUpdate(updated: AdminRoom) {
    setRooms((current) => current.map((room) => (room.roomId === updated.roomId ? updated : room)));
  }

  async function closeSelectedRoom() {
    const target = roomToClose;
    if (!target || target.status === "CLOSED" || closingRoom) {
      setRoomToClose(null);
      return;
    }

    exportAbort.current?.abort();
    setClosingRoom(true);
    setAnalysisMessage("");
    setRoomOperationNotice(null);
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/rooms/${encodeURIComponent(target.roomId)}/commands/close`,
        {
          method: "POST",
          headers: { "idempotency-key": window.crypto.randomUUID() },
          cache: "no-store",
        },
      );
      if (!response.ok) {
        const problem = await readAdminProblem(response);
        setRoomOperationNotice({
          tone: "error",
          text:
            problem.code === "ROOM_HAS_OTHER_ACTIVE_MEMBERS"
              ? "현재 서버의 종료 정책이 관리자 즉시 종료 계약과 다릅니다. Chat 서버 배포 버전을 확인해 주세요."
              : formatAdminProblem(problem),
        });
        return;
      }

      const confirmed = await findAdminRoom(target);
      const closed =
        confirmed?.status === "CLOSED"
          ? confirmed
          : { ...target, status: "CLOSED" as const, activeMemberCount: 0 };
      applyRoomUpdate(closed);
      setRoomOperationNotice({
        tone: "success",
        text:
          confirmed?.status === "CLOSED"
            ? "관리자 목록에서 CLOSED 상태를 확인했습니다. 방장과 모든 참여자의 접속 및 이후 활동이 차단됩니다."
            : "종료 명령은 성공했지만 관리자 목록의 최신 상태는 확인하지 못했습니다. 목록을 새로고침해 주세요.",
      });
    } catch {
      const confirmed = await findAdminRoom(target);
      if (confirmed?.status === "CLOSED") {
        applyRoomUpdate(confirmed);
        setRoomOperationNotice({
          tone: "success",
          text: "응답 연결은 끊겼지만 관리자 목록에서 CLOSED 상태를 확인했습니다.",
        });
      } else {
        setRoomOperationNotice({
          tone: "error",
          text: "종료 처리 결과를 확인하지 못했습니다. 관리자 목록을 새로고침한 뒤 상태를 확인해 주세요.",
        });
      }
    } finally {
      setClosingRoom(false);
      setRoomToClose(null);
    }
  }

  function downloadArchive() {
    if (!archive) return;
    const blob = new Blob([Uint8Array.from(archive).buffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = archiveName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <ScreenFrame screen={screen} title="채팅방 관리">
      <AdminChatOperationsLayout>
        <div
          className="civic-admin-workbench civic-domain-console"
          data-wireflow-layout="chat-room-admin"
        >
          <form
            className={`civic-domain-toolbar civic-task-list-toolbar ${styles.tableToolbar}`}
            onSubmit={searchRooms}
          >
            <label className="civic-field">
              <span>채팅방 이름 검색</span>
              <input
                disabled={roomsLoading || closingRoom}
                onChange={(event) => setRoomQuery(event.currentTarget.value)}
                placeholder="채팅방 이름 입력…"
                type="search"
                value={roomQuery}
              />
            </label>
            <div aria-label="채팅방 상태" className="wf-admin-filters" role="group">
              {(["", "ACTIVE", "CLOSED"] as const).map((status) => (
                <button
                  aria-pressed={roomStatus === status}
                  disabled={roomsLoading || closingRoom}
                  key={status || "ALL"}
                  onClick={() => filterRooms(status)}
                  type="button"
                >
                  {status ? roomStatusLabel(status) : "전체"}
                </button>
              ))}
            </div>
            <button
              className="civic-secondary-action"
              disabled={roomsLoading || closingRoom}
              type="submit"
            >
              검색
            </button>
          </form>

          <RoomTable
            loading={roomsLoading}
            onOpen={selectRoom}
            rooms={rooms}
            selectedRoomId={selectedRoomId}
          />
          {hasNext && nextCursor ? (
            <button
              className="wf-button wf-button-secondary civic-load-more"
              disabled={roomsLoading || closingRoom}
              onClick={() => void loadRooms(activeRoomQuery, activeRoomStatus, nextCursor)}
              type="button"
            >
              다음 채팅방 불러오기
            </button>
          ) : null}
          {roomMessage ? (
            <p aria-live="polite" className={styles.problem} role="status">
              {roomMessage}
            </p>
          ) : null}
        </div>

        {selectedRoomId ? (
          <RoomStatisticsDrawer onClose={closeRoomDrawer} room={selectedRoom}>
            {selectedRoom ? (
              <>
                <RoomSummary room={selectedRoom} />
                <section aria-label="채팅방 통계 상세" className={styles.analysisPanel}>
                  <AnalysisRangeControls
                    analyzing={analyzing}
                    closingRoom={closingRoom}
                    fromLocal={fromLocal}
                    onFromChange={(value) => changeCustomRange("from", value)}
                    onPeriodChange={selectAnalysisPeriod}
                    onToChange={(value) => changeCustomRange("to", value)}
                    period={analysisPeriod}
                    selectedRoom={selectedRoom}
                    toLocal={toLocal}
                  />
                  {roomOperationNotice ? (
                    <p
                      aria-live="polite"
                      className={
                        roomOperationNotice.tone === "success"
                          ? styles.statusMessage
                          : styles.problem
                      }
                      role="status"
                    >
                      {roomOperationNotice.text}
                    </p>
                  ) : null}
                  {analyzing ? (
                    <p aria-live="polite" className={styles.statusMessage} role="status">
                      {analysisPeriod === "all"
                        ? "전체 기간의 대화를 자동으로 분석하고 있습니다."
                        : "선택한 기간의 대화를 자동으로 분석하고 있습니다."}
                    </p>
                  ) : null}
                  {!analyzing && (customRangeInvalid || analysisMessage) ? (
                    <p aria-live="polite" className={styles.statusMessage} role="status">
                      {customRangeInvalid
                        ? "시작 시각은 종료 시각보다 앞서야 합니다."
                        : analysisMessage}
                    </p>
                  ) : null}
                  {analysis && analysisRange ? (
                    <AnalysisResult
                      analysis={analysis}
                      archiveReady={archive !== null}
                      onDownload={downloadArchive}
                    />
                  ) : (
                    <EmptyAnalysis selected />
                  )}
                  <RoomOperationSettings
                    closingRoom={closingRoom}
                    onCloseRoom={() => {
                      if (selectedRoom.status === "ACTIVE") setRoomToClose(selectedRoom);
                    }}
                    selectedRoom={selectedRoom}
                  />
                </section>
              </>
            ) : (
              <p className={styles.drawerEmpty}>
                {roomsLoading
                  ? "채팅방 정보를 불러오는 중입니다."
                  : "목록에서 채팅방을 찾지 못했습니다."}
              </p>
            )}
          </RoomStatisticsDrawer>
        ) : null}
      </AdminChatOperationsLayout>
      <ConfirmDialog
        busy={closingRoom}
        busyLabel="종료 중…"
        cancelLabel="운영 유지"
        confirmLabel="채팅방 종료"
        confirmationInputLabel="종료 확인 문구"
        confirmationPhrase="종료합니다."
        description={`‘${roomToClose?.name ?? ""}’ 채팅방의 방장과 참여 중인 모든 사용자가 퇴장되고, 접속 중인 연결이 끊깁니다. 이후 참여·메시지·구독은 차단됩니다.`}
        destructive
        onCancel={() => setRoomToClose(null)}
        onConfirm={() => void closeSelectedRoom()}
        open={roomToClose !== null}
        title="채팅방을 즉시 종료할까요?"
      />
    </ScreenFrame>
  );
}

function RoomTable({
  loading,
  onOpen,
  rooms,
  selectedRoomId,
}: Readonly<{
  loading: boolean;
  onOpen: (room: AdminRoom, trigger: HTMLButtonElement) => void;
  rooms: readonly AdminRoom[];
  selectedRoomId: string | null;
}>) {
  return (
    <div aria-label="채팅방 관리 목록" className="civic-table-scroll" role="region" tabIndex={0}>
      <table className="civic-admin-table">
        <thead>
          <tr>
            <th>채팅방 이름</th>
            <th>상태</th>
            <th>카테고리</th>
            <th>활성 참여자</th>
            <th>개설 시각</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {rooms.length === 0 ? (
            <tr>
              <td colSpan={6}>
                {loading ? "채팅방을 불러오는 중입니다." : "검색된 채팅방이 없습니다."}
              </td>
            </tr>
          ) : null}
          {rooms.map((room) => (
            <tr key={room.roomId}>
              <th scope="row">{room.name}</th>
              <td>
                <span className={styles.roomState} data-status={room.status}>
                  {roomStatusLabel(room.status)}
                </span>
              </td>
              <td>{room.categorySummaries.map((category) => category.name).join(", ") || "—"}</td>
              <td>{room.activeMemberCount.toLocaleString("ko-KR")}명</td>
              <td>{formatKoreanDate(room.createdAt)}</td>
              <td>
                <button
                  aria-controls="civic-chat-statistics-drawer"
                  aria-expanded={selectedRoomId === room.roomId}
                  className="civic-primary-action"
                  onClick={(event) => onOpen(room, event.currentTarget)}
                  type="button"
                >
                  상세 보기
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoomStatisticsDrawer({
  children,
  onClose,
  room,
}: Readonly<{ children: ReactNode; onClose: () => void; room: AdminRoom | null }>) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="alertdialog"]')) return;
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

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
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
        aria-label="채팅방 통계 닫기"
        className="civic-admin-detail-drawer-scrim"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="civic-chat-statistics-drawer-title"
        aria-modal="true"
        className={`civic-admin-detail-drawer ${styles.statisticsDrawer}`}
        id="civic-chat-statistics-drawer"
        onKeyDown={trapFocus}
        ref={drawerRef}
        role="dialog"
      >
        <header>
          <div>
            <small>채팅방 관리</small>
            <h2 id="civic-chat-statistics-drawer-title">
              {room ? `${room.name} 통계` : "채팅방 통계"}
            </h2>
          </div>
          <button
            aria-label="채팅방 통계 닫기"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>
        <div className={styles.drawerBody}>{children}</div>
      </aside>
    </div>
  );
}

function RoomSummary({ room }: Readonly<{ room: AdminRoom }>) {
  const items = [
    ["상태", roomStatusLabel(room.status)],
    ["공개 범위", visibilityLabel(room.visibility)],
    ["참여 방식", joinPolicyLabel(room.joinPolicy)],
    ["활성 참여자", `${room.activeMemberCount.toLocaleString("ko-KR")}명`],
    ["카테고리", room.categorySummaries.map((category) => category.name).join(", ") || "지정 없음"],
    ["개설 시각", formatKoreanDate(room.createdAt)],
  ] as const;
  return (
    <section aria-label="채팅방 정보" className={styles.roomSummary}>
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function AnalysisRangeControls({
  analyzing,
  closingRoom,
  fromLocal,
  onFromChange,
  onPeriodChange,
  onToChange,
  period,
  selectedRoom,
  toLocal,
}: Readonly<{
  analyzing: boolean;
  closingRoom: boolean;
  fromLocal: string;
  onFromChange: (value: string) => void;
  onPeriodChange: (period: AnalysisPeriod) => void;
  onToChange: (value: string) => void;
  period: AnalysisPeriod;
  selectedRoom: AdminRoom | null;
  toLocal: string;
}>) {
  return (
    <section className={styles.rangeForm}>
      <header>
        <div>
          <small>조회 대상</small>
          <strong>{selectedRoom?.name ?? "왼쪽에서 채팅방을 선택하세요"}</strong>
        </div>
        <span data-status={selectedRoom?.status ?? "NONE"}>
          {selectedRoom ? roomStatusLabel(selectedRoom.status) : "선택 필요"}
        </span>
      </header>
      <div aria-label="분석 기간" className={styles.periodPicker} role="group">
        <button
          aria-pressed={period === "all"}
          disabled={!selectedRoom || closingRoom}
          onClick={() => onPeriodChange("all")}
          type="button"
        >
          전체 기간
        </button>
        <button
          aria-pressed={period === "custom"}
          disabled={!selectedRoom || closingRoom}
          onClick={() => onPeriodChange("custom")}
          type="button"
        >
          기간 지정
        </button>
      </div>
      {period === "custom" ? (
        <div className={styles.rangeFields}>
          <label>
            <span>시작 시각</span>
            <input
              disabled={!selectedRoom || closingRoom}
              onChange={(event) => onFromChange(event.currentTarget.value)}
              required
              type="datetime-local"
              value={fromLocal}
            />
          </label>
          <span aria-hidden="true">→</span>
          <label>
            <span>종료 시각</span>
            <input
              disabled={!selectedRoom || closingRoom}
              onChange={(event) => onToChange(event.currentTarget.value)}
              required
              type="datetime-local"
              value={toLocal}
            />
          </label>
        </div>
      ) : (
        <p className={styles.periodSummary}>
          {selectedRoom
            ? `${formatKoreanDate(selectedRoom.createdAt)} 개설 이후의 전체 대화를 자동으로 표시합니다.`
            : "채팅방을 선택하면 개설 이후 전체 대화를 자동으로 표시합니다."}
        </p>
      )}
      {period === "custom" ? (
        <p>입력 시각은 현재 기기 시간대로 받고 API에는 ISO 8601 UTC Instant로 전송합니다.</p>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {analyzing ? "대화 분석 중" : ""}
      </span>
    </section>
  );
}

function RoomOperationSettings({
  closingRoom,
  onCloseRoom,
  selectedRoom,
}: Readonly<{
  closingRoom: boolean;
  onCloseRoom: () => void;
  selectedRoom: AdminRoom | null;
}>) {
  if (!selectedRoom) return null;
  return (
    <details className={styles.roomSettings}>
      <summary>채팅방 운영 설정</summary>
      <div>
        <p>
          {selectedRoom.status === "ACTIVE"
            ? "종료하면 모든 참여자의 연결과 이후 활동이 즉시 차단됩니다."
            : "종료된 채팅방입니다. 대화 기록과 분석 결과는 계속 확인할 수 있습니다."}
        </p>
        {selectedRoom.status === "ACTIVE" ? (
          <button
            className={styles.closeRoomButton}
            disabled={closingRoom}
            onClick={onCloseRoom}
            type="button"
          >
            {closingRoom ? "종료 상태 확인 중…" : "채팅방 종료"}
          </button>
        ) : null}
      </div>
    </details>
  );
}

function AnalysisResult({
  analysis,
  archiveReady,
  onDownload,
}: Readonly<{
  analysis: ConversationExportAnalysis;
  archiveReady: boolean;
  onDownload: () => void;
}>) {
  return (
    <div className={styles.result}>
      <SnapshotHeader analysis={analysis} archiveReady={archiveReady} onDownload={onDownload} />
      {analysis.warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {analysis.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <ChatStatisticsSummary metrics={analysis.metrics} />
    </div>
  );
}

function SnapshotHeader({
  analysis,
  archiveReady,
  onDownload,
}: Readonly<{
  analysis: ConversationExportAnalysis;
  archiveReady: boolean;
  onDownload: () => void;
}>) {
  return (
    <section className={styles.snapshot}>
      <div>
        <span>무결성 확인 완료</span>
        <h2>{analysis.manifest.roomName}</h2>
        <p>{analysis.manifest.roomDescription || "채팅방 설명이 없습니다."}</p>
      </div>
      <div className={styles.snapshotMeta}>
        <dl>
          <div>
            <dt>분석 구간</dt>
            <dd>
              {formatKoreanDate(analysis.manifest.range.fromInclusive)} —<br />
              {formatKoreanDate(analysis.manifest.range.toExclusive)}
            </dd>
          </div>
          <div>
            <dt>스냅샷</dt>
            <dd>{formatKoreanDate(analysis.manifest.capturedAt)}</dd>
          </div>
        </dl>
        <button
          className={styles.downloadButton}
          disabled={!archiveReady}
          onClick={onDownload}
          type="button"
        >
          원본 ZIP 내려받기
        </button>
      </div>
    </section>
  );
}

export function ChatStatisticsSummary({
  metrics,
}: Readonly<{ metrics: ConversationExportMetrics }>) {
  return (
    <>
      <section aria-label="채팅 통계" className={styles.kpis}>
        <Metric label="전체 메시지" value={`${metrics.totalMessages}건`} />
        <Metric label="작성자" value={`${metrics.authorCount}명`} />
        <Metric
          label="수정 메시지"
          value={`${metrics.editedMessages}건`}
          note={formatRate(metrics.editRate)}
        />
        <Metric
          label="삭제 메시지"
          value={`${metrics.deletedMessages}건`}
          note={formatRate(metrics.deletionRate)}
          tone="danger"
        />
      </section>
      <BarChart buckets={metrics.daily} title="일자별 메시지 추이" />
    </>
  );
}

function BarChart({
  buckets,
  title,
}: Readonly<{ buckets: readonly ConversationMetricBucket[]; title: string }>) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <section className={styles.barCard}>
      <header>
        <span>BREAKDOWN</span>
        <h3>{title}</h3>
      </header>
      <ol>
        {buckets.map((bucket) => (
          <li key={bucket.key}>
            <div>
              <span>{bucket.label}</span>
              <strong>{bucket.count}건</strong>
            </div>
            <i style={{ "--bar-width": `${(bucket.count / max) * 100}%` } as CSSProperties} />
          </li>
        ))}
      </ol>
      {buckets.length === 0 ? <p>표시할 데이터가 없습니다.</p> : null}
    </section>
  );
}

function Metric({
  label,
  note,
  tone,
  value,
}: Readonly<{ label: string; note?: string; tone?: "danger"; value: string }>) {
  return (
    <article className={tone === "danger" ? styles.dangerMetric : undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}

function EmptyAnalysis({ selected }: Readonly<{ selected: boolean }>) {
  return (
    <section className={styles.empty}>
      <span aria-hidden="true">↗</span>
      <h2>{selected ? "대화 분석을 준비하고 있습니다" : "채팅방을 먼저 선택하세요"}</h2>
      <p>
        {selected
          ? "전체 기간 기록의 무결성을 확인한 뒤 분석 결과를 자동으로 표시합니다."
          : "관리자 전체 채팅방 목록에서 운영 또는 분석 대상을 고를 수 있습니다."}
      </p>
    </section>
  );
}

function defaultCustomLocalRange(roomCreatedAt?: string): Readonly<{ from: string; to: string }> {
  const to = new Date();
  to.setSeconds(0, 0);
  const recent = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  const created = roomCreatedAt ? new Date(roomCreatedAt) : null;
  const from = created && Number.isFinite(created.getTime()) && created > recent ? created : recent;
  return { from: localDateTime(from), to: localDateTime(to) };
}

function localDateTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function utcRange(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) return null;
  if (fromDate.getTime() >= toDate.getTime()) return null;
  return { fromInclusive: fromDate.toISOString(), toExclusive: toDate.toISOString() };
}

export function resolveConversationAnalysisRange({
  createdAt,
  fromLocal,
  now = new Date(),
  period,
  toLocal,
}: Readonly<{
  createdAt: string;
  fromLocal: string;
  now?: Date;
  period: AnalysisPeriod;
  toLocal: string;
}>) {
  if (period === "custom") return utcRange(fromLocal, toLocal);
  const from = new Date(createdAt);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(now.getTime()) || from >= now)
    return null;
  return { fromInclusive: from.toISOString(), toExclusive: now.toISOString() };
}

function mergeRooms(current: readonly AdminRoom[], next: readonly AdminRoom[]) {
  return [...new Map([...current, ...next].map((room) => [room.roomId, room])).values()];
}

function adminRoomParameters(
  query: string,
  status: AdminRoomStatus | "",
  cursor: string | null = null,
): URLSearchParams {
  const parameters = new URLSearchParams({ limit: "50" });
  if (query.trim()) parameters.set("query", query.trim());
  if (status) parameters.set("status", status);
  if (cursor) parameters.set("cursor", cursor);
  return parameters;
}

async function findAdminRoom(target: AdminRoom): Promise<AdminRoom | null> {
  const parameters = adminRoomParameters(target.name, "");
  parameters.set("limit", "100");
  try {
    const response = await authenticatedFetch(`/api/v1/admin/rooms?${parameters.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const page = readAdminRoomPage(await response.json());
    return page?.items.find((room) => room.roomId === target.roomId) ?? null;
  } catch {
    return null;
  }
}

function roomStatusLabel(status: AdminRoomStatus): string {
  return status === "ACTIVE" ? "운영 중" : "종료";
}

function visibilityLabel(visibility: AdminRoom["visibility"]): string {
  return visibility === "LISTED" ? "목록 공개" : "목록 비공개";
}

function joinPolicyLabel(joinPolicy: AdminRoom["joinPolicy"]): string {
  return joinPolicy === "OPEN" ? "바로 참여" : "초대 전용";
}

function firstQueryValue(value: string | readonly string[] | undefined): string | null {
  return typeof value === "string" ? value : (value?.[0] ?? null);
}

async function exportProblemMessage(response: Response): Promise<string> {
  if (response.status === 403) {
    return "대화 원본 접근 권한이 없습니다. 관리자 토큰의 chat:audit:exports scope를 확인해 주세요.";
  }
  if (response.status === 404) {
    return "채팅방을 찾을 수 없거나 대화 기록 API가 아직 준비되지 않았습니다.";
  }
  if (response.status === 401) return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  return formatAdminProblem(await readAdminProblem(response));
}

function exportFilename(response: Response, roomName: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/iu)?.[1];
  const basic = disposition.match(/filename="?([^";]+)"?/iu)?.[1];
  let candidate = `${roomName}-conversation-export.zip`;
  try {
    candidate = decodeURIComponent(utf8 ?? basic ?? candidate);
  } catch {
    candidate = basic ?? candidate;
  }
  const sanitized = candidate.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "-").slice(0, 160);
  return sanitized.toLocaleLowerCase().endsWith(".zip") ? sanitized : `${sanitized}.zip`;
}

function formatKoreanDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatRate(value: number): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value);
}
