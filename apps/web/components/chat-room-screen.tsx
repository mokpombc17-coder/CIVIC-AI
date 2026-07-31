"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { ChatConnectionStatus } from "@/components/chat-connection-status";
import {
  useChatMessageOutbox,
  useChatOutgoingMessages,
  useChatRealtimeRoom,
  type ChatRealtimeRoomState,
} from "@/components/chat-realtime-provider";
import { ChatRoomMembershipPanel } from "@/components/chat-room-membership-panel";
import { ChatRoomSessionControls } from "@/components/chat-room-session-controls";
import { ChatRealtimeSyncStatus } from "@/components/chat-realtime-sync-status";
import { useChatRealtimeQueryCoordinator } from "@/components/use-chat-realtime-query-coordinator";
import {
  DEFAULT_MESSAGE_HISTORY_LIMIT,
  useRoomDetailsQuery,
  useRoomMessageHistoryQuery,
} from "@/lib/chat/chat-room-queries";
import {
  createChatMessageTimeline,
  type ChatMessageTimelineItem,
} from "@/lib/chat/chat-message-timeline";
import type { ChatOutgoingMessage } from "@/lib/chat/realtime/chat-message-outbox";
import { isChatRoomSnapshotReadyForRealtimeMerge } from "@/lib/chat/realtime/chat-room-snapshot-readiness";

const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

export function ChatRoomScreen({ roomId }: { roomId: string }) {
  const outbox = useChatMessageOutbox();
  const outgoingMessages = useChatOutgoingMessages(roomId);
  const session = useChatRealtimeRoom(roomId);
  const roomQuery = useRoomDetailsQuery(roomId);
  const messageHistory = useRoomMessageHistoryQuery(roomId, {
    enabled: session.isActive,
    limit: DEFAULT_MESSAGE_HISTORY_LIMIT,
  });
  const coordinatorEnabled =
    session.messageVisibleAfterSequence !== null &&
    session.watermarkSequence !== null &&
    isChatRoomSnapshotReadyForRealtimeMerge({
      hasMessageHistory: messageHistory.data !== undefined,
      isMessageHistoryRefetching: messageHistory.isRefetching,
      isRoomActive: session.isActive,
      messageHistoryStatus: messageHistory.status,
    });
  const realtimeQuery = useChatRealtimeQueryCoordinator({
    enabled: coordinatorEnabled,
    roomId,
    generation: session.generation,
    limit: DEFAULT_MESSAGE_HISTORY_LIMIT,
    messageVisibleAfterSequence: session.messageVisibleAfterSequence ?? 0,
    watermarkSequence: session.watermarkSequence ?? 0,
  });
  const room = roomQuery.data;
  const currentUserId = room?.myMembership?.userId ?? null;

  useEffect(() => {
    outbox.acknowledgeConfirmed(
      roomId,
      new Set(messageHistory.messages.map((message) => message.clientMessageId)),
    );
  }, [messageHistory.messages, outbox, roomId]);

  return (
    <div className="page-stack">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ChatRoomHeader
          memberCount={room?.activeMemberCount}
          name={room?.name}
          participationStatus={room?.participationStatus}
          roomId={roomId}
          roomStatus={room?.status}
          status={roomQuery.status}
        />

        {roomQuery.isError ? (
          <div className="border-b border-red-200 bg-red-50 px-5 py-4 text-red-950" role="alert">
            <p className="text-sm font-semibold">채팅방 정보를 불러오지 못했습니다.</p>
            <p className="mt-1 text-xs opacity-80">{toErrorMessage(roomQuery.error)}</p>
            <button
              className="secondary-button mt-3"
              onClick={() => void roomQuery.refetch()}
              type="button"
            >
              방 정보 다시 불러오기
            </button>
          </div>
        ) : null}

        <ChatMessageHistory
          currentUserId={currentUserId}
          messageHistory={messageHistory}
          outgoingMessages={outgoingMessages}
          roomId={roomId}
          session={session}
        />

        <ChatRealtimeSyncStatus
          error={realtimeQuery.error}
          isRecovering={realtimeQuery.isRecovering}
          isSynchronized={realtimeQuery.isSynchronized}
          onRetry={realtimeQuery.retry}
          visible={coordinatorEnabled}
        />

        <ChatRoomSessionControls
          realtimeReady={
            coordinatorEnabled && realtimeQuery.isSynchronized && realtimeQuery.error === null
          }
          roomId={roomId}
          session={session}
        />
      </section>

      {room ? <ChatRoomMembershipPanel room={room} roomId={roomId} /> : null}
    </div>
  );
}

type ChatRoomHeaderProps = Readonly<{
  memberCount: number | undefined;
  name: string | undefined;
  participationStatus: string | undefined;
  roomId: string;
  roomStatus: string | undefined;
  status: "pending" | "error" | "success";
}>;

function ChatRoomHeader({
  memberCount,
  name,
  participationStatus,
  roomId,
  roomStatus,
  status,
}: ChatRoomHeaderProps) {
  const statusLabel =
    status === "success" ? "REST 연동" : status === "error" ? "방 정보 조회 실패" : "조회 중";

  return (
    <header className="flex items-center gap-4 border-b border-slate-200 px-5 py-4">
      <Link
        aria-label="채팅방 목록으로 돌아가기"
        className="flex size-10 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-700 transition hover:bg-slate-100"
        href="/chat"
      >
        ←
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-bold text-slate-950">{name ?? roomId}</h1>
          <span className="status">{statusLabel}</span>
        </div>
        {memberCount === undefined ? (
          <p className="mt-1 text-sm text-slate-500">채팅방 정보를 불러오고 있습니다.</p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            참여자 {memberCount}명 · 방 상태 {roomStatus} · 내 상태 {participationStatus}
          </p>
        )}
        <div className="mt-2">
          <ChatConnectionStatus />
        </div>
      </div>
    </header>
  );
}

type ChatMessageHistoryProps = Readonly<{
  currentUserId: string | null;
  messageHistory: ReturnType<typeof useRoomMessageHistoryQuery>;
  outgoingMessages: readonly ChatOutgoingMessage[];
  roomId: string;
  session: ChatRealtimeRoomState;
}>;

function ChatMessageHistory({
  currentUserId,
  messageHistory,
  outgoingMessages,
  roomId,
  session,
}: ChatMessageHistoryProps) {
  const timeline = useMemo(
    () => createChatMessageTimeline(messageHistory.messages, outgoingMessages),
    [messageHistory.messages, outgoingMessages],
  );
  const showMessages = timeline.length > 0;

  return (
    <div
      aria-label={`${roomId} 메시지`}
      aria-live="polite"
      aria-relevant="additions text"
      className="min-h-[28rem] space-y-5 bg-slate-50 px-5 py-6"
      role="log"
    >
      {messageHistory.hasNextPage ? (
        <div className="text-center">
          <button
            className="secondary-button"
            disabled={messageHistory.isFetchingNextPage}
            onClick={() => void messageHistory.fetchNextPage()}
            type="button"
          >
            {messageHistory.isFetchingNextPage
              ? "이전 메시지 불러오는 중…"
              : "이전 메시지 불러오기"}
          </button>
        </div>
      ) : null}

      {!session.isActive && !showMessages ? (
        <MessageHistoryNotice message="실시간 방 구독이 준비되면 최근 메시지를 불러옵니다." />
      ) : messageHistory.isPending && !showMessages ? (
        <MessageHistoryNotice message="최근 메시지를 불러오고 있습니다." />
      ) : messageHistory.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950" role="alert">
          <p className="text-sm font-semibold">메시지 이력을 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs opacity-80">{toErrorMessage(messageHistory.error)}</p>
          <button
            className="secondary-button mt-3"
            onClick={() => void messageHistory.refetch()}
            type="button"
          >
            다시 불러오기
          </button>
        </div>
      ) : timeline.length === 0 ? (
        <MessageHistoryNotice message="아직 작성된 메시지가 없습니다." />
      ) : null}

      {showMessages ? (
        <ol className="space-y-5">
          {timeline.map((item) => (
            <ChatMessageItem
              currentUserId={currentUserId}
              item={item}
              key={
                item.kind === "confirmed"
                  ? item.message.messageId
                  : `outgoing-${item.message.clientMessageId}`
              }
            />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function MessageHistoryNotice({ message }: { message: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center text-center">
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function ChatMessageItem({
  currentUserId,
  item,
}: {
  currentUserId: string | null;
  item: ChatMessageTimelineItem;
}) {
  if (item.kind === "outgoing") {
    return <OutgoingChatMessageItem message={item.message} />;
  }

  const { message } = item;
  const isMine = message.senderUserId === currentUserId;

  return (
    <li className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
        {!isMine ? (
          <span className="mb-1 px-1 text-xs font-semibold text-slate-600">
            {message.senderUserId}
          </span>
        ) : null}
        <div className="flex items-end gap-2">
          {isMine ? (
            <span className="text-[0.7rem] text-slate-400">
              {formatMessageTime(message.createdAt)}
            </span>
          ) : null}
          <p
            className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 ${
              isMine
                ? "rounded-br-md bg-blue-700 text-white"
                : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
            }`}
          >
            {message.content}
          </p>
          {!isMine ? (
            <span className="text-[0.7rem] text-slate-400">
              {formatMessageTime(message.createdAt)}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function OutgoingChatMessageItem({ message }: { message: ChatOutgoingMessage }) {
  const failed = message.status === "failed" || message.status === "cancelled";

  return (
    <li
      className="flex justify-end"
      data-client-message-id={message.clientMessageId}
      data-delivery-status={message.status}
    >
      <div className="flex max-w-[78%] flex-col items-end">
        <div className="flex items-end gap-2">
          <span className="text-[0.7rem] text-slate-400">
            {formatMessageTime(message.enqueuedAt)}
          </span>
          <p
            className={`whitespace-pre-wrap break-words rounded-2xl rounded-br-md border px-4 py-3 text-sm leading-6 ${
              failed
                ? "border-red-300 bg-red-50 text-red-950"
                : "border-blue-500 bg-blue-600 text-white opacity-80"
            }`}
          >
            {message.content}
          </p>
        </div>
        <p
          className={`mt-1 px-1 text-[0.7rem] ${failed ? "text-red-700" : "text-slate-500"}`}
          role={failed ? "alert" : "status"}
        >
          {getOutgoingMessageStatusLabel(message)}
        </p>
      </div>
    </li>
  );
}

function getOutgoingMessageStatusLabel(message: ChatOutgoingMessage): string {
  switch (message.status) {
    case "queued":
      return "전송 대기 중";
    case "sending":
    case "retry-waiting":
      return "전송 중";
    case "accepted":
      return "전송 확인 중";
    case "failed":
    case "cancelled":
      return message.message ?? "메시지를 전송하지 못했습니다.";
  }
}

function formatMessageTime(createdAt: string | number): string {
  const timestamp = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
  return Number.isNaN(timestamp) ? String(createdAt) : MESSAGE_TIME_FORMATTER.format(timestamp);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
