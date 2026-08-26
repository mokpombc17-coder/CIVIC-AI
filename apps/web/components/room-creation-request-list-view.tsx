"use client";

import Image from "next/image";
import Link from "next/link";
import type { RoomCreationRequestResponse } from "@/lib/chat/chat-room-contracts";
import {
  createRoomCreationRequestStatusPresentation,
  formatRoomCreationRequestInstant,
  type RoomCreationRequestStatusPresentation,
} from "@/lib/chat/room-creation-request-presentation";

export type RoomCreationRequestListViewProps = Readonly<{
  errorMessage: string | null;
  hasNextPage: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  loadMore: () => void;
  requests: readonly RoomCreationRequestResponse[];
  retry: () => void;
}>;

export function RoomCreationRequestListView({
  errorMessage,
  hasNextPage,
  isError,
  isFetchingNextPage,
  isPending,
  loadMore,
  requests,
  retry,
}: RoomCreationRequestListViewProps) {
  return (
    <div className="chat-publishing-surface mx-auto min-h-dvh w-full max-w-[393px] bg-white text-[var(--chat-publishing-color-text)] shadow-[var(--chat-publishing-shadow-card)]">
      <header className="flex h-[68px] items-center gap-3 border-b border-[var(--chat-publishing-color-border)] bg-white px-4">
        <Link
          aria-label="채팅방 목록으로 돌아가기"
          className="flex size-11 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
          href="/chat"
        >
          <Image alt="" aria-hidden="true" height={24} src="/assets/chat/back.png" width={24} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold leading-7 tracking-[-0.025em]">
          채팅방 생성 신청 내역
        </h1>
      </header>

      <main className="grid gap-4 px-4 py-5">
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
          <section aria-busy="true" className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-slate-600">신청 내역을 불러오고 있습니다.</p>
          </section>
        ) : null}

        {!isPending && !isError && requests.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-base font-bold text-slate-950">아직 생성 신청이 없습니다.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              채팅방 목록에서 새로운 채팅방 생성을 신청할 수 있습니다.
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
      </main>
    </div>
  );
}

function RoomCreationRequestListItem({ request }: { request: RoomCreationRequestResponse }) {
  const presentation = createRoomCreationRequestStatusPresentation(request);

  return (
    <Link
      className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-[var(--chat-publishing-color-primary)] hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
      data-room-creation-request-status={request.status}
      href={`/chat/creation-requests/${encodeURIComponent(request.creationRequestId)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <StatusBadge presentation={presentation} />
        <time
          className="shrink-0 text-xs text-slate-500"
          dateTime={request.requestedAt}
          suppressHydrationWarning
        >
          {formatRoomCreationRequestInstant(request.requestedAt)}
        </time>
      </div>
      <strong className="mt-3 block text-base font-bold leading-6 text-slate-950">
        {presentation.title}
      </strong>
      <span className="mt-1 line-clamp-2 block text-sm leading-6 text-slate-600">
        {presentation.description}
      </span>
      <span className="mt-4 block truncate text-xs text-slate-400">
        신청 ID {request.creationRequestId}
      </span>
    </Link>
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
