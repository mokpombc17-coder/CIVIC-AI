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
import { formatAdminProblem, readAdminProblem } from "@/lib/admin/domain-contracts";
import { readListedRoomPage, type ListedRoom } from "@/lib/admin/room-category-contracts";
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
  const [rooms, setRooms] = useState<readonly ListedRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ListedRoom | null>(null);
  const [roomQuery, setRoomQuery] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomMessage, setRoomMessage] = useState("");
  const [fromLocal, setFromLocal] = useState("");
  const [toLocal, setToLocal] = useState("");
  const [analysis, setAnalysis] = useState<ConversationExportAnalysis | null>(null);
  const [archive, setArchive] = useState<Uint8Array | null>(null);
  const [archiveName, setArchiveName] = useState("conversation-export.zip");
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const exportAbort = useRef<AbortController | null>(null);

  const loadRooms = useCallback(async (query = "", cursor: string | null = null) => {
    setRoomsLoading(true);
    setRoomMessage("");
    const parameters = new URLSearchParams({ limit: "50" });
    if (query.trim()) parameters.set("query", query.trim());
    if (cursor) parameters.set("cursor", cursor);
    try {
      const response = await authenticatedFetch(`/api/v1/rooms?${parameters.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (!cursor) setRooms([]);
        setRoomMessage(formatAdminProblem(await readAdminProblem(response)));
        return;
      }
      const page = readListedRoomPage(await response.json());
      if (!page) {
        if (!cursor) setRooms([]);
        setRoomMessage("서버의 채팅방 목록 응답 형식을 확인해야 합니다.");
        return;
      }
      setRooms((current) => (cursor ? mergeRooms(current, page.items) : page.items));
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
    } catch {
      if (!cursor) setRooms([]);
      setRoomMessage("네트워크 오류로 채팅방 목록을 불러오지 못했습니다.");
    } finally {
      setRoomsLoading(false);
    }
  }, []);

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
    void loadRooms(roomQuery);
  }

  function selectRoom(room: ListedRoom) {
    exportAbort.current?.abort();
    setSelectedRoom(room);
    setAnalysis(null);
    setArchive(null);
    setAnalysisMessage("");
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
        <nav aria-label="채팅 분석 메뉴" className={styles.tabs}>
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
            <span>CONVERSATION EXPORT · V1</span>
            <h2>대화를 숫자와 맥락으로 함께 확인합니다</h2>
          </div>
          <p>
            선택한 UTC 구간은 <strong>시작 이상·종료 미만</strong>으로 조회합니다. 계산값은 Export의
            종료 시점 메시지 상태와 기간 내 변경 이력을 사용합니다.
          </p>
        </section>

        <div className={styles.workspace}>
          <aside className={styles.roomPanel}>
            <header>
              <span>ACTIVE · LISTED</span>
              <strong>분석할 채팅방</strong>
            </header>
            <form className={styles.search} onSubmit={searchRooms}>
              <label>
                <span className="sr-only">채팅방 검색</span>
                <input
                  onChange={(event) => setRoomQuery(event.currentTarget.value)}
                  placeholder="채팅방 이름 검색"
                  type="search"
                  value={roomQuery}
                />
              </label>
              <button disabled={roomsLoading} type="submit">
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
                    <strong>{room.name}</strong>
                    <span>활성 참여자 {room.activeMemberCount.toLocaleString("ko-KR")}명</span>
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
                disabled={roomsLoading}
                onClick={() => void loadRooms(roomQuery, nextCursor)}
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
              fromLocal={fromLocal}
              onFromChange={setFromLocal}
              onSubmit={requestAnalysis}
              onToChange={setToLocal}
              selectedRoom={selectedRoom}
              toLocal={toLocal}
            />
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
    </ScreenFrame>
  );
}

function AnalysisRequestForm({
  analyzing,
  fromLocal,
  onFromChange,
  onSubmit,
  onToChange,
  selectedRoom,
  toLocal,
}: Readonly<{
  analyzing: boolean;
  fromLocal: string;
  onFromChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToChange: (value: string) => void;
  selectedRoom: ListedRoom | null;
  toLocal: string;
}>) {
  return (
    <form className={styles.rangeForm} onSubmit={onSubmit}>
      <header>
        <div>
          <small>조회 대상</small>
          <strong>{selectedRoom?.name ?? "왼쪽에서 채팅방을 선택하세요"}</strong>
        </div>
        <span>{selectedRoom ? "선택됨" : "선택 필요"}</span>
      </header>
      <div className={styles.rangeFields}>
        <label>
          <span>시작 시각</span>
          <input
            disabled={analyzing}
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
            disabled={analyzing}
            onChange={(event) => onToChange(event.currentTarget.value)}
            required
            type="datetime-local"
            value={toLocal}
          />
        </label>
        <button disabled={!selectedRoom || analyzing || !fromLocal || !toLocal} type="submit">
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
          : "현재 공개 목록에 있는 활성 채팅방에서 분석 대상을 고를 수 있습니다."}
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
  return "채팅방 분석";
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

function mergeRooms(current: readonly ListedRoom[], next: readonly ListedRoom[]) {
  return [...new Map([...current, ...next].map((room) => [room.roomId, room])).values()];
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
