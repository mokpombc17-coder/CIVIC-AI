# Vote 과업 목록 페이지 Frontend Handoff

이 문서는 `/vote` 과업 목록 페이지가 현재 Backend API를 중복 없이 연동하는 최종 호출 흐름을 정의한다.

## 1. 페이지에서 사용하는 API

| 화면 데이터 | API | scope |
|---|---|---|
| 참여할 과업 | `GET /api/v1/me/tasks` | `vote:tasks:read` |
| 내 참여 전체 | `GET /api/v1/me/tasks/participated` | `vote:tasks:read` |
| 내 제출 상세 | `GET /api/v1/me/submissions?taskId={taskId}` | `vote:submissions:read` |
| 확정 결과 | `GET /api/v1/me/tasks/{taskId}/result` | `vote:tasks:read` |

인증은 기존 Vote API와 동일하게 Bearer token 또는 `civic_ai_access_token` cookie를 사용한다.

## 2. 초기 조회

페이지 진입 시 다음 두 요청은 서로 의존하지 않으므로 병렬 호출할 수 있다.

```http
GET /api/v1/me/tasks
GET /api/v1/me/tasks/participated?size=20
```

```ts
const [openTasks, participatedPage] = await Promise.all([
  getOpenTasks(),
  getParticipatedTasks({ size: 20 }),
]);
```

## 3. 화면 데이터 분류

### 3.1 참여할 과업

`GET /api/v1/me/tasks` 응답에서 다음 조건만 사용한다.

```ts
const availableTasks = openTasks.filter(
  (task) => !task.submission.submitted,
);
```

`submission.submitted=true`인 과업은 이 영역에 표시하지 않는다.

### 3.2 내 참여

내 참여 영역은 다음 API의 `items`만 사용한다.

```http
GET /api/v1/me/tasks/participated
```

`GET /api/v1/me/tasks`의 `submitted=true` 항목과 `/participated` 응답을 합치면 진행 중 참여 과업이 중복된다. 신규 연동에서는 `/participated`를 내 참여의 단일 source of truth로 사용한다.

기존 `/me/tasks`의 `submitted=true` 분류는 `/participated`를 사용할 수 없는 구버전 Frontend의 fallback 계약으로만 유지한다.

## 4. 제출 직후 갱신

Task 제출 성공 후 다음 두 query를 모두 무효화하거나 다시 호출한다.

```text
GET /api/v1/me/tasks
GET /api/v1/me/tasks/participated
```

상태 변화는 다음과 같다.

```text
제출 전
  /tasks: submitted=false
  /participated: 항목 없음

제출 후
  /tasks: submitted=true
  /participated: SUBMITTED + OPEN + NOT_AVAILABLE
```

Frontend의 `참여할 과업`은 `/tasks`에서 `submitted=false`만 사용하므로 제출한 과업이 즉시 빠진다. 같은 과업은 `/participated`의 첫 페이지에 나타난다.

동일 `taskId`에 대한 optimistic update를 적용할 수 있지만, 성공 응답 후 두 API를 재조회한 값을 최종 상태로 사용한다.

## 5. 마감과 결과 상태 전환

내 참여 항목은 다음 순서로 바뀐다.

```text
OPEN / NOT_AVAILABLE
  → CLOSING / CALCULATING
  → CLOSED / AVAILABLE
```

- `OPEN / NOT_AVAILABLE`: 진행 중이며 본인 제출 내용만 조회 가능
- `CLOSING / CALCULATING`: 예약 마감 시각은 지났고 lifecycle 처리를 기다림
- `CLOSED / CALCULATING`: 마감됐으나 결과 manifest가 아직 없음
- `CLOSED / AVAILABLE`: 결과 상세 조회 가능
- `CANCELLED / UNAVAILABLE`: 제출 이력은 유지하지만 결과 없음
- `MISSED_SCHEDULE / UNAVAILABLE`: 결과 없음

마감 전환 중에도 `/participated`에서 같은 `taskId`가 유지되므로 화면에서 항목을 제거하지 않는다.

## 6. 사용자 동작

| 조건 | 버튼·표시 | 호출 |
|---|---|---|
| 참여할 과업 | `참여하기` | 과업 상세로 이동 |
| `OPEN / NOT_AVAILABLE` | `내 응답 보기`, `결과 대기` | `/me/submissions?taskId=` |
| `CLOSING / CALCULATING` | `집계 중` | 결과 API 호출 금지 |
| `CLOSED / CALCULATING` | `집계 중` | 결과 API 호출 금지 |
| `result.accessAllowed=true` | `결과 보기` | `/me/tasks/{taskId}/result` |
| `CANCELLED / UNAVAILABLE` | `취소됨` | 결과 버튼 비활성화 |
| `MISSED_SCHEDULE / UNAVAILABLE` | `결과 없음` | 결과 버튼 비활성화 |

결과 버튼 활성화는 `taskStatus`를 다시 조합하지 않고 `result.accessAllowed`를 기준으로 한다.

## 7. 검색

하나의 검색어를 두 목록에 다음과 같이 적용한다.

### 참여할 과업

`GET /api/v1/me/tasks`는 pagination 없이 전체 진행 중 과업을 반환한다. 따라서 받은 배열 전체에서 제목·설명을 클라이언트 검색한다.

```ts
const normalizedQuery = query.trim().toLocaleLowerCase();

const searchedAvailableTasks = availableTasks.filter((task) =>
  task.title.toLocaleLowerCase().includes(normalizedQuery)
  || task.description?.toLocaleLowerCase().includes(normalizedQuery),
);
```

### 내 참여

누적 데이터이므로 서버 검색을 사용한다.

```http
GET /api/v1/me/tasks/participated?query={query}&size=20
```

- 검색어 변경 시 기존 `cursor`를 폐기하고 첫 페이지부터 요청한다.
- 같은 검색 결과의 다음 페이지에서만 `nextCursor`를 사용한다.
- 다른 검색어와 기존 cursor를 조합하면 `400 INVALID_REQUEST`다.

## 8. Cursor pagination

```http
GET /api/v1/me/tasks/participated
    ?query={sameQuery}
    &cursor={nextCursor}
    &size=20
```

- `nextCursor=null`이면 마지막 페이지다.
- 항목 key는 `taskId`를 사용한다.
- 정렬은 `submittedAt DESC, taskId DESC`다.
- 결과 확정이나 취소로 상태가 바뀌어도 정렬 위치는 바뀌지 않는다.
- 페이지 조회 도중 발생한 신규 제출은 첫 페이지 새로고침으로 가져온다.

## 9. 갱신 정책

다음 이벤트에서 `/tasks`와 `/participated`를 재조회한다.

- 페이지 진입
- 제출 성공
- 브라우저 focus 복귀
- 사용자의 새로고침 액션

`CALCULATING` 항목을 자동 갱신해야 한다면 해당 항목이 화면에 보이는 동안에만 2~5초 간격으로 `/participated` 첫 페이지를 재조회할 수 있다.

현재 이 목록 API에는 endpoint 전용 `429` 또는 `Retry-After` 계약이 없다. 네트워크 오류에서는 자동 고빈도 재시도를 하지 않고 일반적인 exponential backoff를 적용한다.

## 10. 오류 처리

| HTTP | `code` | Frontend 처리 |
|---:|---|---|
| `400` | `INVALID_REQUEST` | cursor를 제거하고 첫 페이지 복구 또는 입력 오류 표시 |
| `401` | `UNAUTHENTICATED` | 로그인 또는 인증 갱신 |
| `403` | `ACCESS_DENIED` | 권한 오류, 자동 재시도 금지 |
| `404` | `TASK_SUBMISSION_NOT_FOUND` | 내 제출 상세가 없는 상태로 복구 |
| `404` | `TASK_RESULT_NOT_FOUND` | 목록 재조회 후 결과 상태 재판정 |
| `500` | `TASK_RESULT_VIEW_INTEGRITY_FAILURE` | 일반 장애 화면 및 Backend 추적 |

오류 분기는 `detail` 문자열이 아니라 HTTP status와 `code`를 사용한다.

## 11. 페이지 수용 시나리오

1. 진행 중 미제출 과업은 참여할 과업에만 표시된다.
2. 제출 성공 후 참여할 과업에서 빠지고 내 참여 첫 페이지에 표시된다.
3. 제출한 진행 중 과업은 `OPEN / NOT_AVAILABLE`로 유지된다.
4. 예약 마감 직후에는 `CLOSING / CALCULATING`으로 유지된다.
5. 결과 manifest가 생기면 같은 항목이 `CLOSED / AVAILABLE`로 바뀐다.
6. 마감된 미참여 과업은 어느 영역에도 표시되지 않는다.
7. 제출 후 취소된 과업은 `CANCELLED / UNAVAILABLE`로 남는다.
8. 검색어 변경 시 cursor를 초기화한다.
9. 다음 페이지를 붙일 때 `taskId` 중복이 없어야 한다.

## 12. 관련 상세 계약

- 진행 중 목록: `docs/vote-open-task-list-frontend-contract.md`
- 내 참여 목록: `docs/vote-participated-task-list-frontend-contract.md`

