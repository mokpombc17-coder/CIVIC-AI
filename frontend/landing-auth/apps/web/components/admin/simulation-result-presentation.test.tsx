import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SimulationResultDetail } from "@/lib/admin/simulation-contracts";
import { AnonymousPanelAttributes } from "./simulation-result-presentation";

describe("simulation result presentation", () => {
  it("renders only the anonymous attributes exposed by the slot-detail API", () => {
    const respondent = {
      schemaVersion: "CIVIC_TASK_SIMULATION_SLOT_DETAIL_V1",
      notice: "이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다.",
      resultSlot: 1,
      selectedOptionId: null,
      reason: null,
      demographics: {
        gender: "여성",
        ageGroup: "30대",
      },
    } as SimulationResultDetail;

    const html = renderToStaticMarkup(<AnonymousPanelAttributes respondent={respondent} />);

    expect(html).toContain("여성");
    expect(html).toContain("30대");
    expect(html).not.toContain("지역");
    expect(html).not.toContain("정치 성향");
  });
});
