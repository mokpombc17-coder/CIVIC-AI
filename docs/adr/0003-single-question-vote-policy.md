# ADR 0003: 단일 질문 투표와 최종 선택 이유 정책

- 상태: Accepted
- 결정일: 2026-08-19
- 적용 대상: `vote-resource-server` Task·OpinionMap 경계
- 선행 결정: `0002-opinion-map-submission-projection.md`
- 후속 결정: `0004-task-result-view-opinion-map-boundary.md`,
  `0005-simplify-persona-generation-model.md`

> 단일 질문과 최종 선택 이유 정책은 유효하다. OpinionMap으로 결과를 전달하는 방식은
> ADR 0004의 Task Result View 경계를 따른다. Task가 보관하는 Persona 식별자는
> ADR 0005에 따라 `personaGenerationId`로 단순화한다.

## 배경

기존 Task는 여러 질문과 여섯 가지 질문 유형, `OTHER` 선택지, 질문별 typed answer를
지원한다. 확정된 제품 정책은 이보다 단순하다. 투표 하나는 질문 하나만 가지며,
사용자는 준비된 선택지 하나와 그 선택 이유 하나를 최종 제출한다.

AI는 질문 전체에 대한 독립 답안을 만드는 것이 아니라 선택지마다 예상 선택 이유를
두 개씩 만든다. 사용자는 선택한 선택지에 속한 예상 이유 하나를 채택하거나 직접
이유를 작성한다. 최종 제출은 수정할 수 없고 OpinionMap의 불변 원천이 된다.

현재 보존해야 할 Task·Prediction·Submission 데이터는 없다. 따라서 기존 다중 질문
계약을 호환하거나 레거시 데이터를 변환하는 것보다 새 정책에 맞게 모델과 스키마를
정리한다.

## 결정

### 1. 투표 질문

게시 가능한 Task는 다음 조건을 모두 만족해야 한다.

- 질문이 정확히 하나다.
- 질문 유형은 `SINGLE_CHOICE`다.
- 선택지는 두 개 이상의 `STANDARD` 선택지만 사용한다.
- `OTHER` 선택지는 허용하지 않는다.
- 질문과 선택지의 표시 순서는 1부터 연속적이다.

DRAFT는 작성 도중 불완전할 수 있지만 예약·즉시 공개 시점에는 위 조건을 모두
검증한다. 후속 모델 단순화가 완료되면 생성·수정 API와 영속성도 같은 구조만
표현하도록 축소한다.

### 2. AI 예상 이유

AI 예상 결과의 단위는 선택지가 아니라 그 선택지에 속한 이유다. 각 `STANDARD`
선택지에는 정확히 두 개의 예상 이유가 있어야 한다.

```text
TaskPredictedReason
- predictedReasonId
- predictionId
- optionId
- reasonOrder (1 또는 2)
- reason
```

예상 이유는 같은 Prediction과 선택지에 종속되며, 순서는 선택지별로 1부터 연속적이어야
한다. 부분 결과나 선택지별 개수가 다른 결과는 성공으로 확정하지 않는다.

### 3. 최종 제출

사용자는 선택지 하나와 이유 하나를 원자적으로 제출한다.

```text
TaskSubmission
- submissionId
- userId
- taskId
- predictionId
- personaGenerationId
- personaVersionId
- questionId
- selectedOptionId
- reasonSource
- acceptedPredictedReasonId (nullable)
- finalReason
- submittedAt
```

`reasonSource`는 다음 두 값만 가진다.

- `AI_ACCEPTED`: `acceptedPredictedReasonId`가 필수이며, 해당 이유는 같은 Prediction과
  선택한 선택지에 속해야 한다. 서버가 이유 문구를 `finalReason`에 복사한다.
- `USER_WRITTEN`: `acceptedPredictedReasonId`는 비어 있어야 하며, 사용자가 작성한
  비어 있지 않은 이유를 `finalReason`으로 저장한다.

최종 제출은 사용자·Task별 한 번만 허용하고 제출 이후 수정하지 않는다. AI 이유를
채택한 경우에도 식별자만 보존하지 않고 당시 문구를 함께 저장해 외부 생성 결과나
조회 모델의 변경과 무관한 불변 스냅샷을 만든다.

### 4. OpinionMap 전달 계약

Task는 최종 제출 사실을 schema version 2의 `TaskSubmissionCompletedV2` Outbox
이벤트로 전달하며 다음 값을 제공한다.

```text
submissionId, userId, taskId, predictionId
personaGenerationId, personaVersionId, submittedAt
questionId, selectedOptionId
reasonSource, acceptedPredictedReasonId, finalReason
```

OpinionMap은 `taskId`로 질문·선택지 문맥을 명시적 조회 Port를 통해 조회한다.
Task Repository·JPA Entity·교차 도메인 외래 키는 사용하지 않는다.

OpinionMap Consumer는 V2만 수용한다. 보존할 기존 제출 데이터가 없으므로 V1 호환 경로를
유지하지 않으며, V1 이벤트가 들어오면 비재시도 오류로 거부한다.

## 구현 순서

- [x] 이 결정과 게시 경계의 도메인 테스트를 고정한다.
- [x] Task 질문·선택지 모델과 API를 단일 질문 정책으로 단순화한다.
- [x] Prediction Candidate를 선택지별 예상 이유 모델로 변경한다.
- [x] Submission을 선택지 하나와 이유 하나의 불변 스냅샷으로 변경한다.
- [x] 새 Flyway migration과 JPA 매핑을 적용한다.
- [x] AI·관리자·사용자 API 계약을 변경한다.
- [x] 소비자 우선으로 제출 이벤트와 OpinionMap Projection을 전환한다.
- [x] 로컬 fixture·smoke·문서를 정리하고 회귀 테스트를 수행한다.

## 결과와 트레이드오프

도메인과 저장 구조가 실제 제품 정책과 일치해 불가능한 상태를 표현하지 않게 된다.
`finalReason`과 채택한 예상 이유 문구는 중복되지만, 최종 결과의 불변성과 감사 가능성을
위해 의도적으로 저장한다. 기존 범용 질문·답안 기능은 제거되며, 향후 다시 필요하면
별도 정책 결정과 migration으로 도입한다.
