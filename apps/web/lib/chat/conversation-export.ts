export type ConversationExportRange = Readonly<{
  fromInclusive: string;
  toExclusive: string;
}>;

export type ConversationExportManifest = Readonly<{
  contract: "admin-room-conversation-export";
  schemaVersion: 1;
  exportId: string;
  roomId: string;
  roomName: string;
  roomDescription: string;
  range: ConversationExportRange;
  capturedChangeSequence: number;
  capturedAt: string;
  generatedAt: string;
  identityMode: string;
  messageRepresentation: string;
  deletedContentIncluded: boolean;
  changeHistoryIncluded: boolean;
  jsonTimezone: string;
  htmlTimezone: string;
  counts: Readonly<{
    messages: number;
    changes: number;
    created: number;
    updated: number;
    deleted: number;
  }>;
  files: readonly ConversationExportFile[];
}>;

export type ConversationExportFile = Readonly<{
  name: string;
  sizeBytes: number;
  sha256: string;
}>;

export type ConversationMessage = Readonly<{
  messageSequence: number;
  userId: string;
  content: string | null;
  createdAt: string;
  deleted: boolean;
}>;

export type ConversationChange = Readonly<{
  changeSequence: number;
  messageSequence: number;
  userId: string;
  changeType: "CREATED" | "UPDATED" | "DELETED";
  content: string | null;
  changedAt: string;
}>;

export type ConversationMetricBucket = Readonly<{
  key: string;
  label: string;
  count: number;
}>;

export type ConversationExportMetrics = Readonly<{
  totalMessages: number;
  retainedMessages: number;
  deletedMessages: number;
  authorCount: number;
  editedMessages: number;
  editRate: number;
  deletionRate: number;
  events: Readonly<{ created: number; updated: number; deleted: number }>;
  authors: readonly Readonly<{ label: string; count: number }>[];
  hourly: readonly ConversationMetricBucket[];
  daily: readonly ConversationMetricBucket[];
  keywords: readonly Readonly<{ term: string; count: number }>[];
  sentiment: Readonly<{ positive: number; neutral: number; negative: number }>;
  topics: readonly Readonly<{ label: string; count: number }>[];
}>;

export type ConversationExportAnalysis = Readonly<{
  manifest: ConversationExportManifest;
  messages: readonly ConversationMessage[];
  changes: readonly ConversationChange[];
  transcriptHtml: string;
  metrics: ConversationExportMetrics;
  verifiedFiles: readonly Readonly<{
    name: string;
    sizeBytes: number;
    sha256: string;
    verified: true;
  }>[];
  warnings: readonly string[];
}>;

export type ConversationExportExpectation = Readonly<{
  roomId: string;
  range: ConversationExportRange;
}>;

const requiredEntries = [
  "manifest.json",
  "messages.jsonl",
  "message_changes.jsonl",
  "transcript.html",
] as const;
const integrityEntries = ["messages.jsonl", "message_changes.jsonl", "transcript.html"] as const;
export const MAX_CONVERSATION_EXPORT_ARCHIVE_BYTES = 128 * 1024 * 1024;
const maxUncompressedBytes = 256 * 1024 * 1024;
const maxEntryBytes: Readonly<Record<(typeof requiredEntries)[number], number>> = {
  "manifest.json": 1024 * 1024,
  "messages.jsonl": 96 * 1024 * 1024,
  "message_changes.jsonl": 128 * 1024 * 1024,
  "transcript.html": 64 * 1024 * 1024,
};

const keywordStopWords = new Set([
  "그리고",
  "그러나",
  "그래서",
  "대한",
  "위한",
  "있는",
  "없는",
  "합니다",
  "했습니다",
  "해야",
  "합니다",
  "필요합니다",
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
]);

const positiveExpressions = ["찬성", "동의", "만족", "개선", "좋", "안전", "효율", "기대", "해결"];
const negativeExpressions = [
  "반대",
  "불만",
  "문제",
  "위험",
  "우려",
  "불편",
  "실패",
  "부족",
  "갈등",
  "나쁘",
];
const topicExpressions = [
  { label: "정책·제도", terms: ["정책", "제도", "규정", "기준", "예외"] },
  { label: "운영·평가", terms: ["운영", "평가", "기간", "시범", "만족도"] },
  { label: "참여·소통", terms: ["참여", "의견", "토론", "소통", "작성"] },
  { label: "조직·업무", terms: ["부서", "조직", "업무", "직원", "근무"] },
  { label: "복지·돌봄", terms: ["복지", "돌봄", "가족", "지원", "대상자"] },
  { label: "기술·데이터", terms: ["기술", "데이터", "시스템", "AI", "인공지능"] },
] as const;

export class ConversationExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationExportError";
  }
}

export async function parseConversationExportArchive(
  input: ArrayBuffer | Uint8Array,
  expected?: ConversationExportExpectation,
): Promise<ConversationExportAnalysis> {
  const archive = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (archive.byteLength > MAX_CONVERSATION_EXPORT_ARCHIVE_BYTES) {
    throw new ConversationExportError("Export ZIP이 웹 분석 허용 크기를 초과했습니다.");
  }
  const entries = await unzipArchive(archive);
  for (const name of requiredEntries) {
    if (!entries[name]) throw new ConversationExportError(`${name} 파일이 ZIP에 없습니다.`);
  }

  const manifest = readManifest(parseJson(decode(entries["manifest.json"]), "manifest.json"));
  assertExpectation(manifest, expected);
  assertAnalysisContract(manifest);
  const messages = parseJsonLines(entries["messages.jsonl"], "messages.jsonl", readMessage);
  const changes = parseJsonLines(
    entries["message_changes.jsonl"],
    "message_changes.jsonl",
    readChange,
  );
  assertUniqueSequences(messages, changes);
  assertRangeContents(manifest, messages, changes);

  const verifiedFiles = await verifyManifestFiles(entries, manifest.files);
  assertManifestCounts(manifest, messages, changes);
  const transcriptHtml = decode(entries["transcript.html"]);

  return {
    manifest,
    messages,
    changes,
    transcriptHtml,
    metrics: calculateConversationMetrics(messages, changes),
    verifiedFiles,
    warnings: [],
  };
}

export async function readConversationExportResponse(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CONVERSATION_EXPORT_ARCHIVE_BYTES) {
    throw new ConversationExportError(
      "Export ZIP이 웹 분석 허용 크기를 초과했습니다. 조회 기간을 줄여 주세요.",
    );
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_CONVERSATION_EXPORT_ARCHIVE_BYTES) {
      throw new ConversationExportError(
        "Export ZIP이 웹 분석 허용 크기를 초과했습니다. 조회 기간을 줄여 주세요.",
      );
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CONVERSATION_EXPORT_ARCHIVE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ConversationExportError(
          "Export ZIP이 웹 분석 허용 크기를 초과했습니다. 조회 기간을 줄여 주세요.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function calculateConversationMetrics(
  messages: readonly ConversationMessage[],
  changes: readonly ConversationChange[],
): ConversationExportMetrics {
  const authorCounts = new Map<string, number>();
  const hourly = new Map<string, number>();
  const daily = new Map<string, number>();
  const exportedMessageSequences = new Set(messages.map((message) => message.messageSequence));
  const editedSequences = new Set<number>();
  const events = { created: 0, updated: 0, deleted: 0 };

  for (const message of messages) {
    authorCounts.set(message.userId, (authorCounts.get(message.userId) ?? 0) + 1);
    const timestamp = new Date(message.createdAt);
    const hourKey = `${timestamp.toISOString().slice(0, 13)}:00Z`;
    const dayKey = timestamp.toISOString().slice(0, 10);
    hourly.set(hourKey, (hourly.get(hourKey) ?? 0) + 1);
    daily.set(dayKey, (daily.get(dayKey) ?? 0) + 1);
  }

  for (const change of changes) {
    if (change.changeType === "CREATED") events.created += 1;
    if (change.changeType === "UPDATED") {
      events.updated += 1;
      if (exportedMessageSequences.has(change.messageSequence)) {
        editedSequences.add(change.messageSequence);
      }
    }
    if (change.changeType === "DELETED") events.deleted += 1;
  }

  const retained = messages.filter((message) => !message.deleted);
  const retainedContent = retained.flatMap((message) => (message.content ? [message.content] : []));
  const totalMessages = messages.length;
  const deletedMessages = totalMessages - retained.length;

  return {
    totalMessages,
    retainedMessages: retained.length,
    deletedMessages,
    authorCount: authorCounts.size,
    editedMessages: editedSequences.size,
    editRate: rate(editedSequences.size, totalMessages),
    deletionRate: rate(deletedMessages, totalMessages),
    events,
    authors: [...authorCounts.entries()]
      .sort(([leftId, leftCount], [rightId, rightCount]) =>
        rightCount === leftCount ? leftId.localeCompare(rightId) : rightCount - leftCount,
      )
      .map(([, count], index) => ({ label: `작성자 ${index + 1}`, count })),
    hourly: metricBuckets(hourly, (key) => `${key.slice(5, 10)} ${key.slice(11, 16)} UTC`),
    daily: metricBuckets(daily, (key) => key),
    keywords: keywords(retainedContent),
    sentiment: sentiment(retainedContent),
    topics: topics(retainedContent),
  };
}

function metricBuckets(
  values: ReadonlyMap<string, number>,
  label: (key: string) => string,
): readonly ConversationMetricBucket[] {
  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => ({ key, label: label(key), count }));
}

function keywords(
  contents: readonly string[],
): readonly Readonly<{ term: string; count: number }>[] {
  const counts = new Map<string, number>();
  for (const content of contents) {
    for (const match of content.toLocaleLowerCase("ko-KR").matchAll(/[\p{L}\p{N}]{2,}/gu)) {
      const term = match[0];
      if (keywordStopWords.has(term)) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([leftTerm, leftCount], [rightTerm, rightCount]) =>
      rightCount === leftCount
        ? leftTerm.localeCompare(rightTerm, "ko-KR")
        : rightCount - leftCount,
    )
    .slice(0, 12)
    .map(([term, count]) => ({ term, count }));
}

function sentiment(
  contents: readonly string[],
): Readonly<{ positive: number; neutral: number; negative: number }> {
  const result = { positive: 0, neutral: 0, negative: 0 };
  for (const content of contents) {
    const positive = expressionScore(content, positiveExpressions);
    const negative = expressionScore(content, negativeExpressions);
    if (positive > negative) result.positive += 1;
    else if (negative > positive) result.negative += 1;
    else result.neutral += 1;
  }
  return result;
}

function topics(
  contents: readonly string[],
): readonly Readonly<{ label: string; count: number }>[] {
  return topicExpressions
    .map((topic) => ({
      label: topic.label,
      count: contents.filter((content) => expressionScore(content, topic.terms) > 0).length,
    }))
    .filter((topic) => topic.count > 0)
    .sort(
      (left, right) => right.count - left.count || left.label.localeCompare(right.label, "ko-KR"),
    );
}

function expressionScore(content: string, expressions: readonly string[]): number {
  return expressions.reduce((score, expression) => score + Number(content.includes(expression)), 0);
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

async function unzipArchive(archive: Uint8Array): Promise<Record<string, Uint8Array>> {
  const { unzip } = await import("fflate");
  return new Promise((resolve, reject) => {
    const seen = new Set<string>();
    let uncompressedBytes = 0;
    try {
      unzip(
        archive,
        {
          filter(file) {
            if (!requiredEntries.includes(file.name as (typeof requiredEntries)[number])) {
              throw new ConversationExportError(`허용되지 않은 ZIP 항목입니다: ${file.name}`);
            }
            const name = file.name as (typeof requiredEntries)[number];
            if (seen.has(name)) {
              throw new ConversationExportError(`ZIP에 중복된 파일이 있습니다: ${name}`);
            }
            seen.add(name);
            if (
              !Number.isSafeInteger(file.originalSize) ||
              file.originalSize < 0 ||
              file.originalSize > maxEntryBytes[name]
            ) {
              throw new ConversationExportError(`${name} 파일이 웹 분석 허용 크기를 초과했습니다.`);
            }
            uncompressedBytes += file.originalSize;
            if (uncompressedBytes > maxUncompressedBytes) {
              throw new ConversationExportError(
                "Export 압축 해제 크기가 웹 분석 한도를 초과했습니다.",
              );
            }
            return true;
          },
        },
        (error, files) => {
          if (error) {
            reject(new ConversationExportError("대화 Export ZIP을 열 수 없습니다."));
            return;
          }
          resolve(files);
        },
      );
    } catch (error) {
      reject(
        error instanceof ConversationExportError
          ? error
          : new ConversationExportError("대화 Export ZIP을 열 수 없습니다."),
      );
    }
  });
}

function decode(value: Uint8Array | undefined): string {
  if (!value) throw new ConversationExportError("ZIP 파일 구성이 올바르지 않습니다.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new ConversationExportError("Export 파일이 올바른 UTF-8 텍스트가 아닙니다.");
  }
}

function parseJson(value: string, filename: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new ConversationExportError(`${filename} JSON 형식이 올바르지 않습니다.`);
  }
}

function parseJsonLines<T>(
  value: Uint8Array | undefined,
  filename: string,
  reader: (value: unknown) => T | null,
): readonly T[] {
  const lines = decode(value)
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    const item = reader(parseJson(line, `${filename} ${index + 1}행`));
    if (!item)
      throw new ConversationExportError(`${filename} ${index + 1}행 계약이 올바르지 않습니다.`);
    return item;
  });
}

function readManifest(value: unknown): ConversationExportManifest {
  const record = object(value);
  const range = object(record?.range);
  const counts = object(record?.counts);
  if (
    !record ||
    record.contract !== "admin-room-conversation-export" ||
    record.schemaVersion !== 1 ||
    !nonEmpty(record.exportId) ||
    !nonEmpty(record.roomId) ||
    !nonEmpty(record.roomName) ||
    typeof record.roomDescription !== "string" ||
    !range ||
    !instant(range.fromInclusive) ||
    !instant(range.toExclusive) ||
    Date.parse(range.fromInclusive) >= Date.parse(range.toExclusive) ||
    !nonNegativeInteger(record.capturedChangeSequence) ||
    !instant(record.capturedAt) ||
    !instant(record.generatedAt) ||
    !nonEmpty(record.identityMode) ||
    !nonEmpty(record.messageRepresentation) ||
    typeof record.deletedContentIncluded !== "boolean" ||
    typeof record.changeHistoryIncluded !== "boolean" ||
    !nonEmpty(record.jsonTimezone) ||
    !nonEmpty(record.htmlTimezone) ||
    !counts ||
    !nonNegativeInteger(counts.messages) ||
    !nonNegativeInteger(counts.changes) ||
    !nonNegativeInteger(counts.created) ||
    !nonNegativeInteger(counts.updated) ||
    !nonNegativeInteger(counts.deleted) ||
    !Array.isArray(record.files)
  ) {
    throw new ConversationExportError("manifest.json 계약이 올바르지 않습니다.");
  }
  const files = record.files.map(readFile);
  if (!files.every(Boolean)) {
    throw new ConversationExportError("manifest.json 파일 무결성 정보가 올바르지 않습니다.");
  }
  return {
    contract: "admin-room-conversation-export",
    schemaVersion: 1,
    exportId: record.exportId,
    roomId: record.roomId,
    roomName: record.roomName,
    roomDescription: record.roomDescription,
    range: { fromInclusive: range.fromInclusive, toExclusive: range.toExclusive },
    capturedChangeSequence: record.capturedChangeSequence,
    capturedAt: record.capturedAt,
    generatedAt: record.generatedAt,
    identityMode: record.identityMode,
    messageRepresentation: record.messageRepresentation,
    deletedContentIncluded: record.deletedContentIncluded,
    changeHistoryIncluded: record.changeHistoryIncluded,
    jsonTimezone: record.jsonTimezone,
    htmlTimezone: record.htmlTimezone,
    counts: {
      messages: counts.messages,
      changes: counts.changes,
      created: counts.created,
      updated: counts.updated,
      deleted: counts.deleted,
    },
    files: files as ConversationExportFile[],
  };
}

function readFile(value: unknown): ConversationExportFile | null {
  const record = object(value);
  return record &&
    nonEmpty(record.name) &&
    nonNegativeInteger(record.sizeBytes) &&
    typeof record.sha256 === "string" &&
    /^[0-9a-f]{64}$/u.test(record.sha256)
    ? { name: record.name, sizeBytes: record.sizeBytes, sha256: record.sha256 }
    : null;
}

function readMessage(value: unknown): ConversationMessage | null {
  const record = object(value);
  if (
    !record ||
    !positiveInteger(record.messageSequence) ||
    !nonEmpty(record.userId) ||
    !(typeof record.content === "string" || record.content === null) ||
    !instant(record.createdAt) ||
    typeof record.deleted !== "boolean"
  ) {
    return null;
  }
  return {
    messageSequence: record.messageSequence,
    userId: record.userId,
    content: record.content,
    createdAt: record.createdAt,
    deleted: record.deleted,
  };
}

function readChange(value: unknown): ConversationChange | null {
  const record = object(value);
  if (
    !record ||
    !positiveInteger(record.changeSequence) ||
    !positiveInteger(record.messageSequence) ||
    !nonEmpty(record.userId) ||
    !["CREATED", "UPDATED", "DELETED"].includes(String(record.changeType)) ||
    !(typeof record.content === "string" || record.content === null) ||
    !instant(record.changedAt)
  ) {
    return null;
  }
  return {
    changeSequence: record.changeSequence,
    messageSequence: record.messageSequence,
    userId: record.userId,
    changeType: record.changeType as ConversationChange["changeType"],
    content: record.content,
    changedAt: record.changedAt,
  };
}

function assertUniqueSequences(
  messages: readonly ConversationMessage[],
  changes: readonly ConversationChange[],
) {
  if (new Set(messages.map((message) => message.messageSequence)).size !== messages.length) {
    throw new ConversationExportError("messages.jsonl에 중복된 messageSequence가 있습니다.");
  }
  if (new Set(changes.map((change) => change.changeSequence)).size !== changes.length) {
    throw new ConversationExportError("message_changes.jsonl에 중복된 changeSequence가 있습니다.");
  }
}

function assertExpectation(
  manifest: ConversationExportManifest,
  expected: ConversationExportExpectation | undefined,
) {
  if (!expected) return;
  if (manifest.roomId !== expected.roomId) {
    throw new ConversationExportError("요청한 채팅방과 Export의 채팅방이 일치하지 않습니다.");
  }
  if (
    Date.parse(manifest.range.fromInclusive) !== Date.parse(expected.range.fromInclusive) ||
    Date.parse(manifest.range.toExclusive) !== Date.parse(expected.range.toExclusive)
  ) {
    throw new ConversationExportError("요청한 시간 범위와 Export의 시간 범위가 일치하지 않습니다.");
  }
}

function assertAnalysisContract(manifest: ConversationExportManifest) {
  if (
    manifest.messageRepresentation !== "AS_OF_TO_EXCLUSIVE" ||
    !manifest.changeHistoryIncluded ||
    manifest.jsonTimezone !== "UTC"
  ) {
    throw new ConversationExportError("이 Export 표현 방식은 v1 웹 분석에서 지원하지 않습니다.");
  }
}

function assertRangeContents(
  manifest: ConversationExportManifest,
  messages: readonly ConversationMessage[],
  changes: readonly ConversationChange[],
) {
  const from = Date.parse(manifest.range.fromInclusive);
  const to = Date.parse(manifest.range.toExclusive);
  if (messages.some((message) => !inRange(Date.parse(message.createdAt), from, to))) {
    throw new ConversationExportError("messages.jsonl에 조회 범위 밖의 생성 시각이 있습니다.");
  }
  if (changes.some((change) => !inRange(Date.parse(change.changedAt), from, to))) {
    throw new ConversationExportError(
      "message_changes.jsonl에 조회 범위 밖의 변경 시각이 있습니다.",
    );
  }
  if (changes.some((change) => change.changeSequence > manifest.capturedChangeSequence)) {
    throw new ConversationExportError("snapshot 이후의 변경 이벤트가 포함되어 있습니다.");
  }
}

function inRange(value: number, fromInclusive: number, toExclusive: number): boolean {
  return value >= fromInclusive && value < toExclusive;
}

async function verifyManifestFiles(
  entries: Readonly<Record<string, Uint8Array>>,
  files: readonly ConversationExportFile[],
) {
  const declaredNames = new Set(files.map((file) => file.name));
  if (
    files.length !== integrityEntries.length ||
    integrityEntries.some((name) => !declaredNames.has(name))
  ) {
    throw new ConversationExportError("manifest.json의 파일 무결성 목록이 완전하지 않습니다.");
  }
  const seen = new Set<string>();
  return Promise.all(
    files.map(async (file) => {
      if (seen.has(file.name) || file.name === "manifest.json") {
        throw new ConversationExportError(
          "manifest.json에 중복되거나 잘못된 파일 항목이 있습니다.",
        );
      }
      seen.add(file.name);
      const entry = entries[file.name];
      if (!entry) throw new ConversationExportError(`${file.name} 파일이 ZIP에 없습니다.`);
      if (entry.byteLength !== file.sizeBytes) {
        throw new ConversationExportError(`${file.name} 파일 크기가 manifest와 일치하지 않습니다.`);
      }
      const sha256 = await sha256Hex(entry);
      if (sha256 !== file.sha256) {
        throw new ConversationExportError(`${file.name} 파일 무결성 검증에 실패했습니다.`);
      }
      return { ...file, verified: true as const };
    }),
  );
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new ConversationExportError("이 브라우저에서는 파일 무결성을 확인할 수 없습니다.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(value).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertManifestCounts(
  manifest: ConversationExportManifest,
  messages: readonly ConversationMessage[],
  changes: readonly ConversationChange[],
): void {
  if (manifest.counts.messages !== messages.length) {
    throw new ConversationExportError("manifest의 메시지 건수와 messages.jsonl 행 수가 다릅니다.");
  }
  if (manifest.counts.changes !== changes.length) {
    throw new ConversationExportError(
      "manifest의 변경 건수와 message_changes.jsonl 행 수가 다릅니다.",
    );
  }
  for (const [changeType, expected] of [
    ["CREATED", manifest.counts.created],
    ["UPDATED", manifest.counts.updated],
    ["DELETED", manifest.counts.deleted],
  ] as const) {
    if (changes.filter((change) => change.changeType === changeType).length !== expected) {
      throw new ConversationExportError(
        `manifest의 ${changeType} 건수와 변경 이력 행 수가 다릅니다.`,
      );
    }
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function instant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
