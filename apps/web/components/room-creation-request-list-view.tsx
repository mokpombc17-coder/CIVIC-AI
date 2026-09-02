"use client";

import Link from "next/link";
import type { RoomCreationRequestResponse } from "@/lib/chat/chat-room-contracts";
import {
  createRoomCreationRequestStatusPresentation,
  formatRoomCreationRequestInstant,
  type RoomCreationRequestStatusPresentation,
} from "@/lib/chat/room-creation-request-presentation";

export type RoomCreationRequestListContentProps = Readonly<{
  errorMessage: string | null;
  hasNextPage: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  loadMore: () => void;
  requests: readonly RoomCreationRequestResponse[];
  retry: () => void;
}>;

export function RoomCreationRequestListContent({
  errorMessage,
  hasNextPage,
  isError,
  isFetchingNextPage,
  isPending,
  loadMore,
  requests,
  retry,
}: RoomCreationRequestListContentProps) {
  return (
    <div className="grid gap-4">
      {isError ? (
        <section className="rounded-2xl border border-[#ffc95c] bg-[#fff7e8] p-4" role="alert">
          <h2 className="text-base font-bold text-[#8a4a08]">신청 내역을 불러오지 못했습니다.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{errorMessage}</p>
          <button className="secondary-button mt-4" onClick={retry} type="button">
            다시 시도
          </button>
        </section>
      ) : null}

      {isPending && requests.length === 0 ? (
        <section aria-busy="true" className="py-1">
          <p className="text-sm text-slate-600">신청 내역을 불러오고 있습니다.</p>
        </section>
      ) : null}

      {!isPending && !isError && requests.length === 0 ? (
        <section className="py-1">
          <h2 className="text-base font-bold text-slate-950">아직 요청 내역이 없어요.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            새로운 토론방이 필요하다면 신청해 주세요.
          </p>
        </section>
      ) : null}

      {requests.length > 0 ? (
        <ol aria-label="채팅방 생성 신청 내역" className="grid gap-3">
          {requests.map((request) => (
            <li key={request.creationRequestId}>
              <RoomCreationRequestListItem request={request} />
            </li>
          ))}
        </ol>
      ) : null}

      {hasNextPage ? (
        <button
          className="secondary-button"
          disabled={isFetchingNextPage}
          onClick={loadMore}
          type="button"
        >
          {isFetchingNextPage ? "신청 내역 불러오는 중…" : "이전 신청 더 보기"}
        </button>
      ) : null}
    </div>
  );
}

function RoomCreationRequestListItem({ request }: { request: RoomCreationRequestResponse }) {
  const presentation = createRoomCreationRequestStatusPresentation(request);

  return (
    <article
      className="grid min-h-[120px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--chat-publishing-radius-card)] border border-[var(--chat-publishing-color-border)] bg-white px-5 py-4"
      data-room-creation-request-status={request.status}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusBadge presentation={presentation} />
          <time
            className="min-w-0 truncate text-xs text-[var(--chat-publishing-color-muted)]"
            dateTime={request.requestedAt}
            suppressHydrationWarning
          >
            {formatRoomCreationRequestInstant(request.requestedAt)}
          </time>
        </div>
        <strong className="mt-2 block text-[17px] font-bold leading-6 text-[var(--chat-publishing-color-text)]">
          {presentation.title}
        </strong>
        <p className="mt-1 text-sm leading-5 text-[var(--chat-publishing-color-muted)]">
          {request.status === "REJECTED" ? request.rejectionReason : presentation.description}
        </p>
      </div>

      {request.status === "APPROVED" ? (
        <Link
          className="inline-flex h-12 min-w-[88px] shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-base font-bold text-[var(--chat-publishing-color-primary)] transition hover:text-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
          href={`/chat/${request.roomId}`}
        >
          이동하기
        </Link>
      ) : null}
    </article>
  );
}

function StatusBadge({ presentation }: { presentation: RoomCreationRequestStatusPresentation }) {
  const toneClassName = {
    info: "bg-blue-50 text-blue-700",
    success: "bg-emerald-50 text-emerald-700",
    danger: "bg-red-50 text-red-700",
    neutral: "bg-slate-100 text-slate-700",
  }[presentation.tone];

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${toneClassName}`}>
      {presentation.badgeLabel}
    </span>
  );
}
