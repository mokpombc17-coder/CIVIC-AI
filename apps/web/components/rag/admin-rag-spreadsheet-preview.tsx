"use client";

import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { errorMessage } from "@/lib/user-facing-message";

type SpreadsheetColumn = Readonly<{
  column_index: number;
  name: string;
  inferred_type: string;
}>;

type SpreadsheetSheet = Readonly<{
  sheet_id: string;
  sheet_index: number;
  name: string;
  row_count: number;
  columns: readonly SpreadsheetColumn[];
}>;

type SpreadsheetRow = Readonly<{
  row_number: number;
  values: readonly unknown[];
}>;

export function spreadsheetSheetsPath(documentId: string, versionId: string): string {
  return `/api/v1/rag/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/sheets`;
}

export function spreadsheetRowsPath(
  documentId: string,
  versionId: string,
  sheetId: string,
  page: number,
  pageSize: number,
): string {
  const query = new URLSearchParams({
    page: String(Math.max(1, Math.trunc(page))),
    page_size: String(Math.min(1_000, Math.max(1, Math.trunc(pageSize)))),
  });
  return `${spreadsheetSheetsPath(documentId, versionId)}/${encodeURIComponent(sheetId)}/rows?${query}`;
}

export function AdminRagSpreadsheetPreview({
  documentId,
  versionId,
}: Readonly<{ documentId: string; versionId: string }>) {
  const [sheets, setSheets] = useState<SpreadsheetSheet[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [rows, setRows] = useState<SpreadsheetRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [message, setMessage] = useState("표 구조를 불러오고 있습니다.");

  const loadRows = useCallback(
    async (sheetId: string, nextPage: number) => {
      const response = await authenticatedFetch(
        spreadsheetRowsPath(documentId, versionId, sheetId, nextPage, 100),
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("표 데이터를 불러오지 못했습니다.");
      const body = (await response.json()) as { items?: unknown; total_pages?: unknown };
      if (!Array.isArray(body.items)) throw new Error("표 데이터 형식이 올바르지 않습니다.");
      setRows(body.items as SpreadsheetRow[]);
      setPage(nextPage);
      setTotalPages(typeof body.total_pages === "number" ? body.total_pages : 0);
      setMessage("");
    },
    [documentId, versionId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void authenticatedFetch(spreadsheetSheetsPath(documentId, versionId), {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("시트 목록을 불러오지 못했습니다.");
          const body = (await response.json()) as { items?: unknown };
          if (!Array.isArray(body.items)) throw new Error("시트 목록 형식이 올바르지 않습니다.");
          const nextSheets = body.items as SpreadsheetSheet[];
          setSheets(nextSheets);
          const first = nextSheets[0];
          if (!first) {
            setMessage("표 데이터가 없습니다.");
            return;
          }
          setSelectedSheetId(first.sheet_id);
          await loadRows(first.sheet_id, 1);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setMessage(errorMessage(error, "표 데이터를 불러오지 못했습니다."));
          }
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [documentId, loadRows, versionId]);

  const selectedSheet = sheets.find((sheet) => sheet.sheet_id === selectedSheetId);
  return (
    <section className="civic-spreadsheet-preview">
      <header>
        <div>
          <strong>표 데이터 미리보기</strong>
          <small>읽기 전용</small>
        </div>
        {sheets.length > 1 ? (
          <label>
            <span className="sr-only">시트 선택</span>
            <select
              onChange={(event) => {
                const sheetId = event.target.value;
                setSelectedSheetId(sheetId);
                setMessage("표 데이터를 불러오고 있습니다.");
                void loadRows(sheetId, 1).catch((error: unknown) =>
                  setMessage(errorMessage(error, "표 데이터를 불러오지 못했습니다.")),
                );
              }}
              value={selectedSheetId}
            >
              {sheets.map((sheet) => (
                <option key={sheet.sheet_id} value={sheet.sheet_id}>
                  {sheet.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>
      {message ? (
        <p aria-live="polite">{message}</p>
      ) : selectedSheet ? (
        <div className="civic-table-scroll" role="region" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>행</th>
                {selectedSheet.columns.map((column) => (
                  <th key={column.column_index}>
                    {column.name || `열 ${column.column_index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.row_number}>
                  <th>{row.row_number}</th>
                  {selectedSheet.columns.map((column) => (
                    <td key={column.column_index}>
                      {formatSpreadsheetCell(row.values[column.column_index])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {totalPages > 1 ? (
        <footer>
          <button
            disabled={page <= 1}
            onClick={() => selectedSheetId && void loadRows(selectedSheetId, page - 1)}
            type="button"
          >
            이전
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => selectedSheetId && void loadRows(selectedSheetId, page + 1)}
            type="button"
          >
            다음
          </button>
        </footer>
      ) : null}
    </section>
  );
}

function formatSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
