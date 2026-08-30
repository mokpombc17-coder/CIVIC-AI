"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { AdminChatOperationsLayout } from "@/components/admin/admin-chat-operations-layout";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ConsoleTabs, type ConsoleTabItem } from "@/components/admin/console/console-ui";
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
  type ConversationMessage,
} from "@/lib/chat/conversation-export";
import type { ScreenDefinition } from "@/lib/screens/registry";
import styles from "./admin-chat-insights.module.css";

export type AnalysisPeriod = "all" | "custom";
export type ChatInsightsTab = "analysis" | "statistics";

export function chatInsightsTabForScreen(screenId: string): ChatInsightsTab {
  return screenId === "A-CHAT-008" ? "statistics" : "analysis";
}

export function chatInsightsPath(tab: ChatInsightsTab, roomId: string | null): string {
  const base = tab === "statistics" ? "/admin/chat/statistics" : "/admin/chat";
  return roomId ? `${base}?roomId=${encodeURIComponent(roomId)}` : base;
}

const INSIGHTS_TABS: readonly ConsoleTabItem[] = [
  { id: "analysis", label: "대화 분석" },
  { id: "statistics", label: "통계" },
];

type AdminRouteQuery = Readonly<Record<string, string | readonly string[] | undefined>>;

function firstQueryValue(value: string | readonly string[] | undefined): string | null {
  return typeof value === "string" ? value : (value?.[0] ?? null);
}

export function AdminChatInsightsScreen({
  query,
  screen,
}: Readonly<{ query?: AdminRouteQuery; screen: ScreenDefinition }>) {
  const [tab, setTab] = useState<ChatInsightsTab>(() => chatInsightsTabForScreen(screen.id));
  const [rooms, setRooms] = useState<readonly AdminRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<AdminRoom | null>(null);
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
          setRoomMessage("서버의 관리자 토론방 목록 응답 형식을 확인해야 합니다.");
          return null;
        }
        setRooms((current) => (cursor ? mergeRooms(current, page.items) : page.items));
        setSelectedRoom((current) =>
          current ? (page.items.find((item) => item.roomId === current.roomId) ?? current) : null,
        );
        setNextCursor(page.nextCursor);
        setHasNext(page.hasNext);
        return page;
      } catch {
        if (!cursor) setRooms([]);
        setRoomMessage("네트워크 오류로 관리자 토론방 목록을 불러오지 못했습니다.");
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
          setAnalysisMessage("서버가 대화 원본 파일 대신 다른 형식으로 응답했습니다.");
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

  const selectedRoomId = selectedRoom?.roomId;
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

  // Auto-select so the analysis panel is never an empty placeholder once the
  // room list is available. A roomId query (initial load or previous sync)
  // wins; otherwise the first listed room is selected.
  useEffect(() => {
    if (roomsLoading || selectedRoom !== null || rooms.length === 0) return;
    const requestedRoomId =
      firstQueryValue(query?.roomId) ?? new URLSearchParams(window.location.search).get("roomId");
    const nextRoom =
      (requestedRoomId ? rooms.find((room) => room.roomId === requestedRoomId) : undefined) ??
      rooms[0];
    if (nextRoom) selectRoom(nextRoom);
  });

  function searchRooms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    exportAbort.current?.abort();
    setSelectedRoom(null);
    setAnalysis(null);
    setArchive(null);
    setAnalysisMessage("");
    setRoomOperationNotice(null);
    const query = roomQuery.trim();
    setActiveRoomQuery(query);
    setActiveRoomStatus(roomStatus);
    void loadRooms(query, roomStatus);
  }

  function selectRoom(room: AdminRoom) {
    exportAbort.current?.abort();
    setSelectedRoom(room);
    setAnalysis(null);
    setArchive(null);
    setAnalysisMessage("");
    setRoomOperationNotice(null);
    syncChatInsightsUrl(tab, room.roomId);
  }

  function switchTab(nextTab: ChatInsightsTab) {
    setTab(nextTab);
    syncChatInsightsUrl(nextTab, selectedRoom?.roomId ?? null);
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
    setSelectedRoom((current) => (current?.roomId === updated.roomId ? updated : current));
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
    <ScreenFrame screen={screen} title={screenTitle(screen.id)}>
      <AdminChatOperationsLayout>
        <div className={styles.workspace}>
          <aside className={styles.roomPanel}>
            <header>
              <strong>운영할 토론방</strong>
            </header>
            <form className={styles.search} onSubmit={searchRooms} role="search">
              <div className={`console-search-control ${styles.queryField ?? ""}`}>
                <span aria-hidden="true" className="console-search-icon" />
                <input
                  aria-label="토론방 검색"
                  autoComplete="off"
                  disabled={roomsLoading || closingRoom}
                  onChange={(event) => setRoomQuery(event.currentTarget.value)}
                  placeholder="토론방 이름 검색"
                  type="search"
                  value={roomQuery}
                />
                <button
                  className="console-search-button"
                  disabled={roomsLoading || closingRoom}
                  type="submit"
                >
                  검색
                </button>
              </div>
              <label className={styles.statusField}>
                <span>상태</span>
                <select
                  aria-label="토론방 상태"
                  disabled={roomsLoading || closingRoom}
                  onChange={(event) =>
                    setRoomStatus(event.currentTarget.value as AdminRoomStatus | "")
                  }
                  value={roomStatus}
                >
                  <option value="">전체</option>
                  <option value="ACTIVE">운영 중</option>
                  <option value="CLOSED">종료</option>
                </select>
              </label>
            </form>
            <div aria-label="토론방 목록" className={styles.roomList} role="list">
              {rooms.map((room) => (
                <div key={room.roomId} role="listitem">
                  <button
                    aria-pressed={selectedRoom?.roomId === room.roomId}
                    className={styles.roomButton}
                    onClick={() => selectRoom(room)}
                    type="button"
                  >
                    <span className={styles.roomTitle}>
                      <strong>{room.name}</strong>
                      <b data-status={room.status}>{roomStatusLabel(room.status)}</b>
                    </span>
                    <span>활성 참여자 {room.activeMemberCount.toLocaleString("ko-KR")}명</span>
                  </button>
                </div>
              ))}
              {rooms.length === 0 ? (
                <p>{roomsLoading ? "토론방을 불러오는 중입니다." : "검색된 토론방이 없습니다."}</p>
              ) : null}
            </div>
            {hasNext && nextCursor ? (
              <button
                className={styles.moreButton}
                disabled={roomsLoading || closingRoom}
                onClick={() => void loadRooms(activeRoomQuery, activeRoomStatus, nextCursor)}
                type="button"
              >
                더 보기
              </button>
            ) : null}
            {roomMessage ? (
              <p aria-live="polite" className={styles.problem} role="status">
                {roomMessage}
              </p>
            ) : null}
          </aside>

          <section aria-label="대화 분석" className={styles.analysisPanel}>
            <ConsoleTabs
              activeId={tab}
              ariaLabel="분석 보기 탭"
              onSelect={(id) => switchTab(id as ChatInsightsTab)}
              tabs={INSIGHTS_TABS}
            />
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
                  roomOperationNotice.tone === "success" ? styles.statusMessage : styles.problem
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
                {customRangeInvalid ? "시작 시각은 종료 시각보다 앞서야 합니다." : analysisMessage}
              </p>
            ) : null}
            {analysis && analysisRange ? (
              <AnalysisResult
                analysis={analysis}
                archiveReady={archive !== null}
                onDownload={downloadArchive}
                tab={tab}
              />
            ) : (
              <EmptyAnalysis selected={selectedRoom !== null} />
            )}
            <RoomOperationSettings
              closingRoom={closingRoom}
              onCloseRoom={() => {
                if (selectedRoom?.status === "ACTIVE") setRoomToClose(selectedRoom);
              }}
              selectedRoom={selectedRoom}
            />
          </section>
        </div>
      </AdminChatOperationsLayout>
      <ConfirmDialog
        busy={closingRoom}
        busyLabel="종료 중…"
        cancelLabel="운영 유지"
        confirmLabel="토론방 종료"
        confirmationInputLabel="종료 확인 문구"
        confirmationPhrase="종료합니다."
        description={`‘${roomToClose?.name ?? ""}’ 토론방의 방장과 참여 중인 모든 사용자가 퇴장되고, 접속 중인 연결이 끊깁니다. 이후 참여·메시지·구독은 차단됩니다.`}
        destructive
        onCancel={() => setRoomToClose(null)}
        onConfirm={() => void closeSelectedRoom()}
        open={roomToClose !== null}
        title="토론방을 즉시 종료할까요?"
      />
    </ScreenFrame>
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
          <strong>{selectedRoom?.name ?? "토론방을 선택하세요"}</strong>
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
            : "토론방을 선택하면 개설 이후 전체 대화를 자동으로 표시합니다."}
        </p>
      )}
      {period === "custom" ? <p>입력한 시각은 현재 기기 시간대 기준입니다.</p> : null}
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
      <summary>토론방 운영 설정</summary>
      <div>
        <p>
          {selectedRoom.status === "ACTIVE"
            ? "종료하면 모든 참여자의 연결과 이후 활동이 즉시 차단됩니다."
            : "종료된 토론방입니다. 대화 기록과 분석 결과는 계속 확인할 수 있습니다."}
        </p>
        {selectedRoom.status === "ACTIVE" ? (
          <button
            className={styles.closeRoomButton}
            disabled={closingRoom}
            onClick={onCloseRoom}
            type="button"
          >
            {closingRoom ? "종료 상태 확인 중…" : "토론방 종료"}
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
  tab,
}: Readonly<{
  analysis: ConversationExportAnalysis;
  archiveReady: boolean;
  onDownload: () => void;
  tab: ChatInsightsTab;
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
      {tab === "statistics" ? <ChatStatisticsSummary metrics={analysis.metrics} /> : null}
      {tab === "analysis" ? <ConversationDetail analysis={analysis} /> : null}
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
        <p>{analysis.manifest.roomDescription || "토론방 설명이 없습니다."}</p>
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
            <dt>수집 시각</dt>
            <dd>{formatKoreanDate(analysis.manifest.capturedAt)}</dd>
          </div>
        </dl>
        <button
          className={styles.downloadButton}
          disabled={!archiveReady}
          onClick={onDownload}
          type="button"
        >
          대화 원본 내려받기
        </button>
      </div>
    </section>
  );
}

function ConversationDetail({ analysis }: Readonly<{ analysis: ConversationExportAnalysis }>) {
  const labels = useMemo(() => authorLabels(analysis.messages), [analysis.messages]);
  return (
    <>
      <section aria-label="토론방 핵심 수치" className={styles.kpis}>
        <Metric label="전체 메시지" value={`${analysis.metrics.totalMessages}건`} />
        <Metric label="잔존 메시지" value={`${analysis.metrics.retainedMessages}건`} />
        <Metric label="삭제 메시지" value={`${analysis.metrics.deletedMessages}건`} tone="danger" />
        <Metric label="작성자" value={`${analysis.metrics.authorCount}명`} />
      </section>
      <section className={styles.conversation}>
        <header>
          <div>
            <h3>종료 시점 대화 상태</h3>
          </div>
          <small>최근 {Math.min(analysis.messages.length, 30)}건</small>
        </header>
        <ol>
          {analysis.messages.slice(-30).map((message) => (
            <li
              className={message.deleted ? styles.deletedMessage : undefined}
              key={message.messageSequence}
            >
              <div>
                <strong>{labels.get(message.userId)}</strong>
                <time dateTime={message.createdAt}>{formatKoreanDate(message.createdAt)}</time>
                {message.deleted ? <span>삭제됨</span> : null}
              </div>
              <p>{message.content ?? "본문이 Export에 포함되지 않았습니다."}</p>
            </li>
          ))}
        </ol>
        {analysis.messages.length === 0 ? <p>선택한 구간에 생성된 메시지가 없습니다.</p> : null}
      </section>
    </>
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
      <h2>{selected ? "대화 분석을 준비하고 있습니다" : "토론방을 먼저 선택하세요"}</h2>
      <p>
        {selected
          ? "전체 기간 기록의 무결성을 확인한 뒤 분석 결과를 자동으로 표시합니다."
          : "토론방을 선택하면 대화 분석이 시작됩니다."}
      </p>
    </section>
  );
}

function syncChatInsightsUrl(tab: ChatInsightsTab, roomId: string | null) {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", chatInsightsPath(tab, roomId));
}

function screenTitle(screenId: string): string {
  if (screenId === "A-CHAT-002") return "토론방 상세";
  if (screenId === "A-CHAT-008") return "채팅 통계";
  return "토론방 운영";
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

function authorLabels(messages: readonly ConversationMessage[]): ReadonlyMap<string, string> {
  const counts = new Map<string, number>();
  for (const message of messages) counts.set(message.userId, (counts.get(message.userId) ?? 0) + 1);
  return new Map(
    [...counts.entries()]
      .sort(([leftId, leftCount], [rightId, rightCount]) =>
        rightCount === leftCount ? leftId.localeCompare(rightId) : rightCount - leftCount,
      )
      .map(([userId], index) => [userId, `작성자 ${index + 1}`]),
  );
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

async function exportProblemMessage(response: Response): Promise<string> {
  if (response.status === 403) {
    return "대화 원본 접근 권한이 없습니다. 관리자 토큰의 chat:audit:exports scope를 확인해 주세요.";
  }
  if (response.status === 404) {
    return "토론방을 찾을 수 없거나 대화 기록 조회가 아직 준비되지 않았습니다.";
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
