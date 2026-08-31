import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  readSimulationSection,
  SimulationBillingSection,
  SimulationSectionTabs,
  USAGE_GRID_COLUMNS,
  usageGridRows,
  walletMetricItems,
} from "@/components/admin/simulation-billing-panels";

describe("simulation billing navigation", () => {
  it("운영자가 직접 다루는 세 섹션만 메뉴에 표시한다", () => {
    const html = renderToStaticMarkup(<SimulationSectionTabs active="run" />);

    expect(html).toContain("시뮬레이션 목록");
    expect(html).toContain("사용 내역");
    expect(html).toContain("등록");
    expect(html.indexOf("시뮬레이션 목록")).toBeLessThan(html.indexOf("사용 내역"));
    expect(html.indexOf("사용 내역")).toBeLessThan(html.indexOf("등록"));
    expect(html).not.toContain("실행 관리");
    expect(html).not.toContain("공용 지갑");
    expect(html).not.toContain(">사용량<");
    expect(html).not.toContain("가격 정책");
    expect(html).not.toContain("근거 이관");
  });

  it("숨긴 관리 섹션 주소는 시뮬레이션 목록으로 돌아간다", () => {
    expect(readSimulationSection("policies")).toBe("run");
    expect(readSimulationSection("imports")).toBe("run");
    expect(readSimulationSection("wallet")).toBe("wallet");
    expect(readSimulationSection("usage")).toBe("usage");
  });

  it("공용 지갑에는 쿠폰 사용만 남기고 발급 UI를 표시하지 않는다", () => {
    const html = renderToStaticMarkup(<SimulationBillingSection section="wallet" />);

    expect(html).toContain("쿠폰 사용");
    expect(html).toContain("지갑에 반영");
    expect(html).not.toContain("원화 쿠폰 만들기");
    expect(html).not.toContain("쿠폰 발급");
  });

  it("지갑 지표는 네 항목을 유지하고 실패·권한 상태를 구분해 표시한다", () => {
    const ready = walletMetricItems({
      status: "ready",
      wallet: {
        balanceKrw: 1_000_000,
        heldKrw: 10_000,
        availableKrw: 990_000,
        spentTodayKrw: 5_000,
        updatedAt: "2026-08-29T00:00:00Z",
      },
    });

    expect(ready.map((item) => item.label)).toEqual([
      "전체 잔액",
      "실행 보류액",
      "사용 가능액",
      "오늘 사용액",
    ]);
    expect(ready.map((item) => item.value)).toEqual([
      "1,000,000원",
      "10,000원",
      "990,000원",
      "5,000원",
    ]);
    expect(walletMetricItems({ status: "forbidden" }).map((item) => item.value)).toEqual([
      "권한 없음",
      "권한 없음",
      "권한 없음",
      "권한 없음",
    ]);
    expect(walletMetricItems({ status: "unavailable" })[0]?.value).toBe("확인 불가");
    expect(walletMetricItems({ status: "loading" })[0]?.value).toBe("확인 중");
  });

  it("사용량에는 과금에 필요한 공개 정보만 표시한다", () => {
    const html = renderToStaticMarkup(<SimulationBillingSection section="usage" />);

    expect(html).toContain("과금액");
    expect(html).toContain("처리한 페르소나");
    expect(html).toContain("CSV 내려받기");
    expect(html).not.toContain("서비스 부담액");
    expect(html).not.toContain("공급자 비용");
    expect(html).not.toContain(">모델<");
    expect(html).not.toContain(">부담액<");
  });

  it("사용량 표 열 정의는 공개 정산 정보만 다룬다", () => {
    expect(USAGE_GRID_COLUMNS.map((column) => column.headerName)).toEqual([
      "일자",
      "과업",
      "실행 관리자",
      "페르소나",
      "과금액",
    ]);

    const rows = usageGridRows([
      {
        day: "2026-08-30",
        taskTitle: "교통 정책",
        actorEmail: "admin@example.com",
        personaCount: 30,
        chargedKrw: 4_904,
      },
    ]);
    expect(rows[0]).toMatchObject({
      day: "2026-08-30",
      taskTitle: "교통 정책",
      actorEmail: "admin@example.com",
      personaLabel: "30명",
      chargedLabel: "4,904원",
    });
  });
});
