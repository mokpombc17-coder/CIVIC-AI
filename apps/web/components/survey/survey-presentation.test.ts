import { describe, expect, it } from "vitest";
import { getSurveyQuestionPresentation, SURVEY_QUESTION_PRESENTATION } from "./survey-presentation";

describe("survey presentation", () => {
  it("keeps Figma helper copy keyed by the stable question key", () => {
    expect(SURVEY_QUESTION_PRESENTATION["household.housing-tenure"].helperText).toBe(
      "현재 살고 계신 주택의 보유형태",
    );
    expect(SURVEY_QUESTION_PRESENTATION["socioeconomic.household-income"].helperText).toBe(
      "가구 연간소득 (이자소득 등 모든 수입 포함)",
    );
    expect(SURVEY_QUESTION_PRESENTATION["values.moral-foundation"].helperText).toBe(
      "A. 남에게 피해를 주지 않는 것\nB. 내가 속한 집단에서 규칙을 지키고 잘 뭉치는 것",
    );
    expect(SURVEY_QUESTION_PRESENTATION["politics.interest"].helperText).toBe(
      "평소 정치에 대한 관심 정도",
    );
    expect(SURVEY_QUESTION_PRESENTATION["media.news-sources"].helperText).toBe(
      "일상의 뉴스를 얻는 경로 (복수 선택 가능)",
    );
    expect(SURVEY_QUESTION_PRESENTATION["attitude.opinion-persistence"].helperText).toBe(
      "새로운 정보를 접했을 때 기존 생각을 유지하는 정도",
    );
    expect(SURVEY_QUESTION_PRESENTATION["wellbeing.income-satisfaction"].helperText).toBe(
      "현재의 소득에 대한 만족도",
    );
    expect(SURVEY_QUESTION_PRESENTATION["social.affective-distance"].helperText).toBe(
      "0점(전혀 호감이 가지 않는다) ~ 10점(매우 호감이 간다)",
    );
    expect(SURVEY_QUESTION_PRESENTATION["trust.local-government"].helperText).toBe(
      "기초·광역자치단체에 대한 신뢰 정도",
    );
    expect(SURVEY_QUESTION_PRESENTATION["media.daily-use-duration"].helperText).toBe(
      "하루 평균 이용 시간을 매체별로 선택해 주세요",
    );
    expect(SURVEY_QUESTION_PRESENTATION["media.video-content-topics"].title).toBe(
      "관심 주제 콘텐츠",
    );
    expect(SURVEY_QUESTION_PRESENTATION["lifestyle.risk-orientation"].helperText).toBe(
      "조심스러운 성향 ~ 모험을 즐기는 성향",
    );
  });

  it("returns no presentation override for an unknown question key", () => {
    expect(getSurveyQuestionPresentation("unknown-question")).toBeUndefined();
  });
});
