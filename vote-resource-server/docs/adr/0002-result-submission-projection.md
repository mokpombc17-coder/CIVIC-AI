# ADR 0002: Result 제출 Projection과 Task 조회 경계

- 상태: Accepted
- 결정일: 2026-08-19
- 적용 대상: `vote-resource-server`
- 선행 결정: `0001-separate-survey-persona-ownership.md`

## 배경

Task는 사용자의 불변 최종 제출과 질문별 답안 출처를 소유한다. Result는 이 사실을
바탕으로 실제 선택 분포와 채택률을 계산해야 하지만, Task Repository·JPA Entity를
직접 사용하거나 Task 테이블에 교차 도메인 외래 키를 만들면 경계가 흐려진다.

Result 화면에는 Task 제목·질문·선택지가 필요하므로, Task 내용을 Result 테이블에
스냅샷으로 복제할지 필요할 때 조회할지도 결정해야 한다. 또한 Persona의 모델 추정치와
실제 사용자 행동 지표를 혼합하지 않아야 한다.

## 결정

### 1. Task 제출 Integration Event

Task 제출 트랜잭션은 Submission·답변·멱등성 Receipt와 함께
`TaskSubmissionCompletedV1` Outbox 이벤트를 원자적으로 저장한다.

```text
eventType     "task.submission-completed"
schemaVersion 1
aggregateType "TASK_SUBMISSION"
aggregateId   submissionId
```

payload는 다음 사실을 포함한다.

```text
userId
submissionId
taskId
predictionId
personaGenerationId
personaVersionId
submittedAt
answers[]
  questionId
  answerType
  source
  adoptedPredictionCandidateId
  typed final value
```

Task 질문·선택지의 문구와 제약은 이벤트에 넣지 않는다. Result가 보존하는 답변 값은
Task 내용을 복제한 스냅샷이 아니라 최종 제출이라는 원천 사실이다.

### 2. Result Inbox와 제출 Projection

Result Consumer는 이벤트 Envelope와 payload의 schema·aggregate·발생 시각을 검증한
뒤 Result 소유 테이블에 다음을 같은 트랜잭션으로 저장한다.

```text
result_inbox
result_submissions
result_submission_answers
result_submission_answer_selections
```

- 전달 보장은 at-least-once다.
- 동일 `(consumerName, eventId)`의 같은 재전달은 멱등 처리한다.
- 같은 `eventId`의 내용이 달라지면 비재시도 충돌로 거부한다.
- 다른 `eventId`로 같은 `submissionId`가 전달돼도 동일 사실이면 하나의 Projection만
  유지하고, 내용이 다르면 충돌로 거부한다.
- Projection 저장 실패는 Inbox 성공으로 기록하지 않는다.
- V13 migration은 V12 Inbox만 먼저 운영된 경우 payload에서 Projection을 backfill한다.

Result 테이블은 Survey·Persona·Task 테이블에 외래 키를 만들지 않는다.

### 3. Provenance 식별자

`personaGenerationId`는 생성 작업과 재시도 생명주기를 식별하고,
`personaVersionId`는 실제 Prediction과 Submission에 사용된 불변 성공 결과를
식별한다. Result는 두 값을 모두 보존해 운영 실패와 모델 결과를 각각 역추적한다.

식별자는 화면 표시 항목 자체가 아니라 감사, 모델 버전 비교, 관리자 분석과 장애
조사를 위한 provenance다.

### 4. 실제 채택률

실제 채택률의 계산 단위는 제출된 답변이다.

```text
submittedAnswerCount = ResultSubmission의 전체 답변 수
aiAcceptedAnswerCount = source가 AI_ACCEPTED인 답변 수
actualAdoptionRate = aiAcceptedAnswerCount / submittedAnswerCount
```

비율은 0~1 범위이며 소수점 넷째 자리까지 반올림한다. 정상 TaskSubmission은 모든
질문에 답하므로 분모가 0일 수 없다.

이 값은 Result가 소유하는 실제 지표이며 PersonaVersion의
`predictedAdoptionRate`를 수정하지 않는다. 실제 채택률의 화면 노출 여부는 후속
Result 조회 API에서 결정한다. 예상 채택률은 사용자 Result 화면에 노출하지 않고,
후속 관리자 export에서 실제 채택률과 비교할 provenance로 사용한다.

### 5. Task 내용 조회

Result는 `taskId`만 보존하고 Task 문구를 중복 저장하지 않는다. Task 내용이 필요할
때는 Result가 소유하는 `ResultTaskQueryPort`를 호출한다.

Task 측 Adapter는 제목·설명·상태·질문·선택지를 Result DTO로 변환한다. Result는
Task Repository, JPA Entity와 Task 도메인 타입을 직접 참조하지 않는다. Task의
Application·Domain·Persistence도 Result에 의존하지 않으며, 허용된 의존은
`task.infra.result`에서 Result Application Port를 구현하는 연결뿐이다.

## 현재 구현 범위

구현 완료:

- Task 제출 Outbox Producer
- Result Inbox Consumer와 중복 검증
- Result 제출·typed answer Projection
- 실제 채택률 계산
- Result 소유 Task 조회 Port와 Task Adapter
- 패키지 의존성과 교차 도메인 FK 방지 테스트

후속 범위:

- 종료된 Task의 전체 선택 분포와 개인 위치 집계
- 정성적 의견 지도 분석
- 사용자 Result 조회 API와 접근 권한
- 예상·실제 채택률과 provenance를 제공하는 관리자 export API 및 개인정보 정책
- 운영용 Inbox·Outbox 재처리 도구

## 결과와 트레이드오프

Task 쓰기 모델과 Result 읽기 모델은 최종 일관성으로 연결된다. 답변 사실은 Result에
Projection되지만 Task 내용은 필요할 때 Port로 조회하므로 문구 중복과 교차 FK를
피한다. 대신 Result 조회 시 Task 모듈 가용성이 필요하며, 향후 별도 서비스 분리 시
Port Adapter를 내부 API 또는 별도 Projection으로 교체해야 한다.
