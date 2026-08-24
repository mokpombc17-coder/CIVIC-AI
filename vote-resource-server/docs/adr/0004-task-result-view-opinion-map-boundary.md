# ADR 0004: Task Result View와 OpinionMap 소비 경계

- 상태: Accepted
- 결정일: 2026-08-24
- 적용 대상: `vote-resource-server` Task·OpinionMap 경계
- 대체 결정: `0002-opinion-map-submission-projection.md`
- 관련 결정: `0001-separate-survey-persona-ownership.md`,
  `0003-single-question-vote-policy.md`

## 배경

ADR 0002는 Task의 최종 제출마다 Integration Event를 발행하고 OpinionMap이 Inbox와
Submission Projection을 소유하는 구조를 선택했다. 이후 Task 종료 시점에는 별도의
finalization 요청과 OpinionMap snapshot까지 만들어졌다.

이 구조에서는 Task의 결과 사실이 여러 저장소에 중복되고, 결과 생성 과정에 OpinionMap이
참여한다. 또한 누락된 제출이나 이벤트 처리 지연이 있으면 예상 제출 수와 Projection 수의
차이 때문에 OpinionMap 결과 확정이 지연될 수 있다. OpinionMap 외의 새 소비자가 같은 결과를
사용하려면 유사한 수신·Projection 파이프라인을 다시 만들어야 한다.

Task 결과는 Task가 소유하는 읽기 모델이다. OpinionMap은 이 완성된 결과를 입력으로 받아
정량 지표를 계산하고 LLM 분류·정성 분석을 오케스트레이션하는 소비자여야 한다.

## 결정

### 1. Task가 결과 생성과 무결성을 소유한다

- Task 종료와 동시에 `task-result-view/v1` 결과를 확정한다.
- Task는 결과 생성에 OpinionMap의 상태나 처리 성공 여부를 사용하지 않는다.
- `expectedSubmissionCount`와 OpinionMap Projection 수 비교를 결과 수락 조건으로 사용하지
  않는다. 실제로 저장된 유효 최종 제출만 Result View의 응답이 된다.
- OpinionMap은 Task Repository, JPA Entity 또는 Task 테이블을 직접 조회하지 않는다.

### 2. 본문 사본 대신 작은 manifest만 저장한다

`task_result_manifests`에는 다음 무결성 메타데이터만 저장한다.

- `task_id`
- `result_version`과 `schema_version`
- `closed_at`
- `response_count`
- `body_sha256`
- `finalized_at`

Task·질문·선택지·응답을 합친 JSONL 본문은 중복 저장하지 않는다. 조회할 때 Task가 소유한
불변 종료 데이터와 최종 제출을 정해진 순서로 다시 조립하고, 저장된 응답 수와 SHA-256이
일치하는지 확인한다. 불일치하면 손상된 결과를 반환하지 않는다.

### 3. JSONL 계약을 소비자 경계로 사용한다

관리자 API는 다음 계약을 제공한다.

```text
GET /api/v1/admin/tasks/{taskId}/result-view
Content-Type: application/x-ndjson;charset=UTF-8
```

문서는 다음 순서로 구성한다.

1. `manifest` 한 줄
2. `task` 한 줄
3. `question` 한 줄
4. `option` 여러 줄
5. `response` 여러 줄

`manifest`, `task`, `question`은 반복 응답마다 중복하지 않는다. 내부 Task·Question·Option·
Submission·User 식별자는 계약에 노출하지 않는다.

- 선택지는 표시 순서를 사용한 `O1`, `O2`, ... 키를 가진다.
- 응답의 `key`는 Task 안에서만 의미가 있는 participant key이며 `P1`, `P2`, ...처럼
  패딩 없이 부여한다.
- 응답은 `selectedOptionKey`, `reason`, `reasonSource`를 가진다.
- 개인 식별 가능성과 분석에 불필요한 시간 편향을 줄이기 위해 `userId`와 `submittedAt`은
  내보내지 않는다.

계약 예시는 `src/test/resources/contracts/task-result-view-v1.jsonl`을 기준으로 관리한다.

### 4. OpinionMap은 완성된 결과만 소비한다

- OpinionMap은 Task 종료 이벤트를 조립하거나 Task 결과 snapshot을 생성하지 않는다.
- 제출별 Outbox·Inbox, OpinionMap Submission Projection, finalization, snapshot 테이블을
  사용하지 않는다.
- 정량 지표는 Result View를 입력으로 서버 함수가 계산한다.
- 분류와 정성 분석은 별도의 LLM 오케스트레이션 정책에 따라 한 번 또는 여러 단계로
  수행한다.
- LLM 호출 실패·재시도·비용 제한은 OpinionMap 실행 상태이며 Task Result View의 완결성을
  변경하지 않는다.

### 5. 조회와 버전 정책

- manifest가 확정되지 않은 Task는 Result View를 제공하지 않는다.
- 응답 본문은 `bodySha256`을 ETag로 사용하고 private/no-cache 정책으로 반환한다.
- 계약을 깨는 변경은 기존 필드를 재해석하지 않고 새 `schemaVersion`으로 추가한다.
- 새 소비자는 OpinionMap 전용 이벤트나 테이블 대신 같은 버전 계약을 사용한다.

## 폐기한 구성

V27 마이그레이션에서 다음 구형 구성을 제거한다.

- `task.submission-completed`
- `task.opinion-map-finalization-requested`
- `opinion-map.snapshot-finalized`
- OpinionMap Inbox와 Submission Projection
- OpinionMap finalization, snapshot, manifest, option count 테이블

기존 Flyway 마이그레이션은 적용 이력 검증을 위해 수정하지 않는다.

## 결과와 트레이드오프

장점은 다음과 같다.

- Task 결과의 단일 소유권과 소비자 독립성이 명확해진다.
- 제출별 이벤트 전달 누락과 Projection 개수 불일치가 결과 생성 조건에서 사라진다.
- JSONL 구조가 큰 응답 집합의 스트리밍 처리와 여러 소비자 재사용에 적합하다.
- 내부 식별자와 제출 시각을 노출하지 않아 LLM 입력의 개인정보 범위를 줄인다.

비용은 다음과 같다.

- 조회할 때마다 본문을 다시 조립하고 해시를 검증한다.
- Task 종료 뒤 데이터를 수정하면 manifest 무결성 검증이 실패하므로 종료 데이터의 불변성을
  지켜야 한다.
- participant key는 Task 밖에서 동일 사용자를 연결할 수 없다. 향후 사용자 연결이 반드시
  필요해지면 별도 정책과 버전으로 추가해야 한다.

## 완료 조건

- Task 종료 시 manifest가 한 번 확정된다.
- 같은 종료 데이터는 byte-stable한 `task-result-view/v1` 문서를 생성한다.
- OpinionMap 런타임 코드와 Task→OpinionMap 구형 이벤트가 존재하지 않는다.
- 구형 OpinionMap 영속 테이블이 현재 스키마에 존재하지 않는다.
- 전체 테스트와 계약 fixture 검증이 통과한다.
