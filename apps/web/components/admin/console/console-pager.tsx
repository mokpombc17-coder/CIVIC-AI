"use client";

import { useCallback, useState } from "react";

// Shared page navigation for admin lists. It reuses the RAG document ledger
// pager look (`civic-ledger-pagination`) so every admin table pages the same way.
// A list that knows its total shows "a-b / 전체 N건 · p / P"; a cursor list that
// only knows whether a next page exists shows "a-b건 · p페이지".

export const CONSOLE_PAGE_SIZES = [20, 50, 100] as const;
export type ConsolePageSize = (typeof CONSOLE_PAGE_SIZES)[number];
export const DEFAULT_CONSOLE_PAGE_SIZE: ConsolePageSize = 20;

export function isConsolePageSize(value: number): value is ConsolePageSize {
  return (CONSOLE_PAGE_SIZES as readonly number[]).includes(value);
}

export function consoleTotalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function consolePagerRangeLabel({
  page,
  pageSize,
  shown,
  total,
  unit = "건",
}: Readonly<{
  page: number;
  pageSize: number;
  shown: number;
  total: number | null;
  unit?: string;
}>): string {
  const start = (page - 1) * pageSize + 1;
  if (total !== null) {
    if (total === 0) return "표시할 항목 없음";
    const end = Math.min(start + shown - 1, total);
    return `${start.toLocaleString("ko-KR")}-${end.toLocaleString("ko-KR")} / 전체 ${total.toLocaleString("ko-KR")}${unit}`;
  }
  if (shown === 0) return "표시할 항목 없음";
  // Whether a next page exists is shown by the enabled "다음 페이지" button.
  return `${start.toLocaleString("ko-KR")}-${(start + shown - 1).toLocaleString("ko-KR")}${unit}`;
}

export function ConsolePager({
  ariaLabel,
  page,
  pageSize,
  shown,
  total,
  hasNext = false,
  unit = "건",
  disabled = false,
  onPageChange,
  onPageSizeChange,
}: Readonly<{
  ariaLabel: string;
  page: number;
  pageSize: ConsolePageSize;
  shown: number;
  /** Matching rows across all pages; null for cursor lists without a server total. */
  total: number | null;
  /** Only used when total is null. */
  hasNext?: boolean;
  unit?: string;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: ConsolePageSize) => void;
}>) {
  const totalPages = total === null ? null : consoleTotalPages(total, pageSize);
  const canGoNext = totalPages === null ? hasNext : page < totalPages;
  return (
    <div aria-label={ariaLabel} className="civic-ledger-pagination console-pager" role="group">
      <span>{consolePagerRangeLabel({ page, pageSize, shown, total, unit })}</span>
      <button disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)} type="button">
        이전 페이지
      </button>
      <strong>{totalPages === null ? `${page}페이지` : `${page} / ${totalPages}`}</strong>
      <button
        disabled={disabled || !canGoNext}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        다음 페이지
      </button>
      <label className="console-pager-size">
        <span>페이지당</span>
        <select
          aria-label={`${ariaLabel} 페이지당 표시 개수`}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (isConsolePageSize(next)) onPageSizeChange(next);
          }}
          value={pageSize}
        >
          {CONSOLE_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}개
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * Pages an in-memory list (lists whose API already returns every row). The page
 * returns to 1 whenever `resetKey` changes (search text, filter, selected owner)
 * and is clamped when the list shrinks.
 */
export function useConsoleClientPage<T>(items: readonly T[], resetKey = "") {
  const [state, setState] = useState<{ key: string; page: number; pageSize: ConsolePageSize }>({
    key: resetKey,
    page: 1,
    pageSize: DEFAULT_CONSOLE_PAGE_SIZE,
  });
  const pageSize = state.pageSize;
  const totalPages = consoleTotalPages(items.length, pageSize);
  const page = Math.min(state.key === resetKey ? state.page : 1, totalPages);
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
  return {
    page,
    pageSize,
    pageItems,
    pagerProps: {
      page,
      pageSize,
      shown: pageItems.length,
      total: items.length,
      onPageChange: (next: number) =>
        setState({ key: resetKey, page: Math.min(Math.max(next, 1), totalPages), pageSize }),
      onPageSizeChange: (next: ConsolePageSize) =>
        setState({ key: resetKey, page: 1, pageSize: next }),
    },
  } as const;
}

/**
 * Remembers the cursor that opens each page of a cursor-paged API (chat lists
 * have next cursors but no total), so a list can move to the previous and next
 * page instead of appending rows.
 */
export function useConsoleCursorPages() {
  const [state, setState] = useState<{
    page: number;
    pageSize: ConsolePageSize;
    cursors: readonly (string | null)[];
  }>({ page: 1, pageSize: DEFAULT_CONSOLE_PAGE_SIZE, cursors: [null] });
  /** Record a successfully loaded page and the cursor of the page after it. */
  const commit = useCallback(
    (page: number, pageSize: ConsolePageSize, nextCursor: string | null) =>
      setState((current) => {
        const known = current.pageSize === pageSize ? current.cursors : [null];
        const cursors = known.slice(0, page);
        cursors[page] = nextCursor;
        return { page, pageSize, cursors };
      }),
    [],
  );
  return {
    page: state.page,
    pageSize: state.pageSize,
    cursorForPage: (page: number) => (page <= 1 ? null : (state.cursors[page - 1] ?? null)),
    commit,
  } as const;
}
