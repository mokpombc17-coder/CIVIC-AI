// Count captions for admin lists. A list either knows its server-side total
// ("전체 N건 중 M건 표시") or only knows that more pages exist ("M건 표시 · 더 있음"),
// so a truncated first page is never presented as the whole list.

export type ListCountOptions = Readonly<{
  /** Rows currently shown (after any client-side filter). */
  shown: number;
  /** Rows matching on the server; null when the server does not report a total. */
  total?: number | null;
  /** The server has more pages that are not loaded yet. Only used without a total. */
  hasMore?: boolean;
  unit?: string;
}>;

export function listCountLabel({
  shown,
  total = null,
  hasMore = false,
  unit = "건",
}: ListCountOptions) {
  const count = (value: number) => `${value.toLocaleString("ko-KR")}${unit}`;
  if (total !== null) {
    return shown === total
      ? `전체 ${count(total)}`
      : `전체 ${count(total)} 중 ${count(shown)} 표시`;
  }
  return hasMore ? `${count(shown)} 표시 · 더 있음` : `${count(shown)} 표시`;
}
