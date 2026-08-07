"use client";

import { forwardRef, useSyncExternalStore, type CSSProperties } from "react";
import type { ChatMessageTimelineDate } from "@/lib/chat/chat-message-timeline";

type ChatMessageDateSeparatorProps = Readonly<{
  date: ChatMessageTimelineDate;
  now?: Date;
  renderKey: string;
  style: CSSProperties;
  virtualIndex: number;
}>;

export const ChatMessageDateSeparator = forwardRef<HTMLLIElement, ChatMessageDateSeparatorProps>(
  function ChatMessageDateSeparator({ date, now, renderKey, style, virtualIndex }, ref) {
    const currentTime = useHydratedNow(now);
    const label = currentTime ? formatChatMessageDateSeparator(date, currentTime) : null;

    return (
      <li
        aria-label={label ?? undefined}
        className="flex items-center gap-3 text-xs text-slate-500"
        data-date-key={date.key}
        data-index={virtualIndex}
        data-render-key={renderKey}
        ref={ref}
        role="separator"
        style={style}
      >
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
        <time dateTime={date.key}>{label}</time>
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
      </li>
    );
  },
);

export function formatChatMessageDateSeparator(date: ChatMessageTimelineDate, now: Date): string {
  const currentDate = getKoreaCalendarDate(now);
  const dayDifference = getCalendarDayDifference(currentDate, date);

  if (dayDifference === 0) {
    return "오늘";
  }

  if (dayDifference === 1) {
    return "어제";
  }

  if (date.year === currentDate.year) {
    return `${date.month}월 ${date.day}일`;
  }

  return `${date.year}년 ${date.month}월 ${date.day}일`;
}

function useHydratedNow(providedNow: Date | undefined): Date | null {
  const isHydrated = useSyncExternalStore(subscribeToHydration, getHydrated, getServerHydrated);
  return providedNow ?? (isHydrated ? new Date() : null);
}

const subscribeToHydration = () => () => {};
const getHydrated = () => true;
const getServerHydrated = () => false;

const KOREA_CALENDAR_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Seoul",
  year: "numeric",
});

function getKoreaCalendarDate(date: Date): ChatMessageTimelineDate {
  const values = Object.fromEntries(
    KOREA_CALENDAR_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  return {
    day,
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    month,
    year,
  };
}

function getCalendarDayDifference(
  current: ChatMessageTimelineDate,
  messageDate: ChatMessageTimelineDate,
): number {
  const currentDay = Date.UTC(current.year, current.month - 1, current.day);
  const messageDay = Date.UTC(messageDate.year, messageDate.month - 1, messageDate.day);
  return Math.round((currentDay - messageDay) / 86_400_000);
}
