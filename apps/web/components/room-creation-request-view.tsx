"use client";

import Image from "next/image";
import Link from "next/link";
import type { RoomCreationRequestResponse } from "@/lib/chat/chat-room-contracts";
import {
  createRoomCreationRequestStatusPresentation,
  formatRoomCreationRequestInstant,
  type RoomCreationRequestErrorPresentation,
  type RoomCreationRequestStatusPresentation,
} from "@/lib/chat/room-creation-request-presentation";

export type RoomCreationRequestViewProps = Readonly<{
  cancel: () => void;
  cancellationErrorMessage: string | null;
  cancellationFeedback: string | null;
  error: RoomCreationRequestErrorPresentation | null;
  isCanceling: boolean;
  isPending: boolean;
  isRefreshing: boolean;
  refresh: () => void;
  request: RoomCreationRequestResponse | null;
}>;

export function RoomCreationRequestView({
  cancel,
  cancellationErrorMessage,
  cancellationFeedback,
  error,
  isCanceling,
  isPending,
  isRefreshing,
  refresh,
  request,
}: RoomCreationRequestViewProps) {
  return (
    <div className="chat-publishing-surface mx-auto min-h-dvh w-full max-w-[393px] bg-white text-[var(--chat-publishing-color-text)] shadow-[var(--chat-publishing-shadow-card)]">
      <header className="flex h-[68px] items-center gap-3 border-b border-[var(--chat-publishing-color-border)] bg-white px-4">
        <Link
          aria-label="토론방 목록으로 돌아가기"
          className="flex size-11 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
          href="/chat"
        >
          <Image alt="" aria-hidden="true" height={24} src="/assets/chat/back.png" width={24} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold leading-7 tracking-[-0.025em]">
          채팅방 생성 신청
        </h1>
      </header>

      <main className="px-4 py-5">
        {isPending ? <RoomCreationRequestLoading /> : null}
        {!isPending && error ? <RoomCreationRequestError error={error} onRetry={refresh} /> : null}
        {!isPending && !error && request ? (
          <RoomCreationRequestDetails
            cancellationErrorMessage={cancellationErrorMessage}
            cancellationFeedback={cancellationFeedback}
            isCanceling={isCanceling}
            isRefreshing={isRefreshing}
            onCancel={cancel}
            onRefresh={refresh}
            request={request}
          />
        ) : null}
      </main>
    </div>
  );
}

function RoomCreationRequestLoading() {
  return (
    <section aria-busy="true" className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">신청 상태를 불러오고 있습니다.</p>
    </section>
  );
}

function RoomCreationRequestError({
  error,
  onRetry,
}: {
  error: RoomCreationRequestErrorPresentation;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-2xl border border-[#ffc95c] bg-[#fff7e8] p-5" role="alert">
      <h2 className="text-base font-bold text-[#8a4a08]">{error.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">{error.description}</p>
      <div className="mt-5">
        {error.action === "retry" ? (
          <button className="primary-button" onClick={onRetry} type="button">
            다시 시도
          </button>
        ) : (
          <Link className="primary-button inline-flex items-center justify-center" href="/chat">
            채팅방 목록
          </Link>
        )}
      </div>
    </section>
  );
}

function RoomCreationRequestDetails({
  cancellationErrorMessage,
  cancellationFeedback,
  isCanceling,
  isRefreshing,
  onCancel,
  onRefresh,
  request,
}: {
  cancellationErrorMessage: string | null;
  cancellationFeedback: string | null;
  isCanceling: boolean;
  isRefreshing: boolean;
  onCancel: () => void;
  onRefresh: () => void;
  request: RoomCreationRequestResponse;
}) {
  const presentation = createRoomCreationRequestStatusPresentation(request);

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5"
      data-room-creation-request-status={request.status}
    >
      <StatusBadge presentation={presentation} />
      <h2 className="mt-4 text-lg font-bold leading-7 text-slate-950">{presentation.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">{presentation.description}</p>

      {cancellationFeedback ? (
        <p
          className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-800"
          role="status"
        >
          {cancellationFeedback}
        </p>
      ) : null}
      {cancellationErrorMessage ? (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-700" role="alert">
          {cancellationErrorMessage}
        </p>
      ) : null}

      <dl className="mt-6 divide-y divide-slate-100 border-y border-slate-100">
        <DetailRow label="신청 ID" value={request.creationRequestId} />
        <DetailRow
          label="신청 시각"
          value={formatRoomCreationRequestInstant(request.requestedAt)}
        />
        {request.resolvedAt ? (
          <DetailRow
            label="처리 시각"
            value={formatRoomCreationRequestInstant(request.resolvedAt)}
          />
        ) : null}
      </dl>

      <div className="mt-6 grid gap-2">
        {request.status === "APPROVED" && request.roomStatus === "ACTIVE" ? (
          <Link
            className="primary-button inline-flex items-center justify-center"
            href={`/chat/${request.roomId}`}
          >
            생성된 채팅방으로 이동
          </Link>
        ) : null}
        <button
          className="secondary-button"
          disabled={isRefreshing || isCanceling}
          onClick={onRefresh}
          type="button"
        >
          {isRefreshing ? "상태 확인 중…" : "최신 상태 확인"}
        </button>
        {request.status === "PENDING" ? (
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-red-200 bg-white px-4 text-base font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isCanceling || isRefreshing}
            onClick={onCancel}
            type="button"
          >
            {isCanceling ? "신청 취소 중…" : "신청 취소"}
          </button>
        ) : null}
      </div>
    </section>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
