// Per-user activity extracted purely from EXISTING admin list APIs.
// The chat/vote/rag backends stay untouched: everything here is derived on
// the client from responses those services already expose.
//
// - Room creation requests: /api/v1/admin/room-creation-requests filtered by
//   requesterUserId (cheap, loaded eagerly).
// - Chat participation: on-demand scan — admin room list + conversation
//   export archives for the most recent month, counting messages authored by
//   the user.
// - Vote participation: on-demand scan — admin task list + result-view JSONL,
//   matching respondent identifier fields defensively.

import {
  readRoomCreationRequestPage,
  readTaskSummaries,
  type RoomCreationRequest,
  type TaskSummary,
} from "@/lib/admin/domain-contracts";
import { readAdminRoomPage, type AdminRoom } from "@/lib/admin/admin-room-contracts";
import {
  parseConversationExportArchive,
  readConversationExportResponse,
} from "@/lib/chat/conversation-export";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type UserRoomRequestsState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; items: readonly RoomCreationRequest[] }>
  | Readonly<{ status: "forbidden" }>
  | Readonly<{ status: "unavailable" }>;

export type UserChatParticipation = Readonly<{
  roomId: string;
  roomName: string;
  roomStatus: string;
  messageCount: number;
  lastMessageAt: string | null;
}>;

export type UserChatScanResult = Readonly<{
  participations: readonly UserChatParticipation[];
  scannedRooms: number;
  totalRooms: number;
  /** More rooms exist beyond the first page, so totalRooms is a lower bound. */
  moreRooms: boolean;
  failedRooms: number;
  truncated: boolean;
}>;

export type UserVoteParticipation = Readonly<{
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  closedAt: string | null;
  submittedAt: string | null;
  answerLabel: string | null;
}>;

export type UserVoteScanResult = Readonly<{
  participations: readonly UserVoteParticipation[];
  scannedTasks: number;
  totalClosedTasks: number;
  failedTasks: number;
  identifiersMissing: boolean;
  truncated: boolean;
}>;

export type AdminUserRagUsage = Readonly<{
  totalQueries: number;
  lastQueryAt: string | null;
  recentQuestions: ReadonlyArray<Readonly<{ question: string; askedAt: string | null }>>;
}>;

export type UserRagUsageState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; usage: AdminUserRagUsage }>
  | Readonly<{ status: "forbidden" }>
  | Readonly<{ status: "unavailable" }>;

export async function loadUserRagUsage(
  userId: string,
  request: typeof fetch = authenticatedFetch,
): Promise<UserRagUsageState> {
  try {
    const response = await request(
      `/api/v1/rag/admin/user-query-stats/${encodeURIComponent(userId)}`,
      { cache: "no-store" },
    );
    if (response.status === 401 || response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "unavailable" };
    const usage = readUserRagUsage(await response.json());
    return usage ? { status: "ready", usage } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function readUserRagUsage(value: unknown): AdminUserRagUsage | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const total = record.total_queries;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) return null;
  const lastQueryAt = typeof record.last_query_at === "string" ? record.last_query_at : null;
  const rawRecent = Array.isArray(record.recent_questions) ? record.recent_questions : [];
  const recentQuestions: Array<Readonly<{ question: string; askedAt: string | null }>> = [];
  for (const raw of rawRecent) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.question !== "string" || item.question.length === 0) continue;
    recentQuestions.push({
      question: item.question,
      askedAt: typeof item.asked_at === "string" ? item.asked_at : null,
    });
  }
  return { totalQueries: total, lastQueryAt, recentQuestions };
}

export type ActivityScanState<T> =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "running"; done: number; total: number }>
  | Readonly<{ status: "ready"; result: T }>
  | Readonly<{ status: "failed"; message: string }>;

const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export const CHAT_SCAN_ROOM_LIMIT = 12;
export const VOTE_SCAN_TASK_LIMIT = 20;
const CHAT_SCAN_FALLBACK_CLOCK_SKEW_MS = 60_000;
const CHAT_SCAN_RECENT_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// The admin endpoint has no requester filter, so follow every page of a status
// instead of filtering only the first page (which hid older or newer requests).
const ROOM_REQUEST_PAGE_LIMIT = 100;
const ROOM_REQUEST_MAX_PAGES = 50;

async function loadAllRoomCreationRequests(
  status: (typeof REQUEST_STATUSES)[number],
  request: typeof fetch,
): Promise<{ items: RoomCreationRequest[] } | "forbidden" | null> {
  const items: RoomCreationRequest[] = [];
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < ROOM_REQUEST_MAX_PAGES; pageIndex += 1) {
    const query = new URLSearchParams({ status, limit: String(ROOM_REQUEST_PAGE_LIMIT) });
    if (cursor) query.set("cursor", cursor);
    const response = await request(`/api/v1/admin/room-creation-requests?${query.toString()}`, {
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) return "forbidden";
    if (!response.ok) return null;
    const page = readRoomCreationRequestPage(await response.json());
    if (!page) return null;
    items.push(...page.items);
    if (!page.hasNext || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return { items };
}

export async function loadUserRoomRequests(
  userId: string,
  request: typeof fetch = authenticatedFetch,
): Promise<UserRoomRequestsState> {
  try {
    const pages = await Promise.all(
      REQUEST_STATUSES.map((status) => loadAllRoomCreationRequests(status, request)),
    );
    if (pages.some((page) => page === "forbidden")) return { status: "forbidden" };
    const readable = pages.filter(
      (page): page is Exclude<typeof page, null | "forbidden"> => page !== null,
    );
    if (readable.length === 0) return { status: "unavailable" };
    const items = readable
      .flatMap((page) => page.items)
      .filter((item) => item.requesterUserId === userId)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
    return { status: "ready", items };
  } catch {
    return { status: "unavailable" };
  }
}

export async function scanUserChatParticipation(
  userId: string,
  onProgress?: (done: number, total: number) => void,
  request: typeof fetch = authenticatedFetch,
): Promise<UserChatScanResult> {
  const roomsResponse = await request("/api/v1/admin/rooms?limit=50", { cache: "no-store" });
  if (!roomsResponse.ok) throw new Error("토론방 목록을 불러오지 못했습니다.");
  const page = readAdminRoomPage(await roomsResponse.json());
  if (!page) throw new Error("토론방 목록 응답 형식을 확인하지 못했습니다.");

  const rooms = page.items.slice(0, CHAT_SCAN_ROOM_LIMIT);
  const cutoff = chatScanCutoff(roomsResponse.headers.get("date"));
  const participations: UserChatParticipation[] = [];
  let failedRooms = 0;
  let done = 0;
  for (const room of rooms) {
    const range = exportRangeForScan(room.createdAt, cutoff);
    const stats = range
      ? await countUserMessages(room, userId, range, request)
      : { count: 0, lastMessageAt: null };
    if (stats === null) failedRooms += 1;
    else if (stats.count > 0) {
      participations.push({
        roomId: room.roomId,
        roomName: room.name,
        roomStatus: room.status,
        messageCount: stats.count,
        lastMessageAt: stats.lastMessageAt,
      });
    }
    done += 1;
    onProgress?.(done, rooms.length);
  }
  return {
    participations,
    scannedRooms: rooms.length,
    totalRooms: page.items.length,
    moreRooms: page.hasNext,
    failedRooms,
    truncated: page.items.length > rooms.length || page.hasNext,
  };
}

async function countUserMessages(
  room: AdminRoom,
  userId: string,
  range: Readonly<{ fromInclusive: string; toExclusive: string }>,
  request: typeof fetch,
): Promise<Readonly<{ count: number; lastMessageAt: string | null }> | null> {
  try {
    const response = await request(
      `/api/v1/admin/rooms/${encodeURIComponent(room.roomId)}/conversation-exports`,
      {
        method: "POST",
        headers: { accept: "application/zip", "content-type": "application/json" },
        body: JSON.stringify(range),
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/zip")) return null;
    const bytes = await readConversationExportResponse(response);
    const parsed = await parseConversationExportArchive(bytes, { roomId: room.roomId, range });
    const mine = parsed.messages.filter((message) => message.userId === userId);
    const lastMessageAt = mine.reduce<string | null>(
      (latest, message) =>
        latest === null || message.createdAt > latest ? message.createdAt : latest,
      null,
    );
    return { count: mine.length, lastMessageAt };
  } catch {
    return null;
  }
}

// Chat export rejects ranges longer than its configured limit (31 days by
// default), so the scan covers the most recent month, or the room's whole life
// when it opened within that month.
export function exportRangeForScan(
  roomCreatedAt: string,
  now = new Date(),
): Readonly<{ fromInclusive: string; toExclusive: string }> | null {
  if (!Number.isFinite(now.getTime())) return null;
  const recent = new Date(now.getTime() - CHAT_SCAN_RECENT_MONTH_MS);
  const created = new Date(roomCreatedAt);
  const from = Number.isFinite(created.getTime()) && created > recent ? created : recent;
  if (from >= now) return null;
  return { fromInclusive: from.toISOString(), toExclusive: now.toISOString() };
}

export function chatScanCutoff(responseDate: string | null, fallbackNow = new Date()): Date {
  if (responseDate) {
    const serverDate = new Date(responseDate);
    if (Number.isFinite(serverDate.getTime())) return serverDate;
  }
  return new Date(fallbackNow.getTime() - CHAT_SCAN_FALLBACK_CLOCK_SKEW_MS);
}

export async function scanUserVoteParticipation(
  userId: string,
  onProgress?: (done: number, total: number) => void,
  request: typeof fetch = authenticatedFetch,
): Promise<UserVoteScanResult> {
  const tasksResponse = await request("/api/v1/admin/tasks", { cache: "no-store" });
  if (!tasksResponse.ok) throw new Error("투표 목록을 불러오지 못했습니다.");
  const tasks = readTaskSummaries(await tasksResponse.json());
  if (!tasks) throw new Error("투표 목록 응답 형식을 확인하지 못했습니다.");

  const closed = tasks.filter((task) => task.status === "CLOSED");
  const scannable = closed.slice(0, VOTE_SCAN_TASK_LIMIT);
  const participations: UserVoteParticipation[] = [];
  let failedTasks = 0;
  let sawAnyIdentifier = false;
  let sawAnyLine = false;
  let done = 0;
  for (const task of scannable) {
    const match = await findUserVoteInResultView(task, userId, request);
    if (match === null) failedTasks += 1;
    else {
      if (match.sawLines) sawAnyLine = true;
      if (match.sawIdentifiers) sawAnyIdentifier = true;
      if (match.participation) participations.push(match.participation);
    }
    done += 1;
    onProgress?.(done, scannable.length);
  }
  return {
    participations,
    scannedTasks: scannable.length,
    totalClosedTasks: closed.length,
    failedTasks,
    identifiersMissing: sawAnyLine && !sawAnyIdentifier,
    truncated: closed.length > scannable.length,
  };
}

async function findUserVoteInResultView(
  task: TaskSummary,
  userId: string,
  request: typeof fetch,
): Promise<Readonly<{
  participation: UserVoteParticipation | null;
  sawIdentifiers: boolean;
  sawLines: boolean;
}> | null> {
  try {
    const response = await request(
      `/api/v1/admin/tasks/${encodeURIComponent(task.taskId)}/result-view`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const lines = (await response.text())
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    let sawIdentifiers = false;
    for (const line of lines) {
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      const identifier = readRespondentId(record);
      if (identifier) sawIdentifiers = true;
      if (identifier === userId) {
        return {
          participation: {
            taskId: task.taskId,
            taskTitle: task.title,
            taskStatus: task.status,
            closedAt: task.closedAt,
            submittedAt: readSubmittedAt(record),
            answerLabel: readAnswerLabel(record),
          },
          sawIdentifiers: true,
          sawLines: true,
        };
      }
    }
    return { participation: null, sawIdentifiers, sawLines: lines.length > 0 };
  } catch {
    return null;
  }
}

const RESPONDENT_ID_KEYS = [
  "user_id",
  "userId",
  "participant_id",
  "participantId",
  "respondent_id",
  "respondentId",
  "subject_id",
  "subjectId",
] as const;

const SUBMITTED_AT_KEYS = [
  "submitted_at",
  "submittedAt",
  "created_at",
  "createdAt",
  "occurred_at",
  "occurredAt",
] as const;

export function readRespondentId(record: unknown): string | null {
  if (typeof record !== "object" || record === null) return null;
  const value = record as Record<string, unknown>;
  for (const key of RESPONDENT_ID_KEYS) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

const ANSWER_KEYS = [
  "option_content",
  "optionContent",
  "selected_option_content",
  "selectedOptionContent",
  "answer",
  "answer_content",
  "choice",
] as const;

export function readAnswerLabel(record: unknown): string | null {
  if (typeof record !== "object" || record === null) return null;
  const value = record as Record<string, unknown>;
  for (const key of ANSWER_KEYS) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

export function readSubmittedAt(record: unknown): string | null {
  if (typeof record !== "object" || record === null) return null;
  const value = record as Record<string, unknown>;
  for (const key of SUBMITTED_AT_KEYS) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}
