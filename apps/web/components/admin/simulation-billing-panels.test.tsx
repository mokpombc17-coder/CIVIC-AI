import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  readSimulationSection,
  SimulationBillingSection,
  SimulationSectionTabs,
} from "@/components/admin/simulation-billing-panels";

describe("simulation billing navigation", () => {
  it("운영자가 직접 다루는 세 섹션만 메뉴에 표시한다", () => {
    const html = renderToStaticMarkup(<SimulationSectionTabs active="run" />);

    expect(html).toContain("실행 관리");
    expect(html).toContain("공용 지갑");
    expect(html).toContain("사용량");
    expect(html).not.toContain("가격 정책");
    expect(html).not.toContain("근거 이관");
  });

  it("숨긴 관리 섹션 주소는 실행 관리로 돌아간다", () => {
    expect(readSimulationSection("policies")).toBe("run");
    expect(readSimulationSection("imports")).toBe("run");
    expect(readSimulationSection("wallet")).toBe("wallet");
    expect(readSimulationSection("usage")).toBe("usage");
  });

  it("공용 지갑에는 쿠폰 사용만 남기고 발급 UI를 표시하지 않는다", () => {
    const html = renderToStaticMarkup(<SimulationBillingSection section="wallet" />);

    expect(html).toContain("공용 지갑 요약");
    expect(html).toContain("쿠폰 사용");
    expect(html).toContain("지갑에 반영");
    expect(html).not.toContain("원화 쿠폰 만들기");
    expect(html).not.toContain("쿠폰 발급");
  });
});
