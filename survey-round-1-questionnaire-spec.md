# AI시민의회 M패널 사용자 특성 기초설문 1회차 명세

## 1. 문서 상태

```text
상태: 구현 기준 확정안
작성 기준일: 2026-09-01
Survey 회차: 1
강제 수준: REQUIRED
화면 Section 수: 7개
화면·정책 문항 수: 29개 Group
저장·제출 문항 수: 42개 Question
필수 응답: 아래 4개 선택 문항을 제외한 모든 Question
선택 문항: 11 건강 상태, 12 종교, 14 정치 성향, 15 지지정당 (민감정보, 동의 대상)
제출 정책: 1인 1회 제출, 제출 후 수정 불가, 서버 임시 저장 미지원
```

원문 기준:

```text
/Users/junseok/Downloads/AI시민의회_M패널_기초설문문항_추가문항_반영.pdf
PDF 페이지 수: 6
```

PDF의 1번부터 28번까지를 원본으로 사용한다. `25-A`, `25-B`는 서로 다른
응답을 요구하므로 별도 Group으로 취급하여 총 29개 Group이 된다.

PDF의 줄바꿈과 붙어 있는 공백은 읽기 좋게 정규화한다. 문항 또는 선택지의
의미는 변경하지 않는다. PDF에 완성된 의문문이 없는 3번 주소지는 구현 가능한
문장으로 보강한다.

---

## 2. 확정된 모델

```text
SurveyContentVersion
└── SurveyQuestionSection 7개
    └── SurveyQuestionGroup 29개
        └── SurveyQuestion 1개 이상, 총 42개

SurveyResponse
└── SurveyAnswer 42개
    ├── questionId
    └── 실제 사용자 응답
```

역추적 경로:

```text
SurveyResponse.responseId
→ SurveyResponse.roundId
→ SurveyResponse.contentVersionId
→ SurveyContentVersion
→ SurveyQuestionSection
→ SurveyQuestionGroup
→ SurveyQuestion.questionId
→ SurveyAnswer
→ 선택형인 경우 SurveyOption.optionId
```

발행된 `SurveyContentVersion`은 불변으로 유지한다. Answer에는 Group 제목,
질문 문구 또는 선택지 문구를 복제하지 않는다. 당시 문구와 선택지는
`contentVersionId`, `questionId`, `optionId`를 통해 복원한다.

---

## 3. 식별자와 순서

### Section

```text
sectionId          내용 버전별 불변 UUID
sectionLineageId   버전 간 동일 의미 Section을 연결하는 UUID
sectionKey         사람이 읽을 수 있는 안정적인 semantic key
title              Figma 표기의 Section 제목
description        현재 1회차는 모두 null
displayOrder       화면상 1부터 7까지의 순서
```

| 순서 | sectionKey | 제목 | 포함 Group 번호 |
|---:|---|---|---|
| 1 | `personal-information` | 일반 개인정보 | 1~3 |
| 2 | `household-information` | 가구 정보 | 4~6 |
| 3 | `life-economy` | 생활 · 경제 | 7~12 |
| 4 | `values-politics` | 가치 · 정치 성향 | 13~16 |
| 5 | `media-opinion` | 미디어 · 의견 성향 | 17~19 |
| 6 | `social-institutional-trust` | 사회 · 기관 신뢰 | 20~23 |
| 7 | `media-information-habits` | 매체 이용 · 정보 습관 | 24~29 |

Figma의 필수 동의·확인 페이지는 Survey Section과 응답 저장 범위에 포함하지
않고 운영 서버 협의 범위로 둔다.

### Group

```text
groupId            내용 버전별 불변 UUID
groupLineageId     버전 간 동일 의미 Group을 연결하는 UUID
groupKey           사람이 읽을 수 있는 안정적인 semantic key
displayOrder       화면상 1부터 29까지의 순서
sourceNumber       PDF의 1~28, 25-A, 25-B 번호
```

### Question

```text
questionId         내용 버전별 불변 UUID
questionLineageId  버전 간 동일 의미 Question을 연결하는 UUID
groupId            소속 Group UUID
itemKey            Group 안에서 안정적인 semantic key
itemLabel          표·행렬 UI의 행 이름, 단일 질문은 null 가능
itemDisplayOrder   Group 안에서 1부터 시작하는 순서
```

### Option

```text
optionId           내용 버전별 불변 UUID
optionLineageId    버전 간 동일 의미 Option을 연결하는 UUID
questionId         소속 Question UUID
optionLocalKey     Question 안에서만 유일한 로컬 코드(A, B, C, ...)
displayOrder       Question 안에서 1부터 시작하는 표시 순서
label              사용자에게 표시하는 선택지 문구
```

문서의 구현 식별자는 다음 형식을 사용한다.

```text
questionSemanticKey = groupKey + "/" + itemKey
optionSemanticKey   = questionSemanticKey + "/" + optionLocalKey
```

단일 질문 Group은 `itemKey=value`를 사용한다. `groupKey`와 `itemKey`는
영속 식별자 자체가 아니라 UUID 생성·운영 관리·로그 검색을 돕는 semantic key다.
`optionLocalKey`는 전역 semantic key가 아니라 Question에 종속된 로컬 식별자다.
따라서 `A` 자체는 독립적인 Option을 뜻하지 않으며, 예를 들어
`politics.interest/value/A`가 하나의 완전한 Option semantic key가 된다.

`optionSemanticKey`는 조회·fixture·로그에서 조합해 사용하는 파생값이며 별도 컬럼으로
중복 저장하지 않는다. `optionLocalKey`와 `displayOrder`는 서로 다른 개념이다.
표시 순서를 바꾸더라도 로컬 키와 의미는 유지하고, 동일한 로컬 키를 다른 의미의
선택지에 재사용하지 않는다. 1회차는 `A`부터 순서대로 부여하고, 26개를 초과하는
경우 `AA`, `AB`처럼 확장할 수 있다.

fixture에서 결정적 UUID가 필요하면 다음 입력으로 생성한다.

```text
optionId        = UUIDv5(contentVersionId + questionSemanticKey + optionLocalKey)
optionLineageId = UUIDv5(questionLineageId + optionLocalKey)
```

---

## 4. 질문 및 답안 타입

| Question type | 제출 값 |
|---|---|
| `SINGLE_CHOICE` | `selection.optionId` |
| `MULTIPLE_CHOICE` | `selections[].optionId` |
| `SHORT_TEXT` | `text` |
| `NUMBER` | `number` |
| `SCALE` | `scale` |

`dropdown`, radio, checkbox, 표 형태의 scale은 Frontend 표시 방식이다. 별도
Question type으로 저장하지 않는다.

---

## 5. Group 및 Question 개요

| 화면 순서 | 원문 번호 | groupKey | 제목 | Question 수 | 타입 |
|---:|---|---|---|---:|---|
| 1 | 1 | `demographics.birth-year` | 출생연도 | 1 | `NUMBER` |
| 2 | 2 | `demographics.gender` | 성별 | 1 | `SINGLE_CHOICE` |
| 3 | 3 | `demographics.residence` | 주소지 | 1 | `SHORT_TEXT` |
| 4 | 4 | `demographics.marital-status` | 혼인상태 | 1 | `SINGLE_CHOICE` |
| 5 | 5 | `household.age-group-presence` | 가족 구성 | 6 | `SINGLE_CHOICE` |
| 6 | 6 | `household.has-children` | 자녀 유무 | 1 | `SINGLE_CHOICE` |
| 7 | 7 | `household.housing-tenure` | 주거형태 | 1 | `SINGLE_CHOICE` |
| 8 | 8 | `demographics.occupation` | 직업 | 1 | `SINGLE_CHOICE` |
| 9 | 9 | `demographics.education` | 학력 | 1 | `SINGLE_CHOICE` |
| 10 | 10 | `household.annual-income` | 가구소득 | 1 | `SINGLE_CHOICE` |
| 11 | 11 | `health.self-rated-status` | 건강 상태 | 1 | `SINGLE_CHOICE` |
| 12 | 12 | `values.religion` | 종교 | 1 | `SINGLE_CHOICE` |
| 13 | 13 | `values.moral-foundation` | 도덕 기반 성향 | 1 | `SINGLE_CHOICE` |
| 14 | 14 | `politics.ideology` | 정치 성향 | 1 | `SINGLE_CHOICE` |
| 15 | 15 | `politics.supported-party` | 지지정당 | 1 | `SINGLE_CHOICE` |
| 16 | 16 | `politics.interest` | 정치 관심도 | 1 | `SINGLE_CHOICE` |
| 17 | 17 | `media.news-sources` | 선호매체 | 1 | `MULTIPLE_CHOICE` |
| 18 | 18 | `attitude.opinion-persistence` | 의견 고집 정도 | 1 | `SINGLE_CHOICE` |
| 19 | 19 | `household.income-satisfaction` | 소득 만족도 | 1 | `SINGLE_CHOICE` |
| 20 | 20 | `social.affective-distance` | 집단별 감정적 거리 | 7 | `SCALE` |
| 21 | 21 | `social.general-trust` | 사회 신뢰 | 1 | `SINGLE_CHOICE` |
| 22 | 22 | `institutions.local-government-trust` | 지방정부 신뢰도 | 1 | `SINGLE_CHOICE` |
| 23 | 23 | `institutions.central-government-trust` | 중앙정부 신뢰도 | 1 | `SINGLE_CHOICE` |
| 24 | 24 | `media.daily-use-duration` | 매체별 이용 시간 | 3 | `SINGLE_CHOICE` |
| 25 | 25-A | `media.sns-use-frequency` | SNS 이용 빈도 | 1 | `SINGLE_CHOICE` |
| 26 | 25-B | `media.ott-daily-duration` | OTT 이용 시간 | 1 | `SINGLE_CHOICE` |
| 27 | 26 | `media.video-content-topics` | 관심 주제 콘텐츠 탐색 | 1 | `MULTIPLE_CHOICE` |
| 28 | 27 | `information.discovery-style` | 정보 실천 유형 | 1 | `SINGLE_CHOICE` |
| 29 | 28 | `attitude.risk-orientation` | 생활양식 | 1 | `SINGLE_CHOICE` |

합계 검증:

```text
단일 Question Group 26개 × 1 = 26
가족 구성                       = 6
집단별 감정적 거리              = 7
매체별 이용 시간                = 3
총 Question                     = 42
```

---

## 6. 상세 콘텐츠 명세

### 6.1 출생연도

```text
sourceNumber: 1
groupKey: demographics.birth-year
title: 출생연도
prompt: 귀하의 출생연도는 어떻게 되십니까?
```

| itemKey | type | rule |
|---|---|---|
| `value` | `NUMBER` | 정수, minimum=1900, maximum=2026, decimalAllowed=false, decimalScale=0 |

Frontend는 `minimum`부터 `maximum`까지의 연도를 생성해 dropdown으로 표시한다.
Backend는 연도별 SurveyOption을 저장하거나 반환하지 않는다. 1회차 발행 콘텐츠는
2026년을 상한으로 고정하며 상한 변경은 새 콘텐츠 버전으로 발행한다.

### 6.2 성별

```text
sourceNumber: 2
groupKey: demographics.gender
title: 성별
prompt: 귀하의 성별은 어떻게 되십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 남성 |
| `B` | 2 | 여성 |

### 6.3 주소지

```text
sourceNumber: 3
groupKey: demographics.residence
title: 주소지
prompt: 귀하의 현재 주소지는 어디입니까? 읍/면까지 입력해 주십시오.
type: SHORT_TEXT
rule.maxLength: 200
```

제출 값은 공백이 아닌 문자열이다. 상세 번지 주소가 아니라 읍/면까지의
정규화된 주소지 또는 행정구역 선택 UI가 반환하는 표준 문자열을 저장한다.

### 6.4 혼인상태

```text
sourceNumber: 4
groupKey: demographics.marital-status
title: 혼인상태
prompt: 귀하의 결혼 여부는 어떻게 되십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 미혼 |
| `B` | 2 | 기혼 |
| `C` | 3 | 기타 |

`기타`는 PDF의 일반 선택지이며 직접 입력을 요구하는 `OTHER` kind가 아니다.

### 6.5 가족 구성

```text
sourceNumber: 5
groupKey: household.age-group-presence
title: 가족 구성
prompt: 귀댁의 가구원 중 다음 각 연령대에 해당하는 분이 있습니까?
Question type: SINGLE_CHOICE
각 Question의 options: A=있음, B=없음
```

| itemDisplayOrder | itemKey | itemLabel | 원자 Question prompt |
|---:|---|---|---|
| 1 | `infant` | 영아 | 가구원 중 영아에 해당하는 분이 있습니까? |
| 2 | `preschool` | 유아 | 가구원 중 유아에 해당하는 분이 있습니까? |
| 3 | `elementary-school` | 초등 | 가구원 중 초등학생에 해당하는 분이 있습니까? |
| 4 | `middle-school` | 중등 | 가구원 중 중학생에 해당하는 분이 있습니까? |
| 5 | `high-school` | 고등 | 가구원 중 고등학생에 해당하는 분이 있습니까? |
| 6 | `senior` | 실버 | 가구원 중 실버 연령대에 해당하는 분이 있습니까? |

각 Question은 서로 다른 `questionId`와 서로 다른 있음/없음 `optionId`를 가진다.
`A`와 `B`는 각 Question 안에서 반복 사용할 수 있지만 서로 다른 Option 행이다.

### 6.6 자녀 유무

```text
sourceNumber: 6
groupKey: household.has-children
title: 자녀 유무
prompt: 귀하께서는 자녀가 있으십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 예 |
| `B` | 2 | 아니오 |

### 6.7 주거형태

```text
sourceNumber: 7
groupKey: household.housing-tenure
title: 주거형태
prompt: 귀하께서 현재 살고 계신 주택의 보유형태는 어떻게 되십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 자가(본인이나 가족의 소유) |
| `B` | 2 | 전세 |
| `C` | 3 | 월세 |
| `D` | 4 | 영구 임대 |
| `E` | 5 | 사택 |
| `F` | 6 | 기타 |

`기타`는 일반 선택지이며 직접 입력을 요구하지 않는다.

### 6.8 직업

```text
sourceNumber: 8
groupKey: demographics.occupation
title: 직업
prompt: 귀하의 직업은 다음 중 어디에 해당됩니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 농/임/어업 |
| `B` | 2 | 공무원(공기업 포함) |
| `C` | 3 | 교사/학원강사 |
| `D` | 4 | 전문직 |
| `E` | 5 | 경영직 |
| `F` | 6 | 사무직 |
| `G` | 7 | 생산/기술/노무직 |
| `H` | 8 | 서비스/영업/판매직 |
| `I` | 9 | 자영업 |
| `J` | 10 | 프리랜서/자유직 |
| `K` | 11 | 전업주부 |
| `L` | 12 | 학생 |
| `M` | 13 | 무직 |
| `N` | 14 | 기타 |

### 6.9 학력

```text
sourceNumber: 9
groupKey: demographics.education
title: 학력
prompt: 귀하의 최종학력은 어떻게 되십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 고졸 미만(초등/중/고등학교 재학 포함) |
| `B` | 2 | 고졸 |
| `C` | 3 | 대학 재학 |
| `D` | 4 | 대학 졸업 |
| `E` | 5 | 대학원 재학 |
| `F` | 6 | 대학원 졸업 |

### 6.10 가구소득

```text
sourceNumber: 10
groupKey: household.annual-income
title: 가구소득
prompt: 귀하와 귀하의 가족이 벌어들이는 연간소득은 어느 정도입니까? 이자소득 등 각종 수입을 모두 포함하여 답변해 주십시오.
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 연간 1천만원 미만 |
| `B` | 2 | 연간 1천만원 이상~3천만원 미만 |
| `C` | 3 | 연간 3천만원 이상~5천만원 미만 |
| `D` | 4 | 연간 5천만원 이상~7천만원 미만 |
| `E` | 5 | 연간 7천만원 이상~1억원 미만 |
| `F` | 6 | 연간 1억원 이상 |

### 6.11 건강 상태

```text
sourceNumber: 11
groupKey: health.self-rated-status
title: 건강 상태
prompt: 귀하께서는 평소 본인의 건강 상태가 어떻다고 생각하십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 매우 건강하다 |
| `B` | 2 | 건강하다 |
| `C` | 3 | 보통이다 |
| `D` | 4 | 건강하지 못하다 |
| `E` | 5 | 전혀 건강하지 못하다 |

### 6.12 종교

```text
sourceNumber: 12
groupKey: values.religion
title: 종교
prompt: 귀하께서 믿고 계신 종교는 무엇입니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 불교 |
| `B` | 2 | 기독교(개신교) |
| `C` | 3 | 천주교(카톨릭) |
| `D` | 4 | 그 외 |
| `E` | 5 | 종교 없음 |

### 6.13 도덕 기반 성향

```text
sourceNumber: 13
groupKey: values.moral-foundation
title: 도덕 기반 성향
prompt: 귀하는 다음 두 가지 가치 가운데 평소 자신의 생각과 가장 가까운 것은 무엇입니까?
description:
  A. 남에게 피해를 주지 않는 것
  B. 내가 속한 집단에서 규칙을 지키고 잘 뭉치는 것
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | A는 많이 신경 쓰지만, B는 덜 신경 쓴다. |
| `B` | 2 | A와 B를 모두 많이 신경 쓴다. |
| `C` | 3 | 둘 다 어느 정도 신경 쓰지만, B를 조금 더 신경 쓴다. |
| `D` | 4 | 둘 다 크게 따지지 않는 편이다. |

### 6.14 정치 성향

```text
sourceNumber: 14
groupKey: politics.ideology
title: 정치 성향
prompt: 귀하의 정치적 성향은 어떻다고 생각하십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 매우 진보적 |
| `B` | 2 | 다소 진보적 |
| `C` | 3 | 중도 |
| `D` | 4 | 다소 보수적 |
| `E` | 5 | 매우 보수적 |

### 6.15 지지정당

```text
sourceNumber: 15
groupKey: politics.supported-party
title: 지지정당
prompt: 귀하는 아래의 정당 가운데 어느 정당을 지지하고 계십니까?
description: 순서는 의석 수입니다.
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 더불어민주당 |
| `B` | 2 | 국민의힘 |
| `C` | 3 | 조국혁신당 |
| `D` | 4 | 진보당 |
| `E` | 5 | 개혁신당 |
| `F` | 6 | 기본소득당 |
| `G` | 7 | 사회민주당 |
| `H` | 8 | 지지정당 없음 |

정당 목록 또는 의미가 바뀌면 기존 발행본을 수정하지 않고 새 콘텐츠 버전을
발행한다. 같은 정당의 선택지는 동일한 `optionLineageId`를 유지한다.

### 6.16 정치 관심도

```text
sourceNumber: 16
groupKey: politics.interest
title: 정치 관심도
prompt: 귀하께서는 평소 정치에 대해 어느 정도 관심을 가지고 계십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 매우 관심이 있다 |
| `B` | 2 | 약간 관심이 있다 |
| `C` | 3 | 별로 관심이 없다 |
| `D` | 4 | 전혀 관심이 없다 |

### 6.17 선호매체

```text
sourceNumber: 17
groupKey: media.news-sources
title: 선호매체
prompt: 귀하께서는 일상의 뉴스를 어떤 경로를 통해 얻으십니까? 해당하는 경로를 모두 선택해 주십시오.
type: MULTIPLE_CHOICE
rule.minimumSelections: 1
rule.maximumSelections: 5
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 종이신문 |
| `B` | 2 | 텔레비전 |
| `C` | 3 | 라디오 |
| `D` | 4 | 인터넷 |
| `E` | 5 | 소셜미디어 |

### 6.18 의견 고집 정도

```text
sourceNumber: 18
groupKey: attitude.opinion-persistence
title: 의견 고집 정도
prompt: 귀하는 다른 사람의 의견이나 새로운 정보를 접했을 때, 기존의 생각을 어느 정도 유지하는 편입니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 쉽게 바꾸는 편이다 |
| `B` | 2 | 바꾸는 편이다 |
| `C` | 3 | 상황에 따라 다르다 |
| `D` | 4 | 유지하는 편이다 |
| `E` | 5 | 거의 바꾸지 않는 편이다 |

### 6.19 소득 만족도

```text
sourceNumber: 19
groupKey: household.income-satisfaction
title: 소득 만족도
prompt: 귀하께서는 현재의 소득에 대해 어느 정도 만족하십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 매우 만족 |
| `B` | 2 | 약간 만족 |
| `C` | 3 | 보통 |
| `D` | 4 | 약간 불만족 |
| `E` | 5 | 매우 불만족 |

### 6.20 집단별 감정적 거리

```text
sourceNumber: 20
groupKey: social.affective-distance
title: 집단별 감정적 거리
prompt: 다음 각 집단에 대해 귀하께서 느끼는 감정적 거리를 0점에서 10점 사이로 평가해 주십시오.
Question type: SCALE
공통 rule: minimum=0, maximum=10
minimumLabel: 전혀 호감이 가지 않는다
maximumLabel: 매우 호감이 간다
```

| itemDisplayOrder | itemKey | itemLabel |
|---:|---|---|
| 1 | `different-political-orientation` | 나와 정치적 성향이 다른 사람 |
| 2 | `older-adults` | 고령층 |
| 3 | `youth` | 청년층 |
| 4 | `different-gender` | 나와 성별이 다른 사람 |
| 5 | `different-religion` | 나와 종교가 다른 사람 |
| 6 | `stranger` | 처음 만난 낯선 사람 |
| 7 | `foreign-resident` | 국내 거주 외국인 |

각 항목은 별도의 `questionId`와 하나의 정수 `scale` 답안을 가진다.

### 6.21 사회 신뢰

```text
sourceNumber: 21
groupKey: social.general-trust
title: 사회 신뢰
prompt: 귀하께서는 우리 사회를 전반적으로 어느 정도 신뢰하십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 전혀 신뢰하지 않는다 |
| `B` | 2 | 별로 신뢰하지 않는다 |
| `C` | 3 | 약간 신뢰한다 |
| `D` | 4 | 매우 신뢰한다 |

### 6.22 지방정부 신뢰도

```text
sourceNumber: 22
groupKey: institutions.local-government-trust
title: 지방정부 신뢰도
prompt: 귀하는 지방정부(기초자치단체 및 광역자치단체)에 대해서 어느 정도 신뢰하십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 전혀 신뢰하지 않는다 |
| `B` | 2 | 별로 신뢰하지 않는다 |
| `C` | 3 | 약간 신뢰한다 |
| `D` | 4 | 매우 신뢰한다 |

### 6.23 중앙정부 신뢰도

```text
sourceNumber: 23
groupKey: institutions.central-government-trust
title: 중앙정부 신뢰도
prompt: 귀하는 중앙정부에 대해서 어느 정도 신뢰하십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 전혀 신뢰하지 않는다 |
| `B` | 2 | 별로 신뢰하지 않는다 |
| `C` | 3 | 약간 신뢰한다 |
| `D` | 4 | 매우 신뢰한다 |

### 6.24 매체별 이용 시간

```text
sourceNumber: 24
groupKey: media.daily-use-duration
title: 매체별 이용 시간
prompt: 귀하께서는 하루 평균 다음 매체를 얼마나 이용하십니까?
Question type: SINGLE_CHOICE
```

| itemDisplayOrder | itemKey | itemLabel |
|---:|---|---|
| 1 | `live-tv` | TV 실방 |
| 2 | `replay-tv` | TV 재방 |
| 3 | `radio` | 라디오 |

공통 선택지:

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 시청안함 |
| `B` | 2 | 1시간 미만 |
| `C` | 3 | 1시간 이상~3시간 미만 |
| `D` | 4 | 3시간 이상 |

각 항목은 서로 다른 `questionId`와 서로 다른 `optionId`를 가진다.

### 6.25 SNS 이용 빈도

```text
sourceNumber: 25-A
groupKey: media.sns-use-frequency
title: SNS 이용 빈도
prompt: 귀하께서는 SNS를 얼마나 자주 이용하십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 매일 1회 이상 |
| `B` | 2 | 주 5~6회 |
| `C` | 3 | 주 3~4회 |
| `D` | 4 | 주 1~2회 |
| `E` | 5 | 월 2~3회 |
| `F` | 6 | 월 1회 이하 |
| `G` | 7 | 업로드는 하지 않고, 주로 다른 사람의 사진/동영상/글만 본다 |

### 6.26 OTT 이용 시간

```text
sourceNumber: 25-B
groupKey: media.ott-daily-duration
title: OTT 이용 시간
prompt: 귀하께서는 하루 평균 OTT 서비스를 얼마나 시청하십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 시청안함 |
| `B` | 2 | 1시간 미만 |
| `C` | 3 | 1시간 이상~3시간 미만 |
| `D` | 4 | 3시간 이상 |

### 6.27 관심 주제 콘텐츠 탐색

```text
sourceNumber: 26
groupKey: media.video-content-topics
title: 관심 주제 콘텐츠 탐색
prompt: 귀하께서 탐색하시는 동영상 콘텐츠 주제를 모두 선택해 주십시오.
type: MULTIPLE_CHOICE
rule.minimumSelections: 1
rule.maximumSelections: 17
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 드라마/영화 |
| `B` | 2 | 음악/댄스 |
| `C` | 3 | 푸드/먹방/레시피 |
| `D` | 4 | 뉴스/시사/정치 |
| `E` | 5 | 게임 |
| `F` | 6 | 스포츠경기 중계/다시보기 |
| `G` | 7 | 예능/코미디/웃긴 동영상 |
| `H` | 8 | 연예계 소식/연예인/가십 |
| `I` | 9 | 여행 |
| `J` | 10 | 뷰티/패션 |
| `K` | 11 | 애완동물/동물 |
| `L` | 12 | 운동/헬스/요가/홈트레이닝 |
| `M` | 13 | 학습/강의/업무/사용법/배우기 |
| `N` | 14 | 일상 및 토크(Vlog) |
| `O` | 15 | 경제/재테크 |
| `P` | 16 | 인테리어 |
| `Q` | 17 | 자동차/교통수단 |

### 6.28 정보 실천 유형

```text
sourceNumber: 27
groupKey: information.discovery-style
title: 정보 실천 유형
prompt: 평소 일상생활에서 여러 가지 정보를 알게 될 때, 귀하와 가장 가까운 방식은 무엇입니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 궁금한 것이 생기면 직접 찾아보거나 관련 정보가 있을 만한 곳을 찾아가서 알게 되는 편이다 |
| `B` | 2 | 특별히 정보를 찾으려 하지 않고, 평소 보던 매체에서 정보를 자연스럽게 알게 되는 편이다 |
| `C` | 3 | 내가 직접 찾기보다, 가족·친구·지인 등이 알려주거나 보내준 정보를 통해 알게 되는 편이다 |

### 6.29 생활양식

```text
sourceNumber: 28
groupKey: attitude.risk-orientation
title: 생활양식
prompt: 귀하는 아래의 성향 가운데 어디에 가깝다고 생각하십니까?
type: SINGLE_CHOICE
```

| optionLocalKey | displayOrder | label |
|---|---:|---|
| `A` | 1 | 나는 조심스럽다 |
| `B` | 2 | 나는 조금 조심스러운 편이다 |
| `C` | 3 | 나는 조심스러운 편도, 모험을 즐기는 편도 아니다 |
| `D` | 4 | 나는 모험을 즐기는 편이다 |
| `E` | 5 | 나는 모험을 즐긴다 |

---

## 7. 조회 계약

현재 Survey 조회는 7개 Section 아래에 29개 Group을 순서대로 반환한다.
사용자 API는 제출에 필요한 `questionId`, `optionId`만 엔티티 ID로 노출한다.
Section·Group ID와 모든 lineage ID는 내부 추적용이므로 반환하지 않는다.

```json
{
  "round": {
    "id": "round-uuid",
    "number": 1
  },
  "content": {
    "id": "content-version-uuid",
    "versionNumber": 1,
    "sections": [
      {
        "sectionKey": "household-information",
        "displayOrder": 2,
        "title": "가구 정보",
        "description": null,
        "groups": [
          {
            "groupKey": "household.age-group-presence",
            "sourceNumber": "5",
            "displayOrder": 5,
            "title": "가족 구성",
            "prompt": "귀댁의 가구원 중 다음 각 연령대에 해당하는 분이 있습니까?",
            "description": null,
            "questions": [
              {
                "questionId": "question-uuid",
                "itemKey": "infant",
                "itemLabel": "영아",
                "itemDisplayOrder": 1,
                "type": "SINGLE_CHOICE",
                "required": true,
                "rule": {},
                "options": [
                  {
                    "optionId": "family-infant-option-a-uuid",
                    "optionLocalKey": "A",
                    "displayOrder": 1,
                    "label": "있음"
                  },
                  {
                    "optionId": "family-infant-option-b-uuid",
                    "optionLocalKey": "B",
                    "displayOrder": 2,
                    "label": "없음"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  "submitted": false
}
```

정렬 순서:

```text
groups: displayOrder ASC
questions: itemDisplayOrder ASC
options: displayOrder ASC
```

과거 응답 상세도 Response가 참조한 불변 `contentVersionId`의 동일한 Group 구조를
반환한다. 현재 회차 콘텐츠로 과거 답안을 해석하지 않는다.

---

## 8. 제출 계약

제출 요청에는 Group 정보를 포함하지 않는다. Answer는 `questionId`와 실제 값만
전달한다.

```json
{
  "roundId": "round-uuid",
  "answers": [
    {
      "questionId": "birth-year-question-uuid",
      "type": "NUMBER",
      "number": 1994
    },
    {
      "questionId": "family-infant-question-uuid",
      "type": "SINGLE_CHOICE",
      "selection": {
        "optionId": "family-infant-option-a-uuid",
        "inputText": null
      }
    },
    {
      "questionId": "affective-distance-politics-question-uuid",
      "type": "SCALE",
      "scale": 7
    },
    {
      "questionId": "residence-question-uuid",
      "type": "SHORT_TEXT",
      "text": "정규화된 읍/면 단위 주소지 문자열"
    }
  ]
}
```

클라이언트는 조회 응답의 `optionLocalKey`를 화면·테스트 식별에 사용할 수 있지만,
제출과 Answer 영속화에는 `optionId`만 사용한다. 과거 선택의 로컬 키와 문구는
Answer가 가리키는 불변 ContentVersion의 Option 행에서 역추적한다.

서버 검증:

1. 제출 `roundId`가 잠근 현재 ACTIVE 1회차와 일치한다.
2. Response와 Round가 같은 `contentVersionId`를 사용한다.
3. 필수 Question에 정확히 하나씩 Answer가 존재한다. 선택 문항
   (`wellbeing.health-status`(11), `demographics.religion`(12), `politics.ideology`(14), `politics.supported-party`(15))은 생략할 수 있으며, 어느 Question에도 Answer가 두 개 이상
   존재하지 않는다.
   선택 문항에 하나 이상 답했으면 `consentReceiptId`가 있어야 하고, 하나도 답하지
   않았으면 없어야 한다.
4. 알 수 없는 `questionId`와 중복 `questionId`를 거부한다.
5. Question type과 Answer type이 일치한다.
6. 선택형 `optionId`가 해당 Question과 ContentVersion에 속한다.
7. 출생연도는 1900~2026 범위의 정수다.
8. 감정적 거리 7개는 각각 0~10 범위의 정수다.
9. 선호매체는 1~5개, 관심 콘텐츠는 1~17개의 중복 없는 선택이다.
10. 주소지 문자열은 정규화 후 공백이 아니며 최대 200자다.

저장 정책:

```text
UNIQUE(user_id, round_id)
42개 Answer와 모든 Selection을 단일 트랜잭션으로 저장
최종 제출 후 수정·재제출 API 제공 안 함
임시 저장 API 제공 안 함(필요 시 프론트 브라우저 저장소에서 처리)
동일 Idempotency-Key와 동일 요청의 재시도는 최초 결과 재생
```

---

## 9. 영속 스키마 보강

신규 Section 테이블:

```text
survey_question_sections
- section_id UUID PK
- content_version_id UUID NOT NULL FK
- section_lineage_id UUID NOT NULL
- section_key VARCHAR(150) NOT NULL
- title VARCHAR(200) NOT NULL
- description VARCHAR(1000) NULL
- display_order INTEGER NOT NULL
```

필수 제약:

```text
UNIQUE(section_id, content_version_id)
UNIQUE(content_version_id, section_lineage_id)
UNIQUE(content_version_id, section_key)
UNIQUE(content_version_id, display_order)
CHECK(display_order > 0)
CHECK(section_key, title이 공백이 아님)
```

신규 Group 테이블:

```text
survey_question_groups
- group_id UUID PK
- content_version_id UUID NOT NULL FK
- group_lineage_id UUID NOT NULL
- section_id UUID NOT NULL
- group_key VARCHAR(150) NOT NULL
- source_number VARCHAR(20) NOT NULL
- title VARCHAR(200) NOT NULL
- prompt VARCHAR(1000) NOT NULL
- description VARCHAR(1000) NULL
- display_order INTEGER NOT NULL
```

필수 제약:

```text
UNIQUE(group_id, content_version_id)
UNIQUE(content_version_id, group_lineage_id)
UNIQUE(content_version_id, group_key)
UNIQUE(content_version_id, display_order)
FOREIGN KEY (section_id, content_version_id)
    REFERENCES survey_question_sections(section_id, content_version_id)
CHECK(display_order > 0)
CHECK(group_key, source_number, title, prompt가 공백이 아님)
```

기존 `survey_questions` 추가 필드:

```text
- group_id UUID NOT NULL
- item_key VARCHAR(150) NOT NULL
- item_label VARCHAR(200) NULL
- item_display_order INTEGER NOT NULL
```

필수 제약:

```text
FOREIGN KEY (group_id, content_version_id)
    REFERENCES survey_question_groups(group_id, content_version_id)

UNIQUE(group_id, item_key)
UNIQUE(group_id, item_display_order)
CHECK(item_key가 공백이 아님)
CHECK(item_display_order > 0)
```

기존 `survey_options` 보강 필드:

```text
- option_local_key VARCHAR(20) NOT NULL
```

필수 제약:

```text
FOREIGN KEY (question_id, content_version_id)
    REFERENCES survey_questions(question_id, content_version_id)

UNIQUE(question_id, option_local_key)
UNIQUE(question_id, display_order)
UNIQUE(question_id, option_lineage_id)
CHECK(option_local_key가 공백이 아니고 대문자 영문 코드 형식임)
CHECK(display_order > 0)
```

`option_local_key`의 유일성 범위는 전체 Survey가 아니라 소속 Question이다.
완전한 운영 식별자가 필요하면
`group_key + "/" + item_key + "/" + option_local_key`를 조회 시 조합한다.
`option_semantic_key` 컬럼은 별도로 두지 않는다.

`survey_responses`, `survey_answers`, `survey_answer_selections`에는 Group 필드를
추가하지 않는다. `questionId`를 통해 Group을 역추적한다.

---

## 10. 1회차 콘텐츠 발행 검증

공통 Survey 도메인 제한 외에 공식 1회차 fixture 또는 콘텐츠 검증 테스트에서
다음을 강제한다.

```text
Group count = 29
Question count = 42
모든 Group에 Question이 1개 이상 존재
모든 Question required = true
Group displayOrder = 1..29 연속
Group별 itemDisplayOrder = 1..N 연속
groupKey 중복 없음
Question ID와 lineage ID 중복 없음
선택형 option ID와 lineage ID 중복 없음
Question별 optionLocalKey 중복 없음
Question별 optionLocalKey = A..N 연속
Question별 option displayOrder = 1..N 연속
동일 lineage의 optionLocalKey가 버전 간 다른 의미로 재사용되지 않음
발행 후 콘텐츠 수정 불가
```

Group 5, 20, 24의 Question 수를 별도로 검증한다.

```text
household.age-group-presence = 6
social.affective-distance = 7
media.daily-use-duration = 3
```

---

## 11. 이번 명세의 비범위

- radio, checkbox, dropdown, table, slider 등 Frontend widget 세부 디자인
- 회원 탈퇴 후 SurveyResponse 파기 시점과 보존 기간
- 관리자 권한 scope와 staging 운영 등록 절차
- Group 기반 관리자 콘텐츠 등록·검증·발행 API
- 개별 사용자 응답 원문에 대한 관리자 조회 API
- 후속 Survey 회차의 문항 수와 필수 여부

회원 탈퇴 기반 파기 정책은 별도 결정으로 남기되, 확정 시 사용자별
`SurveyResponse` Aggregate 전체를 처리 대상으로 논의한다.
