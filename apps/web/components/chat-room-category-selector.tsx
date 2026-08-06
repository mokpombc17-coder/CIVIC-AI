"use client";

import { useId } from "react";
import {
  CHAT_ROOM_CATEGORY_OPTIONS,
  getChatRoomCategoryLabel,
} from "@/components/chat-room-category";
import type { RoomCategory } from "@/lib/chat/chat-room-contracts";

type ChatRoomCategorySelectorProps = Readonly<{
  disabled?: boolean;
  onSelect: (category: RoomCategory) => void;
  selectedCategory: RoomCategory | null;
}>;

export function ChatRoomCategorySelector({
  disabled = false,
  onSelect,
  selectedCategory,
}: ChatRoomCategorySelectorProps) {
  const helpId = useId();

  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="text-sm font-medium text-slate-700">카테고리</legend>
      <div aria-describedby={helpId} className="flex flex-wrap gap-2">
        {CHAT_ROOM_CATEGORY_OPTIONS.map((category) => (
          <label
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${
              selectedCategory === category
                ? "border-blue-600 bg-blue-600 font-semibold text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-blue-400"
            }`}
            key={category}
          >
            <input
              checked={selectedCategory === category}
              className="sr-only"
              name="category"
              onChange={() => onSelect(category)}
              required
              type="radio"
              value={category}
            />
            {getChatRoomCategoryLabel(category)}
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-500" id={helpId}>
        방을 대표하는 카테고리 하나를 선택해 주세요.
      </p>
    </fieldset>
  );
}
