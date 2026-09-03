# 관리자 진행 중 과업 현황·익명 응답 API Handoff

- 기준일: 2026-09-03
- 대상: 관리자 과업 상세 화면
- API base: Vote Resource Server
- 인증 scope: `vote:tasks:admin`

## 1. Endpoint

```http
GET /api/v1/admin/tasks/{taskId}/progress-summary
Authorization: Bearer <JWT>
Accept: application/json
```

현재 상태가 `OPEN`인 과업의 제출 현황을 요청 시점에 한 번 집계한다. 실시간 구독,
주기적 서버 집계, 별도 snapshot 저장은 사용하지 않는다.

응답에는 `Cache-Control: no-store`가 포함된다. 최신 값이 필요하면 Frontend가 같은 API를
다시 호출한다.

## 2. 성공 응답

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
```

```json
{
  "taskId": "10000000-0000-0000-0000-000000000001",
  "status": "OPEN",
  "observedAt": "2026-09-03T01:00:00Z",
  "submissionCount": 3,
  "options": [
    {
      "optionId": "20000000-0000-0000-0000-000000000001",
      "content": "찬성",
      "count": 2,
      "rate": 0.6666666666666666
    },
    {
      "optionId": "20000000-0000-0000-0000-000000000002",
      "content": "반대",
      "count": 1,
      "rate": 0.3333333333333333
    }
  ]
}
```

## 3. 필드 계약

| 필드 | 타입 | 설명 |
|---|---|---|
| `taskId` | UUID | 조회한 과업 식별자 |
| `status` | string | 성공 응답에서는 항상 `OPEN` |
| `observedAt` | ISO-8601 | 이번 집계의 조회 기준 시각 |
| `submissionCount` | integer | 현재까지 제출된 전체 응답 수 |
| `options` | array | 과업에 저장된 선택지 순서대로 반환 |
| `options[].optionId` | UUID | 선택지 식별자 |
| `options[].content` | string | 선택지 문구 |
| `options[].count` | integer | 해당 선택지를 선택한 제출 수 |
| `options[].rate` | number | `count / submissionCount`, 범위 `0..1` |

제출자가 없으면 `submissionCount=0`이며 모든 선택지를 다음처럼 반환한다.

```json
{
  "count": 0,
  "rate": 0.0
}
```

Frontend는 `rate`를 백분율로 표시할 때 필요한 자리에서 반올림한다.

## 4. 익명 개별 응답 Endpoint

```http
GET /api/v1/admin/tasks/{taskId}/progress-responses?cursor={cursor}&limit=100
Authorization: Bearer <JWT>
Accept: application/json
```

- `cursor`는 선택 사항이며 서버가 반환한 값을 그대로 전달한다.
- `limit` 기본값과 최댓값은 모두 `100`이다.
- 정렬은 `submittedAt ASC`이며 같은 시각에는 내부 submission 순서를 사용한다.
- 응답에는 `Cache-Control: no-store`가 포함된다.

```json
{
  "taskId": "10000000-0000-0000-0000-000000000001",
  "status": "OPEN",
  "observedAt": "2026-09-03T01:00:00Z",
  "responses": [
    {
      "selectedOptionId": "20000000-0000-0000-0000-000000000001",
      "selectedOptionContent": "찬성",
      "reasonSource": "AI_ACCEPTED",
      "reason": "이 정책은 장기적으로 지역사회에 도움이 된다고 생각합니다.",
      "submittedAt": "2026-09-03T00:50:00Z"
    }
  ],
  "nextCursor": "opaque-cursor",
  "hasMore": true
}
```

`reasonSource`는 다음 두 값 중 하나이다.

- `AI_ACCEPTED`: 사용자가 AI 예상 이유를 채택해 제출
- `USER_WRITTEN`: 사용자가 이유를 직접 작성해 제출

`hasMore=true`이면 `nextCursor`로 다음 페이지를 요청한다. 빈 첫 페이지에서는
`nextCursor=null`, `hasMore=false`, `responses=[]`가 반환된다.

## 5. 개인정보 노출 범위

`progress-summary`는 집계 전용 SQL을 사용하며 개별 응답을 조회하지 않는다.
`progress-responses`도 다음 식별 정보는 조회 결과나 API 응답에 포함하지 않는다.

- 사용자 UUID와 이메일
- 외부 `personaId`
- 내부 persona generation 및 prediction 식별자
- 채택한 AI 예상 이유의 내부 식별자
- 개별 submission 식별자

`progress-responses`에는 관리 화면에 필요한 최종 제출 이유와 제출 시각만 포함한다.

## 6. 오류 응답

### 과업 없음

```http
HTTP/1.1 404 Not Found
```

```json
{
  "code": "TASK_NOT_FOUND",
  "detail": "The task does not exist."
}
```

### 진행 중 과업이 아님

`DRAFT`, `SCHEDULED`, `CLOSED` 상태에서는 다음 오류를 반환한다.

```http
HTTP/1.1 409 Conflict
```

```json
{
  "code": "TASK_PROGRESS_SUMMARY_NOT_AVAILABLE",
  "detail": "progress summary is available only while task is open"
}
```

익명 응답 조회에서는 같은 조건으로 다음 코드를 반환한다.

```json
{
  "code": "TASK_PROGRESS_RESPONSES_NOT_AVAILABLE",
  "detail": "progress responses are available only while task is open"
}
```

잘못된 `cursor` 또는 `1..100` 범위를 벗어난 `limit`은 `400 INVALID_REQUEST`로
반환한다.

종료되어 결과가 확정된 과업은 기존 API를 사용한다.

```http
GET /api/v1/admin/tasks/{taskId}/result-summary
```

## 7. Frontend 호출 권장 시점

- 관리자 과업 상세 화면 진입 시 한 번 호출
- 개별 응답 탭을 열 때 `progress-responses` 첫 페이지 호출
- 더 보기 시 서버가 반환한 `nextCursor` 사용
- 관리자가 현황 새로고침을 선택하면 다시 호출
- polling, WebSocket, SSE는 필요하지 않음
- 상세 조회와 현황 조회 사이에 과업이 종료되면 `409`를 받을 수 있으므로, 과업 상세를
  갱신한 뒤 종료 결과 화면으로 전환
