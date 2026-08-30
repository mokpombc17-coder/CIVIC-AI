"use client";

import { useEffect, useMemo, useState } from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GetRowIdParams,
  type RowClickedEvent,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

// Wireframe theme aligned to the --wf-* tokens in wireflow.css. Values are
// duplicated as literals because AG Grid resolves theme params at style
// injection time, before our stylesheet variables are guaranteed to exist.
const consoleGridTheme = themeQuartz.withParams({
  accentColor: "#286cf4",
  backgroundColor: "#ffffff",
  borderColor: "#cfd3d7",
  foregroundColor: "#101114",
  headerBackgroundColor: "#f4f6f8",
  headerTextColor: "#5d6670",
  fontFamily: '"Pretendard GOV", Pretendard, "Apple SD Gothic Neo", sans-serif',
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 700,
  rowHoverColor: "#edf3ff",
  selectedRowBackgroundColor: "#edf3ff",
  wrapperBorderRadius: 8,
  cellHorizontalPadding: 12,
});

export type ConsoleColumn<T> = ColDef<T>;

export function ConsoleDataGrid<T>({
  rowData,
  columnDefs,
  getRowId,
  onRowClicked,
  selectedRowId,
  height = 420,
  emptyText = "표시할 항목이 없습니다.",
  ariaLabel,
  gridProps,
}: Readonly<{
  rowData: readonly T[];
  columnDefs: ReadonlyArray<ConsoleColumn<T>>;
  getRowId: (row: T) => string;
  onRowClicked?: (row: T) => void;
  selectedRowId?: string | null;
  height?: number;
  emptyText?: string;
  ariaLabel: string;
  gridProps?: Partial<AgGridReactProps<T>>;
}>) {
  // AG Grid measures the DOM, so it only renders after mount; server-side
  // rendering (and renderToStaticMarkup in unit tests) gets a plain fallback.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const defaultColDef = useMemo<ColDef<T>>(
    () => ({
      flex: 1,
      minWidth: 90,
      sortable: true,
      resizable: false,
      suppressMovable: true,
      wrapText: false,
    }),
    [],
  );

  if (!mounted) {
    return (
      <div aria-label={ariaLabel} className="console-grid" role="region" style={{ height }}>
        <p className="console-status">목록을 준비하는 중입니다…</p>
      </div>
    );
  }

  return (
    <div aria-label={ariaLabel} className="console-grid" role="region" style={{ height }}>
      <AgGridReact<T>
        columnDefs={columnDefs as ColDef<T>[]}
        defaultColDef={defaultColDef}
        getRowClass={(params) =>
          selectedRowId != null && params.data && getRowId(params.data) === selectedRowId
            ? "is-console-selected"
            : undefined
        }
        getRowId={(params: GetRowIdParams<T>) => getRowId(params.data)}
        headerHeight={40}
        onRowClicked={(event: RowClickedEvent<T>) => {
          if (event.data && onRowClicked) onRowClicked(event.data);
        }}
        overlayNoRowsTemplate={`<span class="console-status">${emptyText}</span>`}
        rowData={rowData as T[]}
        rowHeight={44}
        suppressCellFocus
        theme={consoleGridTheme}
        {...gridProps}
      />
    </div>
  );
}
