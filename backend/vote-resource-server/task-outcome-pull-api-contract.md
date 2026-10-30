# Task Outcome Pull API 계약

## 1. 목적

이 계약은 사용자의 불변 Task 최종 제출 결과를 Persona Runtime Server가
Vote Resource Server에서 조회하기 위한 서비스 간 Read API다.

```text
사용자 Task 최종 제출
  -> Vote Resource Server가 불변 TaskSubmission 저장
  -> Persona Runtime Server가 Task별 Outcome 목록 조회
  -> 실제 선택지, 확정 이유, AI 후보 채택 여부를 학습·평가 자료로 적재
```

Vote Resource Server가 Runtime으로 결과를 push하지 않는다. Runtime은 처리한
마지막 cursor를 영속화하고 주기적으로 다음 페이지를 조회한다. TaskSubmission은
1인 1제출이며 제출 후 수정되지 않으므로 동일 Outcome도 변경되지 않는다.

## 2. 인증

모든 요청은 사용자 JWT가 아닌 8082↔9000 전용 공유 Bearer token을 사용한다.

```http
Authorization: Bearer {ai-runtime-shared-token}
```

JWT 서명, 사용자 `sub`, OAuth scope는 검사하지 않는다. Vote Resource Server는
`VOTE_AI_RUNTIME_AUTH_TOKEN`과 요청 token을 비교하며, 누락되거나 다르면 `401`을
반환한다. 실제 token은 문서나 Git에 저장하지 않고 양쪽 서버의 Secret으로 주입한다.

Runtime에는 Vote Resource Server의 내부 `userId`를 제공하지 않는다. Persona
생성 API가 발급한 외부 `personaId`를 사용자 측 식별자로 사용한다.

## 3. Task Outcome 목록

```http
GET /api/v1/integrations/persona/tasks/{taskId}/outcomes?cursor=...&limit=100
```

### Query parameter

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `cursor` | string | X | 직전 응답의 `nextCursor`; 최초 요청에서는 생략 |
| `limit` | integer | X | 기본값 100, 범위 1~100 |

목록은 `(submittedAt ASC, outcomeId ASC)` 순으로 정렬한다. cursor는 `taskId`에
종속되므로 다른 Task의 cursor를 재사용하면 `400 INVALID_REQUEST`다.

### 성공 응답

```json
{
  "schemaVersion": 1,
  "items": [
    {
      "schemaVersion": 1,
      "outcomeId": "20000000-0000-0000-0000-000000000001",
      "personaId": "persona-7f49a8f2",
      "predictionRequestId": "30000000-0000-0000-0000-000000000001",
      "taskId": "10000000-0000-0000-0000-000000000001",
      "questionId": "40000000-0000-0000-0000-000000000001",
      "selectedOptionId": "50000000-0000-0000-0000-000000000001",
      "reasonSource": "AI_ACCEPTED",
      "acceptedCandidateId": "60000000-0000-0000-0000-000000000001",
      "finalReason": "채택한 AI 예상 이유의 확정 스냅샷",
      "submittedAt": "2026-09-02T04:00:00Z"
    }
  ],
  "nextCursor": "opaque-cursor",
  "hasMore": false
}
```

`nextCursor`는 반환된 `items`가 하나 이상이면 `hasMore=false`인 마지막 페이지에도
제공된다. Runtime은 모든 item 처리가 성공한 뒤에만 cursor를 저장한다. 처리 실패
시 이전 cursor로 다시 요청하면 같은 Outcome을 다시 받을 수 있다.

새 item이 없으면 `items=[]`, `hasMore=false`이며 요청한 cursor를 그대로
`nextCursor`로 반환한다.

## 4. Persona별 단건 Outcome

```http
GET /api/v1/integrations/persona/tasks/{taskId}/outcome?personaId={personaId}
```

외부 `personaId`는 opaque string이므로 URL path가 아닌 query parameter로
전달한다. `taskId + personaId`는 하나의 불변 TaskSubmission을 식별한다.

성공 응답은 목록의 `items[]`와 동일한 `OutcomeResponse`다. 제출 결과가 없으면
다른 내부 식별 정보를 노출하지 않고 다음 오류를 반환한다.

```text
404 TASK_OUTCOME_NOT_FOUND
```

## 5. 필드 계약

| 필드 | 타입 | nullable | 설명 |
| --- | --- | --- | --- |
| `schemaVersion` | integer | X | 현재 `1` |
| `outcomeId` | UUID | X | Vote Resource Server의 불변 `submissionId` |
| `personaId` | string | X | Persona Runtime이 발급한 외부 식별자 |
| `predictionRequestId` | UUID | O | Task Prediction 요청의 `requestId`; Prediction 미생성 시 null |
| `taskId` | UUID | X | Task Prediction 요청의 `task.taskId`와 동일 |
| `questionId` | UUID | X | 단일 Task 질문 식별자 |
| `selectedOptionId` | UUID | X | 사용자가 실제 선택한 선택지 |
| `reasonSource` | enum | X | `AI_ACCEPTED` 또는 `USER_WRITTEN` |
| `acceptedCandidateId` | UUID | O | Runtime이 Prediction 응답으로 반환한 `candidateId` |
| `finalReason` | string | X | 서버 검증·필터링 후 확정 저장된 이유 |
| `submittedAt` | ISO-8601 | X | 최종 제출 시각 |

### `AI_ACCEPTED`

```text
predictionRequestId != null
acceptedCandidateId != null
finalReason = 해당 candidate 이유의 제출 시점 확정 스냅샷
candidate의 optionId = selectedOptionId
```

### `USER_WRITTEN`

```text
predictionRequestId = Prediction 존재 여부에 따라 UUID 또는 null
acceptedCandidateId = null
finalReason = 서버 필터를 통과한 사용자 직접 작성 이유
```

## 6. 오류와 재시도

| HTTP | code | Runtime 처리 |
| --- | --- | --- |
| `400` | `INVALID_REQUEST` | cursor·limit·식별자 수정 전 재시도 금지 |
| `401` | `UNAUTHENTICATED` | 서비스 토큰 갱신 및 운영 경고 |
| `404` | `TASK_NOT_FOUND` | 잘못된 Task 식별자, 자동 재시도 금지 |
| `404` | `TASK_OUTCOME_NOT_FOUND` | 해당 Persona가 아직 제출하지 않았거나 식별자가 잘못됨 |
| `5xx` | 서버 오류 | 지수 백오프로 동일 요청 재시도 |

모든 성공 응답은 `Cache-Control: no-store`를 반환한다.

## 7. Runtime 구현 체크리스트

- [ ] Task Prediction 요청에서 받은 `taskId`를 조회 대상으로 관리한다.
- [ ] 모든 요청에 공유 token을 `Authorization: Bearer`로 전송한다.
- [ ] 사용자 JWT를 전달하지 않고 token을 로그에 기록하지 않는다.
- [ ] Task별 마지막 `nextCursor`를 영속화한다.
- [ ] 한 페이지의 모든 item 저장 성공 후 cursor를 갱신한다.
- [ ] `outcomeId`로 중복 Outcome을 멱등 처리한다.
- [ ] `AI_ACCEPTED`의 `acceptedCandidateId`를 기존 Prediction 후보와 연결한다.
- [ ] `USER_WRITTEN`의 `finalReason`을 직접 작성 결과로 구분한다.
- [ ] Outcome 적재만으로 기존 `personaId`의 불변 내용을 즉시 변경하지 않는다.
