import surveyOptionLabelOverrides from "./survey-option-label-overrides.json";

export type SurveyQuestionPresentation = Readonly<{
  helperText: string;
  title?: string;
}>;

export type SurveyMatrixChoiceLayout = "family" | "media";

const SURVEY_OPTION_LABEL_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> =
  surveyOptionLabelOverrides;

const SURVEY_MATRIX_CHOICE_LAYOUTS: Readonly<Record<string, SurveyMatrixChoiceLayout>> = {
  "media.daily-use-duration": "media",
};

export const SURVEY_QUESTION_PRESENTATION = {
  "demographics.residence": {
    helperText: "행정구역 · 자치구 · 행정동을 순서대로 선택해 주세요",
  },
  "household.age-group-presence": {
    helperText: "가구원 중 해당 연령대가 있는지 선택해 주세요",
  },
  "household.housing-tenure": {
    helperText: "현재 살고 계신 주택의 보유형태",
  },
  "socioeconomic.occupation": {
    helperText: "귀하의 직업",
  },
  "socioeconomic.education": {
    helperText: "귀하의 최종 학력",
  },
  "socioeconomic.household-income": {
    helperText: "가구 연간소득 (이자소득 등 모든 수입 포함)",
  },
  "wellbeing.health-status": {
    helperText: "평소 생각하는 본인의 건강 상태",
  },
  "demographics.religion": {
    helperText: "현재 믿고 계신 종교",
  },
  "values.moral-foundation": {
    helperText: "A. 남에게 피해를 주지 않는 것\nB. 내가 속한 집단에서 규칙을 지키고 잘 뭉치는 것",
  },
  "politics.ideology": {
    helperText: "본인의 정치적 성향",
  },
  "politics.supported-party": {
    helperText: "현재 지지하고 있는 정당",
  },
  "politics.interest": {
    helperText: "평소 정치에 대한 관심 정도",
  },
  "media.news-sources": {
    helperText: "일상의 뉴스를 얻는 경로 (복수 선택 가능)",
  },
  "attitude.opinion-persistence": {
    helperText: "새로운 정보를 접했을 때 기존 생각을 유지하는 정도",
  },
  "wellbeing.income-satisfaction": {
    helperText: "현재의 소득에 대한 만족도",
  },
  "social.affective-distance": {
    helperText: "0점(전혀 호감이 가지 않는다) ~ 10점(매우 호감이 간다)",
  },
  "trust.society": {
    helperText: "우리 사회 전반에 대한 신뢰 정도",
  },
  "trust.local-government": {
    helperText: "기초·광역자치단체에 대한 신뢰 정도",
  },
  "trust.central-government": {
    helperText: "중앙정부에 대한 신뢰 정도",
  },
  "media.daily-use-duration": {
    helperText: "하루 평균 이용 시간을 매체별로 선택해 주세요",
  },
  "media.sns-use-frequency": {
    helperText: "SNS를 이용하는 빈도",
  },
  "media.ott-daily-duration": {
    helperText: "하루 평균 OTT 서비스 시청 시간",
  },
  "media.video-content-topics": {
    helperText: "탐색하는 동영상 콘텐츠 주제 (복수 선택 가능)",
    title: "관심 주제 콘텐츠",
  },
  "information.practice-type": {
    helperText: "일상에서 정보를 알게 되는 방식",
  },
  "lifestyle.risk-orientation": {
    helperText: "조심스러운 성향 ~ 모험을 즐기는 성향",
  },
} as const satisfies Record<string, SurveyQuestionPresentation>;

export function getSurveyQuestionPresentation(
  questionKey: string,
): SurveyQuestionPresentation | undefined {
  return (SURVEY_QUESTION_PRESENTATION as Record<string, SurveyQuestionPresentation>)[questionKey];
}

export function getSurveyMatrixOptionLabel(questionKey: string, apiLabel: string): string {
  return SURVEY_OPTION_LABEL_OVERRIDES[questionKey]?.[apiLabel] ?? apiLabel;
}

export function getSurveyMatrixChoiceLayout(questionKey: string): SurveyMatrixChoiceLayout {
  return SURVEY_MATRIX_CHOICE_LAYOUTS[questionKey] ?? "family";
}
