import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  calculateConversationMetrics,
  ConversationExportError,
  MAX_CONVERSATION_EXPORT_ARCHIVE_BYTES,
  parseConversationExportArchive,
  readConversationExportResponse,
  type ConversationExportRange,
} from "./conversation-export";

const roomId = "11000000-0000-0000-0000-000000000001";
const range: ConversationExportRange = {
  fromInclusive: "2026-08-24T02:00:00Z",
  toExclusive: "2026-08-24T03:00:00Z",
};

describe("conversation export v1", () => {
  it("ZIP 무결성을 확인하고 종료 상태·변경 이력 통계를 계산한다", async () => {
    const analysis = await parseConversationExportArchive(buildArchive(), { roomId, range });

    expect(analysis.manifest.roomName).toBe("지역 교통 정책 토론방");
    expect(analysis.verifiedFiles).toHaveLength(3);
    expect(analysis.verifiedFiles.every((file) => file.verified)).toBe(true);
    expect(analysis.warnings).toEqual([]);
    expect(analysis.metrics).toMatchObject({
      totalMessages: 3,
      retainedMessages: 2,
      deletedMessages: 1,
      authorCount: 3,
      editedMessages: 3,
      editRate: 1,
      deletionRate: 1 / 3,
      events: { created: 3, updated: 4, deleted: 1 },
      sentiment: { positive: 1, neutral: 1, negative: 0 },
    });
    expect(analysis.metrics.authors).toEqual([
      { label: "작성자 1", count: 1 },
      { label: "작성자 2", count: 1 },
      { label: "작성자 3", count: 1 },
    ]);
    expect(analysis.metrics.keywords.map((item) => item.term)).toContain("찬성합니다");
    expect(analysis.metrics.topics).toContainEqual({ label: "조직·업무", count: 1 });
  });

  it("요청 채팅방·시간 범위가 manifest와 다르면 결과를 사용하지 않는다", async () => {
    await expect(
      parseConversationExportArchive(buildArchive(), { roomId: "other-room", range }),
    ).rejects.toThrow("요청한 채팅방과 Export의 채팅방이 일치하지 않습니다.");
    await expect(
      parseConversationExportArchive(buildArchive(), {
        roomId,
        range: { ...range, toExclusive: "2026-08-24T04:00:00Z" },
      }),
    ).rejects.toThrow("요청한 시간 범위와 Export의 시간 범위가 일치하지 않습니다.");
  });

  it("manifest SHA-256과 다른 파일은 분석하지 않는다", async () => {
    await expect(
      parseConversationExportArchive(buildArchive({ corruptMessages: true })),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ConversationExportError>>({
        name: "ConversationExportError",
        message: "messages.jsonl 파일 무결성 검증에 실패했습니다.",
      }),
    );
  });

  it("manifest 건수나 조회 범위가 JSONL과 다르면 통계를 표시하지 않는다", async () => {
    await expect(parseConversationExportArchive(buildArchive({ messageCount: 4 }))).rejects.toThrow(
      "manifest의 메시지 건수와 messages.jsonl 행 수가 다릅니다.",
    );
    await expect(
      parseConversationExportArchive(
        buildArchive({ firstMessageCreatedAt: "2026-08-24T03:00:00Z" }),
      ),
    ).rejects.toThrow("messages.jsonl에 조회 범위 밖의 생성 시각이 있습니다.");
  });

  it("계약에 없는 ZIP 항목과 웹 분석 한도를 거부한다", async () => {
    await expect(
      parseConversationExportArchive(buildArchive({ includeUnexpectedEntry: true })),
    ).rejects.toThrow("허용되지 않은 ZIP 항목입니다");
    await expect(
      readConversationExportResponse(
        new Response(new Uint8Array(), {
          headers: { "content-length": String(MAX_CONVERSATION_EXPORT_ARCHIVE_BYTES + 1) },
        }),
      ),
    ).rejects.toThrow("조회 기간을 줄여 주세요");
  });

  it("기간 밖 기존 메시지의 수정 이벤트를 수정률 분자에 포함하지 않는다", () => {
    const metrics = calculateConversationMetrics(
      [
        {
          messageSequence: 1,
          userId: "user-1",
          content: "기간 내 메시지",
          createdAt: "2026-08-24T02:10:00Z",
          deleted: false,
        },
      ],
      [change(1, 99, "user-2", "UPDATED", "기존 메시지 수정", "2026-08-24T02:20:00Z")],
    );

    expect(metrics.events.updated).toBe(1);
    expect(metrics.editedMessages).toBe(0);
    expect(metrics.editRate).toBe(0);
  });
});

type ArchiveOptions = Readonly<{
  corruptMessages?: boolean;
  firstMessageCreatedAt?: string;
  includeUnexpectedEntry?: boolean;
  messageCount?: number;
}>;

function buildArchive(options: ArchiveOptions = {}): Uint8Array {
  const messages = [
    {
      messageSequence: 1,
      userId: "user-9",
      content: "이 정책에는 돌봄 대상자를 위한 예외 조건이 필요합니다.",
      createdAt: options.firstMessageCreatedAt ?? "2026-08-24T02:20:00Z",
      deleted: false,
    },
    {
      messageSequence: 2,
      userId: "user-4",
      content: "시범 운영 기간을 두고 참여율과 만족도를 함께 평가해야 합니다.",
      createdAt: "2026-08-24T02:21:00Z",
      deleted: true,
    },
    {
      messageSequence: 3,
      userId: "user-12",
      content: "부서별 업무 특성을 반영한 선택형 운영에 찬성합니다.",
      createdAt: "2026-08-24T02:22:00Z",
      deleted: false,
    },
  ];
  const changes = [
    change(1, 1, "user-9", "CREATED", "이 정책에 찬성합니다.", "2026-08-24T02:20:00Z"),
    change(2, 2, "user-4", "CREATED", "시범 운영이 필요합니다.", "2026-08-24T02:21:00Z"),
    change(3, 3, "user-12", "CREATED", "부서별 선택형 운영에 찬성합니다.", "2026-08-24T02:22:00Z"),
    change(4, 1, "user-9", "UPDATED", messages[0]!.content, "2026-08-24T02:25:00Z"),
    change(
      5,
      2,
      "user-4",
      "UPDATED",
      "최소 3개월의 시범 운영 기간이 필요합니다.",
      "2026-08-24T02:26:00Z",
    ),
    change(6, 2, "user-4", "UPDATED", messages[1]!.content, "2026-08-24T02:27:00Z"),
    change(7, 2, "user-4", "DELETED", messages[1]!.content, "2026-08-24T02:29:00Z"),
    change(8, 3, "user-12", "UPDATED", messages[2]!.content, "2026-08-24T02:30:00Z"),
  ];
  const originalMessageText = jsonl(messages);
  const messageText = options.corruptMessages
    ? originalMessageText.replace("돌봄", "보육")
    : originalMessageText;
  const changeText = jsonl(changes);
  const transcript = '<!doctype html><html lang="ko"><body>대화 내역</body></html>';
  const integrityFiles = [
    integrity("messages.jsonl", originalMessageText),
    integrity("message_changes.jsonl", changeText),
    integrity("transcript.html", transcript),
  ];
  const manifest = {
    contract: "admin-room-conversation-export",
    schemaVersion: 1,
    exportId: "21000000-0000-0000-0000-000000000001",
    roomId,
    roomName: "지역 교통 정책 토론방",
    roomDescription: "지역 교통 정책 개선안을 논의하는 채팅방입니다.",
    range,
    capturedChangeSequence: 8,
    capturedAt: range.toExclusive,
    generatedAt: "2026-08-24T03:00:01Z",
    identityMode: "INTERNAL_USER_ID",
    messageRepresentation: "AS_OF_TO_EXCLUSIVE",
    deletedContentIncluded: true,
    changeHistoryIncluded: true,
    jsonTimezone: "UTC",
    htmlTimezone: "Asia/Seoul",
    counts: {
      messages: options.messageCount ?? 3,
      changes: 8,
      created: 3,
      updated: 4,
      deleted: 1,
    },
    files: integrityFiles,
  };
  const entries: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "messages.jsonl": strToU8(messageText),
    "message_changes.jsonl": strToU8(changeText),
    "transcript.html": strToU8(transcript),
  };
  if (options.includeUnexpectedEntry) entries["unexpected.bin"] = new Uint8Array([1]);
  return zipSync(entries);
}

function change(
  changeSequence: number,
  messageSequence: number,
  userId: string,
  changeType: "CREATED" | "UPDATED" | "DELETED",
  content: string,
  changedAt: string,
) {
  return { changeSequence, messageSequence, userId, changeType, content, changedAt };
}

function jsonl(values: readonly unknown[]): string {
  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

function integrity(name: string, value: string) {
  const bytes = strToU8(value);
  return {
    name,
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
