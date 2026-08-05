"use client";

import { useCreateChatRoomForm } from "@/components/use-create-chat-room-form";

export const CREATE_CHAT_ROOM_FORM_ID = "create-room-form";

export function CreateChatRoomForm({ onCancel }: { onCancel: () => void }) {
  const form = useCreateChatRoomForm();

  return (
    <form
      className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4"
      id={CREATE_CHAT_ROOM_FORM_ID}
      onChange={form.clearFailedAttempt}
      onSubmit={form.handleSubmit}
    >
      <fieldset className="grid gap-4" disabled={form.isPending}>
        <legend className="text-sm font-semibold text-slate-950">새 채팅방 만들기</legend>

        <label className="grid gap-1 text-sm font-medium text-slate-700">
          방 이름
          <input
            autoFocus
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
            maxLength={100}
            name="name"
            placeholder="예: 시민 AI 토론방"
            required
          />
        </label>

        <div className="grid gap-1 text-sm text-slate-700">
          <label className="font-medium" htmlFor="create-room-description">
            방 설명 <span className="font-normal text-slate-500">(선택)</span>
          </label>
          <textarea
            aria-describedby="create-room-description-help"
            className="min-h-24 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
            id="create-room-description"
            name="description"
            placeholder="이 방에서 나눌 이야기를 간단히 소개해 주세요."
            rows={3}
          />
          <span className="text-xs font-normal text-slate-500" id="create-room-description-help">
            앞뒤 공백을 제외한 최대 500자이며, 일반 텍스트로 저장됩니다.
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            공개 범위
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
              defaultValue="LISTED"
              name="visibility"
            >
              <option value="LISTED">공개 목록에 표시</option>
              <option value="UNLISTED">목록에 표시하지 않음</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            참여 정책
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
              defaultValue="OPEN"
              name="joinPolicy"
            >
              <option value="OPEN">누구나 참여</option>
              <option value="INVITE_ONLY">초대 전용</option>
            </select>
          </label>
        </div>

        {form.validationError ? (
          <p className="text-sm text-red-700" role="alert">
            {form.validationError}
          </p>
        ) : null}

        {form.errorMessage ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-950" role="alert">
            <p className="text-sm font-semibold">채팅방을 만들지 못했습니다.</p>
            <p className="mt-1 text-xs opacity-80">{form.errorMessage}</p>
            {form.canRetry ? (
              <button className="secondary-button mt-3" onClick={form.retry} type="button">
                같은 요청으로 다시 시도
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="secondary-button"
            disabled={form.isPending}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button className="primary-button" disabled={form.isPending} type="submit">
            {form.isPending ? "생성 중…" : "채팅방 만들기"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
