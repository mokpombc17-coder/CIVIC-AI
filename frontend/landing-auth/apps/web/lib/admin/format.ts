/** 관리자 화면 공용 표기 유틸 — 화면별 중복 정의를 대체한다. */

export function formatKrw(value: number | undefined | null): string {
  return value === undefined || value === null ? "-" : `${value.toLocaleString("ko-KR")}원`;
}

export function formatCount(value: number, unit: string): string {
  return `${value.toLocaleString("ko-KR")}${unit}`;
}
