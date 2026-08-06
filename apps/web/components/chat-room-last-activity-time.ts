const KOREA_TIME_ZONE = "Asia/Seoul";
const KOREA_CALENDAR_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: KOREA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const KOREA_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KOREA_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

type CalendarDate = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

export function formatRoomInboxActivityTime(lastActivityAt: string, now: Date): string {
  const activityDate = getKoreaCalendarDate(new Date(lastActivityAt));
  const currentDate = getKoreaCalendarDate(now);
  const dayDifference = getCalendarDayDifference(currentDate, activityDate);

  if (dayDifference === 0) {
    return KOREA_TIME_FORMATTER.format(new Date(lastActivityAt));
  }

  if (dayDifference === 1) {
    return "어제";
  }

  if (activityDate.year === currentDate.year) {
    return `${activityDate.month}월 ${activityDate.day}일`;
  }

  return `${activityDate.year}. ${activityDate.month}. ${activityDate.day}.`;
}

function getKoreaCalendarDate(date: Date): CalendarDate {
  const parts = KOREA_CALENDAR_FORMATTER.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function getCalendarDayDifference(current: CalendarDate, activity: CalendarDate): number {
  const currentDay = Date.UTC(current.year, current.month - 1, current.day);
  const activityDay = Date.UTC(activity.year, activity.month - 1, activity.day);
  return Math.round((currentDay - activityDay) / 86_400_000);
}
