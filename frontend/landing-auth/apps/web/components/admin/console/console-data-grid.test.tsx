import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConsoleDataGrid } from "./console-data-grid";

const rows = [{ id: "row-1", name: "첫 번째 행" }];
const columns = [{ field: "name", headerName: "이름" }] as const;

describe("ConsoleDataGrid", () => {
  it("행 클릭 동작이 있는 표에만 포인터 커서 클래스를 적용한다", () => {
    const clickable = renderToStaticMarkup(
      <ConsoleDataGrid
        ariaLabel="조회 가능한 표"
        columnDefs={columns}
        getRowId={(row) => row.id}
        onRowClicked={vi.fn()}
        rowData={rows}
      />,
    );
    const readOnly = renderToStaticMarkup(
      <ConsoleDataGrid
        ariaLabel="조회 전용 표"
        columnDefs={columns}
        getRowId={(row) => row.id}
        rowData={rows}
      />,
    );

    expect(clickable).toContain('class="console-grid is-row-clickable"');
    expect(readOnly).toContain('class="console-grid"');
    expect(readOnly).not.toContain("is-row-clickable");
  });
});
