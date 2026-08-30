"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
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
  type ConversationMessage,
} from "@/lib/chat/conversation-export";
import type { ScreenDefinition } from "@/lib/screens/registry";
import styles from "./admin-chat-insights.module.css";

type ViewMode = "rooms" | "detail" | "statistics" | "export";

const navigation: readonly Readonly<{ href: Route; label: string; mode: ViewMode }>[] = [
  { href: "/admin/chat" as Route, label: "채팅방", mode: "rooms" },
  { href: "/admin/chat/detail" as Route, label: "상세", mode: "detail" },
  { href: "/admin/chat/statistics" as Route, label: "통계", mode: "statistics" },
  { href: "/admin/chat/export" as Route, label: "Export", mode: "export" },
];

export function AdminChatInsightsScreen({ screen }: Readonly<{ screen: ScreenDefinition }>) {
  const mode = viewMode(screen.id);
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
          setRoomMessage("서버의 관리자 채팅방 목록 응답 형식을 확인해야 합니다.");
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
        setRoomMessage("네트워크 오류로 관리자 채팅방 목록을 불러오지 못했습니다.");
        return null;
      } finally {
        setRoomsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const range = defaultLocalRange();
      setFromLocal(range.from);
      setToLocal(range.to);
      void loadRooms();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      exportAbort.current?.abort();
    };
  }, [loadRooms]);

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

    setClosingRoom(true);
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

  async function requestAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoom || analyzing) return;
    const range = utcRange(fromLocal, toLocal);
    if (!range) {
      setAnalysisMessage("시작 시각은 종료 시각보다 앞서야 합니다.");
      return;
    }

    exportAbort.current?.abort();
    const controller = new AbortController();
    exportAbort.current = controller;
    setAnalyzing(true);
    setAnalysis(null);
    setArchive(null);
    setAnalysisMessage("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/rooms/${encodeURIComponent(selectedRoom.roomId)}/conversation-exports`,
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
      const parsed = await parseConversationExportArchive(bytes, {
        roomId: selectedRoom.roomId,
        range,
      });
      if (controller.signal.aborted) return;
      setAnalysis(parsed);
      setArchive(bytes);
      setArchiveName(exportFilename(response, parsed.manifest.roomName));
      setAnalysisMessage(
        parsed.warnings.length > 0
          ? "분석은 완료됐지만 Export 건수 일치 여부를 확인해야 합니다."
          : "Export 무결성을 확인하고 통계를 계산했습니다.",
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setAnalysisMessage(
        error instanceof ConversationExportError
          ? error.message
          : "Export 요청 또는 분석 중 오류가 발생했습니다. 다시 시도해 주세요.",
      );
    } finally {
      if (exportAbort.current === controller) {
        exportAbort.current = null;
        setAnalyzing(false);
      }
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
    <ScreenFrame screen={screen} title={screenTitle(mode)}>
      <div className={styles.page}>
        <nav aria-label="채팅 운영 메뉴" className={styles.tabs}>
          {navigation.map((item) => (
            <Link
              aria-current={item.mode === mode ? "page" : undefined}
              href={item.href}
              key={item.mode}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <section className={styles.intro}>
          <div>
            <span>ROOM OPERATIONS · EXPORT V1</span>
            <h2>운영 상태와 대화 맥락을 함께 확인합니다</h2>
          </div>
          <p>
            관리자는 참여 여부와 관계없이 활성 방을 즉시 종료할 수 있습니다. 대화 분석은 선택한 UTC
            구간을 <strong>시작 이상·종료 미만</strong>으로 조회합니다.
          </p>
        </section>

        <div className={styles.workspace}>
          <aside className={styles.roomPanel}>
            <header>
              <span>ACTIVE · CLOSED</span>
              <strong>운영할 채팅방</strong>
            </header>
            <form className={styles.search} onSubmit={searchRooms}>
              <label className={styles.queryField}>
                <span className="sr-only">채팅방 검색</span>
                <input
                  disabled={roomsLoading || closingRoom}
                  onChange={(event) => setRoomQuery(event.currentTarget.value)}
                  placeholder="채팅방 이름 검색"
                  type="search"
                  value={roomQuery}
                />
              </label>
              <label className={styles.statusField}>
                <span>상태</span>
                <select
                  aria-label="채팅방 상태"
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
              <button disabled={roomsLoading || closingRoom} type="submit">
                검색
              </button>
            </form>
            <div aria-label="채팅방 목록" className={styles.roomList} role="list">
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
                    <span>
                      {visibilityLabel(room.visibility)} · 활성 참여자{" "}
                      {room.activeMemberCount.toLocaleString("ko-KR")}명
                    </span>
                  </button>
                </div>
              ))}
              {rooms.length === 0 ? (
                <p>{roomsLoading ? "채팅방을 불러오는 중입니다." : "검색된 채팅방이 없습니다."}</p>
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

          <section aria-label="대화 Export 분석" className={styles.analysisPanel}>
            <AnalysisRequestForm
              analyzing={analyzing}
              closingRoom={closingRoom}
              fromLocal={fromLocal}
              onCloseRoom={() => {
                if (selectedRoom && selectedRoom.status !== "CLOSED") setRoomToClose(selectedRoom);
              }}
              onFromChange={setFromLocal}
              onSubmit={requestAnalysis}
              onToChange={setToLocal}
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
            {analysisMessage ? (
              <p aria-live="polite" className={styles.statusMessage} role="status">
                {analysisMessage}
              </p>
            ) : null}
            {analysis ? (
              <AnalysisResult
                analysis={analysis}
                archiveReady={archive !== null}
                mode={mode}
                onDownload={downloadArchive}
              />
            ) : (
              <EmptyAnalysis selected={selectedRoom !== null} />
            )}
          </section>
        </div>
      </div>
      <ConfirmDialog
        busy={closingRoom}
        busyLabel="종료 중…"
        cancelLabel="운영 유지"
        confirmLabel="채팅방 종료"
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

function AnalysisRequestForm({
  analyzing,
  closingRoom,
  fromLocal,
  onCloseRoom,
  onFromChange,
  onSubmit,
  onToChange,
  selectedRoom,
  toLocal,
}: Readonly<{
  analyzing: boolean;
  closingRoom: boolean;
  fromLocal: string;
  onCloseRoom: () => void;
  onFromChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToChange: (value: string) => void;
  selectedRoom: AdminRoom | null;
  toLocal: string;
}>) {
  return (
    <form className={styles.rangeForm} onSubmit={onSubmit}>
      <header>
        <div>
          <small>조회 대상</small>
          <strong>{selectedRoom?.name ?? "왼쪽에서 채팅방을 선택하세요"}</strong>
        </div>
        <span data-status={selectedRoom?.status ?? "NONE"}>
          {selectedRoom ? roomStatusLabel(selectedRoom.status) : "선택 필요"}
        </span>
      </header>
      {selectedRoom ? (
        <div className={styles.roomOperationBar}>
          <p>
            {selectedRoom.status === "ACTIVE"
              ? "종료하면 모든 ACTIVE 멤버가 퇴장되고 WebSocket 연결과 이후 활동이 즉시 차단됩니다."
              : "종료된 채팅방입니다. 대화 Export와 운영 기록은 계속 확인할 수 있습니다."}
          </p>
          {selectedRoom.status === "ACTIVE" ? (
            <button
              className={styles.closeRoomButton}
              disabled={closingRoom || analyzing}
              onClick={onCloseRoom}
              type="button"
            >
              {closingRoom ? "종료 상태 확인 중…" : "채팅방 종료"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={styles.rangeFields}>
        <label>
          <span>시작 시각</span>
          <input
            disabled={analyzing || closingRoom}
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
            disabled={analyzing || closingRoom}
            onChange={(event) => onToChange(event.currentTarget.value)}
            required
            type="datetime-local"
            value={toLocal}
          />
        </label>
        <button
          disabled={!selectedRoom || analyzing || closingRoom || !fromLocal || !toLocal}
          type="submit"
        >
          {analyzing ? "ZIP 확인·분석 중…" : "Export 요청·분석"}
        </button>
      </div>
      <p>입력 시각은 현재 기기 시간대로 받고 API에는 ISO 8601 UTC Instant로 전송합니다.</p>
    </form>
  );
}

function AnalysisResult({
  analysis,
  archiveReady,
  mode,
  onDownload,
}: Readonly<{
  analysis: ConversationExportAnalysis;
  archiveReady: boolean;
  mode: ViewMode;
  onDownload: () => void;
}>) {
  return (
    <div className={styles.result}>
      <SnapshotHeader analysis={analysis} />
      {analysis.warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {analysis.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {mode === "statistics" ? <Statistics metrics={analysis.metrics} /> : null}
      {mode === "export" ? (
        <ExportFiles analysis={analysis} archiveReady={archiveReady} onDownload={onDownload} />
      ) : null}
      {mode === "rooms" || mode === "detail" ? <ConversationDetail analysis={analysis} /> : null}
    </div>
  );
}

function SnapshotHeader({ analysis }: Readonly<{ analysis: ConversationExportAnalysis }>) {
  return (
    <section className={styles.snapshot}>
      <div>
        <span>무결성 확인 완료</span>
        <h2>{analysis.manifest.roomName}</h2>
        <p>{analysis.manifest.roomDescription || "채팅방 설명이 없습니다."}</p>
      </div>
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
    </section>
  );
}

function ConversationDetail({ analysis }: Readonly<{ analysis: ConversationExportAnalysis }>) {
  const labels = useMemo(() => authorLabels(analysis.messages), [analysis.messages]);
  return (
    <>
      <section aria-label="채팅방 핵심 수치" className={styles.kpis}>
        <Metric label="전체 메시지" value={`${analysis.metrics.totalMessages}건`} />
        <Metric label="잔존 메시지" value={`${analysis.metrics.retainedMessages}건`} />
        <Metric label="삭제 메시지" value={`${analysis.metrics.deletedMessages}건`} tone="danger" />
        <Metric label="작성자" value={`${analysis.metrics.authorCount}명`} />
      </section>
      <section className={styles.conversation}>
        <header>
          <div>
            <span>AS OF TO EXCLUSIVE</span>
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

function Statistics({ metrics }: Readonly<{ metrics: ConversationExportMetrics }>) {
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
      <section className={styles.eventStrip}>
        <strong>변경 이벤트</strong>
        <span>생성 {metrics.events.created}건</span>
        <span>수정 {metrics.events.updated}건</span>
        <span>삭제 {metrics.events.deleted}건</span>
      </section>
      <div className={styles.chartGrid}>
        <BarChart buckets={metrics.daily} title="일자별 메시지" />
        <BarChart buckets={metrics.hourly} title="시간대별 메시지" />
        <BarChart
          buckets={metrics.authors.map((author) => ({
            key: author.label,
            label: author.label,
            count: author.count,
          }))}
          title="사용자별 메시지"
        />
        <SentimentCard metrics={metrics} />
      </div>
      <div className={styles.analysisGrid}>
        <section>
          <header>
            <span>KEYWORDS</span>
            <h3>자주 등장한 표현</h3>
          </header>
          <div className={styles.keywordCloud}>
            {metrics.keywords.map((keyword) => (
              <span key={keyword.term}>
                {keyword.term} <b>{keyword.count}</b>
              </span>
            ))}
            {metrics.keywords.length === 0 ? <p>분석할 잔존 본문이 없습니다.</p> : null}
          </div>
        </section>
        <section>
          <header>
            <span>TOPICS</span>
            <h3>규칙 기반 주제 묶음</h3>
          </header>
          <ul className={styles.topicList}>
            {metrics.topics.map((topic) => (
              <li key={topic.label}>
                <span>{topic.label}</span>
                <strong>{topic.count}건</strong>
              </li>
            ))}
            {metrics.topics.length === 0 ? <li>분류된 주제가 없습니다.</li> : null}
          </ul>
        </section>
      </div>
      <p className={styles.analysisNote}>
        키워드·감성·주제는 삭제되지 않은 종료 시점 본문에 적용한 규칙 기반 참고치입니다. 정책
        판단이나 자동 제재 근거로 사용하지 마세요.
      </p>
    </>
  );
}

function ExportFiles({
  analysis,
  archiveReady,
  onDownload,
}: Readonly<{
  analysis: ConversationExportAnalysis;
  archiveReady: boolean;
  onDownload: () => void;
}>) {
  return (
    <section className={styles.exportCard}>
      <header>
        <div>
          <span>VERIFIED ARCHIVE</span>
          <h3>Export 파일</h3>
        </div>
        <button disabled={!archiveReady} onClick={onDownload} type="button">
          원본 ZIP 내려받기
        </button>
      </header>
      <ul>
        <li>
          <strong>manifest.json</strong>
          <span>계약·스냅샷·건수</span>
          <b>검증 기준</b>
        </li>
        {analysis.verifiedFiles.map((file) => (
          <li key={file.name}>
            <strong>{file.name}</strong>
            <span>{formatBytes(file.sizeBytes)}</span>
            <b>SHA-256 일치</b>
          </li>
        ))}
      </ul>
      <dl className={styles.exportMeta}>
        <div>
          <dt>계약</dt>
          <dd>
            {analysis.manifest.contract} v{analysis.manifest.schemaVersion}
          </dd>
        </div>
        <div>
          <dt>메시지 표현</dt>
          <dd>{analysis.manifest.messageRepresentation}</dd>
        </div>
        <div>
          <dt>변경 기준점</dt>
          <dd>{analysis.manifest.capturedChangeSequence.toLocaleString("ko-KR")}</dd>
        </div>
      </dl>
    </section>
  );
}

function SentimentCard({ metrics }: Readonly<{ metrics: ConversationExportMetrics }>) {
  const buckets: readonly ConversationMetricBucket[] = [
    { key: "positive", label: "긍정 표현 우세", count: metrics.sentiment.positive },
    { key: "neutral", label: "중립·혼합", count: metrics.sentiment.neutral },
    { key: "negative", label: "부정 표현 우세", count: metrics.sentiment.negative },
  ];
  return <BarChart buckets={buckets} title="감성 표현 참고치" />;
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
      <h2>{selected ? "분석 구간을 정해 Export를 요청하세요" : "채팅방을 먼저 선택하세요"}</h2>
      <p>
        {selected
          ? "ZIP 안의 manifest와 세 파일의 SHA-256을 확인한 뒤에만 결과를 표시합니다."
          : "관리자 전체 채팅방 목록에서 운영 또는 분석 대상을 고를 수 있습니다."}
      </p>
    </section>
  );
}

function viewMode(screenId: string): ViewMode {
  if (screenId === "A-CHAT-002") return "detail";
  if (screenId === "A-CHAT-008") return "statistics";
  if (screenId === "A-CHAT-009") return "export";
  return "rooms";
}

function screenTitle(mode: ViewMode): string {
  if (mode === "detail") return "채팅방 상세";
  if (mode === "statistics") return "채팅 통계";
  if (mode === "export") return "대화 Export";
  return "채팅방 운영";
}

function defaultLocalRange(): Readonly<{ from: string; to: string }> {
  const to = new Date();
  to.setSeconds(0, 0);
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
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

function visibilityLabel(visibility: AdminRoom["visibility"]): string {
  return visibility === "LISTED" ? "목록 공개" : "목록 비공개";
}

async function exportProblemMessage(response: Response): Promise<string> {
  if (response.status === 403) {
    return "대화 Export 권한이 없습니다. 관리자 토큰의 chat:audit:exports scope를 확인해 주세요.";
  }
  if (response.status === 404) {
    return "채팅방을 찾을 수 없거나 대화 Export API가 아직 준비되지 않았습니다.";
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

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
