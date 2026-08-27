import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SimulationResult } from "@/lib/admin/simulation-contracts";
import {
  AnonymousPanelAttributes,
  PublicSimulationEvidence,
} from "./simulation-result-presentation";

describe("simulation result presentation", () => {
  it("renders useful execution evidence without calibration policy internals", () => {
    const engine = {
      modelType: "public-response-model",
      calibration: {
        answerDistributionModel: "internal-answer-distribution-model",
        assignmentModel: "internal-assignment-model",
        assignedInformationPracticeCounts: { A: 2, B: 6, C: 2 },
      },
      externalInformation: {
        collectedDocumentCount: 158,
        documentCountsByNaverEndpoint: { news: 40, blog: 40, cafearticle: 38, webkr: 40 },
      },
      personaWorkers: 2,
      innerWorkers: 1,
    } as SimulationResult["engine"];

    const html = renderToStaticMarkup(<PublicSimulationEvidence engine={engine} />);

    expect(html).toContain("Naver 수집 문서");
    expect(html).toContain("자료 수집 요약");
    expect(html).not.toContain("internal-answer-distribution-model");
    expect(html).not.toContain("internal-assignment-model");
    expect(html).not.toContain("A / B / C");
    expect(html).not.toContain(">2 / 6 / 2<");
  });

  it("renders public panel attributes without its internal information classification", () => {
    const respondent = {
      panelMemberOrdinal: 1,
      selectedOptionId: null,
      reason: null,
      demographics: {
        gender: "여성",
        ageGroup: "30대",
        region: "서울",
        politicalIdeology: "중도",
        informationType: "C",
      },
    } as SimulationResult["respondents"][number];

    const html = renderToStaticMarkup(<AnonymousPanelAttributes respondent={respondent} />);

    expect(html).toContain("여성");
    expect(html).toContain("30대");
    expect(html).not.toContain("정보 유형");
    expect(html).not.toContain(">C<");
  });
});
