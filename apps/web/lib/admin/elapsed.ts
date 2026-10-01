"use client";

import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// AI 예상 답변 생성이 이 시간을 넘기면 운영자가 확인해야 할 지연으로 본다.
export const TASK_PREPARATION_DELAY_MS = 30 * MINUTE_MS;

export function elapsedLabel(fromMs: number, nowMs: number): string {
  const elapsed = Math.max(nowMs - fromMs, 0);
  if (elapsed < MINUTE_MS) return "1분 미만";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}분`;
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS);
    return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  const hours = Math.floor((elapsed % DAY_MS) / HOUR_MS);
  return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
}

export function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}
