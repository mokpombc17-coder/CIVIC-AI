"use client";

import { useId } from "react";
import {
  CHAT_ROOM_CATEGORY_OPTIONS,
  getChatRoomCategoryLabel,
} from "@/components/chat-room-category";
import type { PublicRoomSearchController } from "@/components/use-public-room-search";
import type { RoomCategory } from "@/lib/chat/chat-room-contracts";

type PublicRoomSearchFormProps = Readonly<{
  controller: PublicRoomSearchController;
}>;

export function PublicRoomSearchForm({ controller }: PublicRoomSearchFormProps) {
  const helpId = useId();
  const errorId = useId();
  const describedBy = [helpId, controller.validationMessage ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <form
      aria-label="공개 채팅방 검색"
      className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        controller.applySearch();
      }}
      role="search"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
          방 제목 검색
          <input
            aria-describedby={describedBy}
            aria-invalid={controller.validationMessage ? true : undefined}
            autoComplete="off"
            className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            inputMode="search"
            onChange={(event) => controller.setDraftQuery(event.currentTarget.value)}
            onCompositionEnd={controller.endComposition}
            onCompositionStart={controller.startComposition}
            placeholder="방 제목을 입력해 주세요"
            type="search"
            value={controller.draftQuery}
          />
        </label>

        <button
          className="primary-button sm:min-w-24"
          disabled={controller.isComposing}
          type="submit"
        >
          검색
        </button>
      </div>

      <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:max-w-xs">
        카테고리
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          onChange={(event) => controller.setCategory(readCategory(event.currentTarget.value))}
          value={controller.category ?? ""}
        >
          <option value="">전체</option>
          {CHAT_ROOM_CATEGORY_OPTIONS.map((category) => (
            <option key={category} value={category}>
              {getChatRoomCategoryLabel(category)}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-slate-500" id={helpId}>
        제목 검색은 검색 버튼을 누르면 적용되며, 카테고리 필터는 선택 즉시 적용됩니다.
      </p>
      {controller.validationMessage ? (
        <p className="text-sm font-medium text-red-700" id={errorId} role="alert">
          {controller.validationMessage}
        </p>
      ) : null}
    </form>
  );
}

function readCategory(value: string): RoomCategory | undefined {
  return CHAT_ROOM_CATEGORY_OPTIONS.find((category) => category === value);
}
