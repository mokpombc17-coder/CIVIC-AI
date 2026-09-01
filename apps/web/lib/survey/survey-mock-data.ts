import type {
  PublishedSurveyContent,
  SurveyOption,
  SurveyQuestion,
  SurveyQuestionGroup,
  SurveyQuestionSection,
  SurveyQuestionType,
  SurveyRule,
} from "./survey-model";

const EMPTY_RULE: SurveyRule = {
  minimumSelections: null,
  maximumSelections: null,
  maxLength: null,
  minimum: null,
  maximum: null,
  decimalAllowed: null,
  decimalScale: null,
  minimumLabel: null,
  maximumLabel: null,
};

export const SURVEY_MOCK_CONTENT: PublishedSurveyContent = {
  name: "AI시민의회 M패널 사용자 특성 기초설문 1회차",
  description: null,
  sections: [
    section("personal-information", "일반 개인정보", 1, [
      group("demographics.birth-year", "1", "출생연도", "귀하의 출생연도는 어떻게 되십니까?", 1, [
        question("demographics.birth-year", "value", "NUMBER", null, [], {
          minimum: 1900,
          maximum: 2026,
          decimalAllowed: false,
          decimalScale: 0,
        }),
      ]),
      group("demographics.gender", "2", "성별", "귀하의 성별은 어떻게 되십니까?", 2, [
        choice("demographics.gender", ["남성", "여성"]),
      ]),
      group(
        "demographics.residence",
        "3",
        "주소지",
        "귀하의 현재 주소지는 어디입니까? 읍/면까지 입력해 주십시오.",
        3,
        [question("demographics.residence", "value", "SHORT_TEXT", null, [], { maxLength: 200 })],
      ),
    ]),
    section("household-information", "가구 정보", 2, [
      group(
        "demographics.marital-status",
        "4",
        "혼인상태",
        "귀하의 결혼 여부는 어떻게 되십니까?",
        4,
        [choice("demographics.marital-status", ["미혼", "기혼", "기타"])],
      ),
      group(
        "household.age-group-presence",
        "5",
        "가족 구성",
        "귀댁의 가구원 중 다음 각 연령대에 해당하는 분이 있습니까?",
        5,
        ["영아", "유아", "초등", "중등", "고등", "실버"].map((label, index) =>
          choice(
            "household.age-group-presence",
            ["있음", "없음"],
            ["infant", "preschool", "elementary-school", "middle-school", "high-school", "senior"][
              index
            ]!,
            label,
            index + 1,
          ),
        ),
      ),
      group("household.has-children", "6", "자녀 유무", "귀하께서는 자녀가 있으십니까?", 6, [
        choice("household.has-children", ["예", "아니오"]),
      ]),
    ]),
    section("life-economy", "생활 · 경제", 3, [
      choiceGroup(
        "household.housing-tenure",
        "7",
        "주거형태",
        "귀하께서 현재 살고 계신 주택의 보유형태는 어떻게 되십니까?",
        7,
        ["자가(본인이나 가족의 소유)", "전세", "월세", "영구 임대", "사택", "기타"],
      ),
      choiceGroup(
        "socioeconomic.occupation",
        "8",
        "직업",
        "귀하의 직업은 다음 중 어디에 해당됩니까?",
        8,
        [
          "농/임/어업",
          "공무원(공기업 포함)",
          "교사/학원강사",
          "전문직",
          "경영직",
          "사무직",
          "생산/기술/노무직",
          "서비스/영업/판매직",
          "자영업",
          "프리랜서/자유직",
          "전업주부",
          "학생",
          "무직",
          "기타",
        ],
      ),
      choiceGroup("socioeconomic.education", "9", "학력", "귀하의 최종학력은 어떻게 되십니까?", 9, [
        "고졸 미만(초등/중/고등학교 재학 포함)",
        "고졸",
        "대학 재학",
        "대학 졸업",
        "대학원 재학",
        "대학원 졸업",
      ]),
      choiceGroup(
        "socioeconomic.household-income",
        "10",
        "가구소득",
        "귀하와 귀하의 가족이 벌어들이는 연간소득은 어느 정도입니까? 이자소득 등 각종 수입을 모두 포함하여 답변해 주십시오.",
        10,
        [
          "연간 1천만원 미만",
          "연간 1천만원 이상~3천만원 미만",
          "연간 3천만원 이상~5천만원 미만",
          "연간 5천만원 이상~7천만원 미만",
          "연간 7천만원 이상~1억원 미만",
          "연간 1억원 이상",
        ],
      ),
      choiceGroup(
        "wellbeing.health-status",
        "11",
        "건강 상태",
        "귀하께서는 평소 본인의 건강 상태가 어떻다고 생각하십니까?",
        11,
        ["매우 건강하다", "건강하다", "보통이다", "건강하지 못하다", "전혀 건강하지 못하다"],
      ),
      choiceGroup(
        "demographics.religion",
        "12",
        "종교",
        "귀하께서 믿고 계신 종교는 무엇입니까?",
        12,
        ["불교", "기독교(개신교)", "천주교(카톨릭)", "그 외", "종교 없음"],
      ),
    ]),
    section("values-politics", "가치 · 정치 성향", 4, [
      choiceGroup(
        "values.moral-foundation",
        "13",
        "도덕 기반 성향",
        "귀하는 다음 두 가지 가치 가운데 평소 자신의 생각과 가장 가까운 것은 무엇입니까?",
        13,
        [
          "A는 많이 신경 쓰지만, B는 덜 신경 쓴다.",
          "A와 B를 모두 많이 신경 쓴다.",
          "둘 다 어느 정도 신경 쓰지만, B를 조금 더 신경 쓴다.",
          "둘 다 크게 따지지 않는 편이다.",
        ],
      ),
      choiceGroup(
        "politics.ideology",
        "14",
        "정치 성향",
        "귀하의 정치적 성향은 어떻다고 생각하십니까?",
        14,
        ["매우 진보적", "다소 진보적", "중도", "다소 보수적", "매우 보수적"],
      ),
      choiceGroup(
        "politics.supported-party",
        "15",
        "지지정당",
        "귀하는 아래의 정당 가운데 어느 정당을 지지하고 계십니까?",
        15,
        [
          "더불어민주당",
          "국민의힘",
          "조국혁신당",
          "진보당",
          "개혁신당",
          "기본소득당",
          "사회민주당",
          "지지정당 없음",
        ],
      ),
      choiceGroup(
        "politics.interest",
        "16",
        "정치 관심도",
        "귀하께서는 평소 정치에 대해 어느 정도 관심을 가지고 계십니까?",
        16,
        ["매우 관심이 있다", "약간 관심이 있다", "별로 관심이 없다", "전혀 관심이 없다"],
      ),
    ]),
    section("media-opinion", "미디어 · 의견 성향", 5, [
      group(
        "media.news-sources",
        "17",
        "선호매체",
        "귀하께서는 일상의 뉴스를 어떤 경로를 통해 얻으십니까? 해당하는 경로를 모두 선택해 주십시오.",
        17,
        [
          multipleChoice(
            "media.news-sources",
            ["종이신문", "텔레비전", "라디오", "인터넷", "소셜미디어"],
            5,
          ),
        ],
      ),
      choiceGroup(
        "attitude.opinion-persistence",
        "18",
        "의견 고집 정도",
        "귀하는 다른 사람의 의견이나 새로운 정보를 접했을 때, 기존의 생각을 어느 정도 유지하는 편입니까?",
        18,
        [
          "쉽게 바꾸는 편이다",
          "바꾸는 편이다",
          "상황에 따라 다르다",
          "유지하는 편이다",
          "거의 바꾸지 않는 편이다",
        ],
      ),
      choiceGroup(
        "wellbeing.income-satisfaction",
        "19",
        "소득 만족도",
        "귀하께서는 현재의 소득에 대해 어느 정도 만족하십니까?",
        19,
        ["매우 만족", "약간 만족", "보통", "약간 불만족", "매우 불만족"],
      ),
    ]),
    section("social-institutional-trust", "사회 · 기관 신뢰", 6, [
      group(
        "social.affective-distance",
        "20",
        "집단별 감정적 거리",
        "다음 각 집단에 대해 귀하께서 느끼는 감정적 거리를 0점에서 10점 사이로 평가해 주십시오.",
        20,
        [
          ["different-political-orientation", "나와 정치적 성향이 다른 사람"],
          ["older-adults", "고령층"],
          ["youth", "청년층"],
          ["different-gender", "나와 성별이 다른 사람"],
          ["different-religion", "나와 종교가 다른 사람"],
          ["stranger", "처음 만난 낯선 사람"],
          ["foreign-resident", "국내 거주 외국인"],
        ].map(([key, label], index) =>
          question(
            "social.affective-distance",
            key!,
            "SCALE",
            label!,
            [],
            {
              minimum: 0,
              maximum: 10,
              minimumLabel: "전혀 호감이 가지 않는다",
              maximumLabel: "매우 호감이 간다",
            },
            index + 1,
          ),
        ),
      ),
      choiceGroup(
        "trust.society",
        "21",
        "사회 신뢰",
        "귀하께서는 우리 사회를 전반적으로 어느 정도 신뢰하십니까?",
        21,
        ["전혀 신뢰하지 않는다", "별로 신뢰하지 않는다", "약간 신뢰한다", "매우 신뢰한다"],
      ),
      choiceGroup(
        "trust.local-government",
        "22",
        "지방정부 신뢰도",
        "귀하는 지방정부(기초자치단체 및 광역자치단체)에 대해서 어느 정도 신뢰하십니까?",
        22,
        ["전혀 신뢰하지 않는다", "별로 신뢰하지 않는다", "약간 신뢰한다", "매우 신뢰한다"],
      ),
      choiceGroup(
        "trust.central-government",
        "23",
        "중앙정부 신뢰도",
        "귀하는 중앙정부에 대해서 어느 정도 신뢰하십니까?",
        23,
        ["전혀 신뢰하지 않는다", "별로 신뢰하지 않는다", "약간 신뢰한다", "매우 신뢰한다"],
      ),
    ]),
    section("media-information-habits", "매체 이용 · 정보 습관", 7, [
      group(
        "media.daily-use-duration",
        "24",
        "매체별 이용 시간",
        "귀하께서는 하루 평균 다음 매체를 얼마나 이용하십니까?",
        24,
        [
          ["live-tv", "TV 실방"],
          ["replay-tv", "TV 재방"],
          ["radio", "라디오"],
        ].map(([key, label], index) =>
          choice(
            "media.daily-use-duration",
            ["시청안함", "1시간 미만", "1시간 이상~3시간 미만", "3시간 이상"],
            key,
            label,
            index + 1,
          ),
        ),
      ),
      choiceGroup(
        "media.sns-use-frequency",
        "25-A",
        "SNS 이용 빈도",
        "귀하께서는 SNS를 얼마나 자주 이용하십니까?",
        25,
        [
          "매일 1회 이상",
          "주 5~6회",
          "주 3~4회",
          "주 1~2회",
          "월 2~3회",
          "월 1회 이하",
          "업로드는 하지 않고, 주로 다른 사람의 사진/동영상/글만 본다",
        ],
      ),
      choiceGroup(
        "media.ott-daily-duration",
        "25-B",
        "OTT 이용 시간",
        "귀하께서는 하루 평균 OTT 서비스를 얼마나 시청하십니까?",
        26,
        ["시청안함", "1시간 미만", "1시간 이상~3시간 미만", "3시간 이상"],
      ),
      group(
        "media.video-content-topics",
        "26",
        "관심 주제 콘텐츠 탐색",
        "귀하께서 탐색하시는 동영상 콘텐츠 주제를 모두 선택해 주십시오.",
        27,
        [
          multipleChoice(
            "media.video-content-topics",
            [
              "드라마/영화",
              "음악/댄스",
              "푸드/먹방/레시피",
              "뉴스/시사/정치",
              "게임",
              "스포츠경기 중계/다시보기",
              "예능/코미디/웃긴 동영상",
              "연예계 소식/연예인/가십",
              "여행",
              "뷰티/패션",
              "애완동물/동물",
              "운동/헬스/요가/홈트레이닝",
              "학습/강의/업무/사용법/배우기",
              "일상 및 토크(Vlog)",
              "경제/재테크",
              "인테리어",
              "자동차/교통수단",
            ],
            17,
          ),
        ],
      ),
      choiceGroup(
        "information.practice-type",
        "27",
        "정보 실천 유형",
        "평소 일상생활에서 여러 가지 정보를 알게 될 때, 귀하와 가장 가까운 방식은 무엇입니까?",
        28,
        [
          "궁금한 것이 생기면 직접 찾아보거나 관련 정보가 있을 만한 곳을 찾아가서 알게 되는 편이다",
          "특별히 정보를 찾으려 하지 않고, 평소 보던 매체에서 정보를 자연스럽게 알게 되는 편이다",
          "내가 직접 찾기보다, 가족·친구·지인 등이 알려주거나 보내준 정보를 통해 알게 되는 편이다",
        ],
      ),
      choiceGroup(
        "lifestyle.risk-orientation",
        "28",
        "생활양식",
        "귀하는 아래의 성향 가운데 어디에 가깝다고 생각하십니까?",
        29,
        [
          "나는 조심스럽다",
          "나는 조금 조심스러운 편이다",
          "나는 조심스러운 편도, 모험을 즐기는 편도 아니다",
          "나는 모험을 즐기는 편이다",
          "나는 모험을 즐긴다",
        ],
      ),
    ]),
  ],
};

function section(
  sectionKey: string,
  title: string,
  displayOrder: number,
  groups: readonly SurveyQuestionGroup[],
): SurveyQuestionSection {
  return { sectionKey, title, description: null, displayOrder, groups };
}

function group(
  groupKey: string,
  sourceNumber: string,
  title: string,
  prompt: string,
  displayOrder: number,
  questions: readonly SurveyQuestion[],
): SurveyQuestionGroup {
  return { groupKey, sourceNumber, title, prompt, description: null, displayOrder, questions };
}

function choiceGroup(
  groupKey: string,
  sourceNumber: string,
  title: string,
  prompt: string,
  displayOrder: number,
  labels: readonly string[],
): SurveyQuestionGroup {
  return group(groupKey, sourceNumber, title, prompt, displayOrder, [choice(groupKey, labels)]);
}

function choice(
  groupKey: string,
  labels: readonly string[],
  itemKey = "value",
  itemLabel: string | null = null,
  itemDisplayOrder = 1,
): SurveyQuestion {
  return question(groupKey, itemKey, "SINGLE_CHOICE", itemLabel, labels, {}, itemDisplayOrder);
}

function multipleChoice(
  groupKey: string,
  labels: readonly string[],
  maximumSelections: number,
): SurveyQuestion {
  return question(groupKey, "value", "MULTIPLE_CHOICE", null, labels, {
    minimumSelections: 1,
    maximumSelections,
  });
}

function question(
  groupKey: string,
  itemKey: string,
  type: SurveyQuestionType,
  itemLabel: string | null,
  optionLabels: readonly string[],
  rule: Partial<SurveyRule> = {},
  itemDisplayOrder = 1,
): SurveyQuestion {
  return {
    questionId: `${groupKey}:${itemKey}`,
    itemKey,
    itemLabel,
    itemDisplayOrder,
    type,
    prompt: itemLabel ?? groupKey,
    description: null,
    required: true,
    rule: { ...EMPTY_RULE, ...rule },
    options: optionLabels.map((label, index) => option(groupKey, itemKey, label, index)),
  };
}

function option(groupKey: string, itemKey: string, label: string, index: number): SurveyOption {
  const optionLocalKey = String.fromCharCode(65 + index);
  return {
    optionId: `${groupKey}:${itemKey}:${optionLocalKey}`,
    optionLocalKey,
    kind: "STANDARD",
    label,
    displayOrder: index + 1,
  };
}
