# Chat 관리자 카테고리 API Frontend Handoff

## 문서 목적

이 문서는 관리자 페이지에서 채팅방 카테고리를 관리하고, 방 생성 신청을
승인하면서 카테고리를 확정하기 위해 필요한 현재 `chat-server` REST 계약을
정리한다.

이 문서는 JWT의 issuer, audience, 서명 알고리즘, key/JWKS, 쿠키 발급 및 갱신
방식을 결정하지 않는다. 해당 인증 규약은 운영 인증 서버 계약이 확정된 뒤
별도로 연결한다. 여기서는 Resource Server가 요구하는 scope와 HTTP 요청·응답
계약만 다룬다.

## 기준

- 기준일: 2026-08-28
- 기준 저장소: `chat-server`
- 전체 원본 명세: `docs/contracts/chat-api.md`
- 최종 데이터 및 동시성 판정 주체: `chat-server`
- 시간 형식: ISO 8601 UTC 문자열
- 카테고리 ID: 클라이언트가 해석하지 않는 opaque string

문서의 `/api/v1/...` 경로는 Chat Resource Server의 upstream 경로다. 관리자
페이지가 같은 origin의 BFF 또는 reverse proxy를 사용한다면 method, path,
query, JSON body, 응답 status, `Location`, `Content-Type`을 그대로 전달해야 한다.
인증 credential을 브라우저와 Resource Server 사이에서 전달하는 방식은 인증
담당 계약을 따른다.

## 관리자 페이지가 구현할 기능

관리자 페이지는 다음 기능을 제공한다.

1. 카테고리 목록 및 상세 조회
2. 카테고리 생성과 이름 변경
3. 사용되지 않는 카테고리 삭제
4. 방 생성 신청 승인 시 카테고리 1~5개 선택
5. 전체 방을 이름·카테고리·상태·공개 범위로 검색
6. 기존 방에 연결된 카테고리 1~5개 전체 교체

방장과 일반 사용자는 방 카테고리를 변경할 수 없다. 사용자는 방 생성
신청에서도 카테고리를 제안하지 않는다.

## 권한

| 사용 API | 필요한 scope |
|---|---|
| `/api/v1/admin/room-categories/**` | `chat:categories:manage` |
| `GET /api/v1/admin/rooms` | `chat:categories:manage` |
| `PUT /api/v1/admin/rooms/{roomId}/categories` | `chat:categories:manage` |
| `/api/v1/admin/room-creation-requests/**` | `chat:rooms:approve` |
| `GET /api/v1/rooms/{roomId}`를 이용한 현재 Room version 조회 | `chat:rooms:read` |

인증되지 않은 요청은 `401`, 인증됐지만 필요한 scope가 없는 요청은 `403`이다.
관리자 JWT 포맷은 아직 이 문서의 고정 계약이 아니지만, 최종 관리자 credential은
사용할 화면에 맞는 위 scope를 제공해야 한다.

## 공통 정책

### 기본 카테고리

서버에는 다음 기본 카테고리가 항상 존재한다.

```text
categoryId: 00000000-0000-0000-0000-000000000001
name: 정책
```

기본 `정책` 카테고리는 이름을 변경할 수 있지만 삭제할 수는 없다. 프론트가
삭제 버튼을 미리 비활성화할 수 있으나, 최종 판정은 서버 응답을 따른다.

### 카테고리 개수와 순서

- 한 방에는 서로 다른 카테고리 ID가 최소 1개, 최대 5개 필요하다.
- `categoryIds`의 배열 순서는 의미가 없다.
- 카테고리 목록 API의 반환 순서도 계약이 아니다.
- 화면에서는 최신 카테고리 목록을 `name` 기준으로 정렬한다.
- Room 응답의 `categoryIds`와 카테고리 목록을 ID로 조인하여 이름을 표시한다.

### 이름 정책

카테고리 이름은 서버에서 NFKC 정규화하고 앞뒤 공백을 제거한다.

- 정규화 후 1~50 Unicode code point
- 한 줄 plain text
- 정규화 후 대소문자를 구분하지 않고 유일

프론트의 사전 검증은 사용자 편의를 위한 것이며 서버 검증을 대체하지 않는다.

### 캐시와 동시성

- 이 문서의 조회·변경 응답은 `Cache-Control: no-store`다.
- 이름 변경과 삭제는 카테고리 `version`을 사용한다.
- 기존 방 카테고리 교체는 Room `version`을 사용한다.
- `expectedVersion`은 `0` 이상의 정수이며 최신 version과 정확히 일치해야 한다.
- 카테고리 변경 API에는 `Idempotency-Key`를 보내지 않는다.

`409` version conflict가 발생하면 로컬 상태로 자동 덮어쓰지 말고 최신 리소스를
다시 조회한 뒤 사용자에게 재시도를 요청한다.

## API 요약

| Method | Path | 성공 status | 용도 |
|---|---|---:|---|
| `GET` | `/api/v1/admin/room-categories` | `200` | 카테고리 목록 |
| `GET` | `/api/v1/admin/room-categories/{categoryId}` | `200` | 카테고리 상세 |
| `POST` | `/api/v1/admin/room-categories` | `201` | 카테고리 생성 |
| `PATCH` | `/api/v1/admin/room-categories/{categoryId}` | `200` | 카테고리 이름 변경 |
| `DELETE` | `/api/v1/admin/room-categories/{categoryId}` | `204` | 카테고리 삭제 |
| `GET` | `/api/v1/admin/rooms` | `200` | 전체 방 검색·목록 |
| `GET` | `/api/v1/admin/room-creation-requests` | `200` | 생성 신청 목록 |
| `GET` | `/api/v1/admin/room-creation-requests/{creationRequestId}` | `200` | 생성 신청 상세 |
| `POST` | `/api/v1/admin/room-creation-requests/{creationRequestId}/approve` | `201` 또는 `200` | 카테고리를 확정하며 승인 |
| `PUT` | `/api/v1/admin/rooms/{roomId}/categories` | `200` | 기존 방 카테고리 전체 교체 |

## 카테고리 응답 모델

```json
{
  "categoryId": "00000000-0000-0000-0000-000000000001",
  "name": "정책",
  "usageCount": 3,
  "deletable": false,
  "createdAt": "2026-08-28T01:00:00Z",
  "updatedAt": "2026-08-28T01:00:00Z",
  "version": 0
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `categoryId` | string | 변경되지 않는 카테고리 ID |
| `name` | string | 현재 표시 이름 |
| `usageCount` | integer | 현재 이 카테고리를 참조하여 삭제를 막는 Room 수 |
| `deletable` | boolean | 현재 조회 시점의 서버 정책상 삭제 가능 여부 |
| `createdAt` | string | 생성 시각 |
| `updatedAt` | string | 마지막 수정 시각 |
| `version` | integer | 이름 변경·삭제용 optimistic lock version |

## 1. 카테고리 목록 조회

```http
GET /api/v1/admin/room-categories
```

```json
{
  "items": [
    {
      "categoryId": "00000000-0000-0000-0000-000000000001",
      "name": "정책",
      "usageCount": 3,
      "deletable": false,
      "createdAt": "2026-08-28T01:00:00Z",
      "updatedAt": "2026-08-28T01:00:00Z",
      "version": 0
    }
  ]
}
```

pagination은 없다. 서버 순서를 UI 순서로 사용하지 않고 `name` 기준으로 정렬한다.

## 2. 카테고리 상세 조회

```http
GET /api/v1/admin/room-categories/{categoryId}
```

성공 시 카테고리 응답 모델을 반환한다. 존재하지 않으면
`404 ROOM_CATEGORY_NOT_FOUND`다.

## 3. 카테고리 생성

```http
POST /api/v1/admin/room-categories
Content-Type: application/json

{
  "name": "지역 현안"
}
```

성공 응답:

- status: `201 Created`
- body: 생성된 카테고리 응답 모델
- `Location`: `/api/v1/admin/room-categories/{categoryId}`

정규화 후 같은 이름이 이미 있으면 `409 ROOM_CATEGORY_NAME_CONFLICT`다.

## 4. 카테고리 이름 변경

```http
PATCH /api/v1/admin/room-categories/{categoryId}
Content-Type: application/json

{
  "name": "지역 의제",
  "expectedVersion": 0
}
```

성공 시 갱신된 카테고리 응답 모델을 반환한다. 이름을 변경해도 `categoryId`는
바뀌지 않으므로 기존 방 연결은 유지된다.

- 존재하지 않는 ID: `404 ROOM_CATEGORY_NOT_FOUND`
- 중복 이름: `409 ROOM_CATEGORY_NAME_CONFLICT`
- 오래된 version: `409 ROOM_CATEGORY_VERSION_CONFLICT`

## 5. 카테고리 삭제

```http
DELETE /api/v1/admin/room-categories/{categoryId}?expectedVersion=1
```

성공은 body 없는 `204 No Content`다.

다음 카테고리는 삭제할 수 없다.

- 기본 `정책` 카테고리
- ACTIVE 또는 CLOSED Room 하나 이상이 참조하는 카테고리

사용 중인 카테고리 삭제 요청은 다음 정보를 포함한 `409`를 반환한다.

```json
{
  "title": "Room category operation failed",
  "status": 409,
  "code": "ROOM_CATEGORY_IN_USE",
  "replayed": false,
  "retryable": false,
  "referencedRoomCount": 3
}
```

`inUse` 필드는 별도로 제공하지 않는다. 프론트는 `usageCount > 0`으로 사용
여부를 표시하고 `deletable`로 삭제 버튼을 제어한다. `deletable=true` 조회 후
다른 요청이 해당 카테고리를 방에 연결할 수 있으므로, 실제 삭제의 최종 판정은
항상 서버 응답이다. `ROOM_CATEGORY_IN_USE`를 받으면 `referencedRoomCount`와
함께 삭제할 수 없음을 안내한다.

## 6. 방 생성 신청 승인 시 카테고리 확정

### 권장 화면 흐름

1. `GET /api/v1/admin/room-categories`로 선택 가능한 카테고리를 조회한다.
2. `GET /api/v1/admin/room-creation-requests?status=PENDING`으로 신청을 조회한다.
3. 관리자가 카테고리 1~5개를 선택한다.
4. 승인 API body에 선택한 `categoryIds`를 보낸다.

신청자가 카테고리를 제안하지 않으므로 `PENDING` 신청의 `categoryIds`는 빈
배열이다. 관리자 UI가 신청 카테고리를 수정하는 것이 아니라 승인 시 새로
확정하는 모델이다.

### 신청 목록

```http
GET /api/v1/admin/room-creation-requests?status=PENDING&limit=20&cursor=...
```

- `status` 기본값: `PENDING`
- 지원 status: `PENDING`, `APPROVED`, `REJECTED`, `CANCELED`
- `limit` 기본값: 20
- `limit` 최댓값: 100
- 정렬: `requestedAt`, `creationRequestId` 오름차순
- `cursor`: opaque string이며 다른 status 조회에 재사용할 수 없음

### 신청 상세

```http
GET /api/v1/admin/room-creation-requests/{creationRequestId}
```

목록과 상세의 주요 응답 필드는 다음과 같다.

```text
creationRequestId
requesterUserId
name
description
categoryIds
visibility
joinPolicy
status
requestedAt
resolvedAt
roomId
ownerMembershipId
roomVersion
ownerMembershipVersion
rejectionReason
replayed
```

### 승인

```http
POST /api/v1/admin/room-creation-requests/{creationRequestId}/approve
Content-Type: application/json

{
  "categoryIds": [
    "00000000-0000-0000-0000-000000000001"
  ]
}
```

최초 승인 성공:

- status: `201 Created`
- `Location`: `/api/v1/rooms/{roomId}`
- `status`: `APPROVED`
- `categoryIds`: 승인 시 선택한 ID 집합
- `replayed`: `false`

같은 신청 승인 요청을 재시도할 때는 다음 계약을 따른다.

- 이미 승인됐고 같은 카테고리 집합이면 `200 OK`, `replayed=true`
- 이미 승인됐지만 다른 카테고리 집합이면
  `409 ROOM_CREATION_DECISION_CONFLICT`
- 카테고리 배열 순서는 비교 의미가 없다.
- quota 초과는 `409 USER_ACTIVE_ROOM_LIMIT_EXCEEDED`이며 신청은
  `PENDING`으로 유지된다.

승인 요청에는 `Idempotency-Key`를 사용하지 않는다. 네트워크 오류로 결과를
확인하지 못했으면 같은 신청 ID와 같은 카테고리 집합으로 재시도한다.

## 7. 관리자 방 검색·목록

공개 방 목록과 달리 ACTIVE/CLOSED 및 LISTED/UNLISTED Room을 모두 검색한다.

```http
GET /api/v1/admin/rooms?query=기후&categoryId={categoryId}&status=ACTIVE&visibility=UNLISTED&limit=20&cursor={cursor}
```

| query parameter | 필수 | 설명 |
|---|---|---|
| `query` | 아니오 | 방 이름 부분 검색, 앞뒤 공백 제거, 대소문자 무시, 최대 100 code point |
| `categoryId` | 아니오 | 해당 카테고리가 연결된 방만 조회 |
| `status` | 아니오 | `ACTIVE` 또는 `CLOSED` |
| `visibility` | 아니오 | `LISTED` 또는 `UNLISTED` |
| `limit` | 아니오 | 1~100, 기본값은 서버 공통 Room 목록 기본값 |
| `cursor` | 아니오 | 직전 응답의 `nextCursor` |

모든 필터는 AND 조건이다. 응답 순서는 `roomId` 오름차순이며 커서는 조회 당시
필터에 묶여 있다. 필터를 바꾸려면 커서를 버리고 첫 페이지부터 다시 요청한다.

```json
{
  "items": [
    {
      "roomId": "room-01",
      "name": "기후 정책 토론방",
      "description": "기후 정책을 토론합니다.",
      "categoryIds": [
        "00000000-0000-0000-0000-000000000001"
      ],
      "categorySummaries": [
        {
          "categoryId": "00000000-0000-0000-0000-000000000001",
          "name": "정책"
        }
      ],
      "ownerMembershipId": "membership-01",
      "status": "ACTIVE",
      "visibility": "UNLISTED",
      "joinPolicy": "OPEN",
      "activeMemberCount": 12,
      "createdAt": "2026-08-28T01:00:00Z",
      "version": 7
    }
  ],
  "hasNext": false
}
```

`categorySummaries`는 표시용 최신 이름이며 `categoryIds`는 필터와 변경 요청에
계속 사용한다. 기존 방 카테고리를 변경할 때는 선택한 항목의 `version`을
`expectedVersion`으로 사용한다.

## 8. 기존 방 카테고리 전체 교체

이 API는 기존 연결에 일부를 추가하는 patch가 아니라 최종 카테고리 집합 전체를
교체하는 PUT이다.

```http
PUT /api/v1/admin/rooms/{roomId}/categories
Content-Type: application/json

{
  "categoryIds": [
    "00000000-0000-0000-0000-000000000001",
    "11111111-1111-1111-1111-111111111111"
  ],
  "expectedVersion": 7
}
```

`expectedVersion`은 카테고리 version이 아니라 Room의 현재 `version`이다.
ACTIVE와 CLOSED Room 모두 변경할 수 있다.

```json
{
  "roomId": "room-01",
  "categoryIds": [
    "00000000-0000-0000-0000-000000000001",
    "11111111-1111-1111-1111-111111111111"
  ],
  "roomVersion": 8,
  "changed": true
}
```

현재 version에서 동일한 집합을 보내면 version을 올리지 않고
`changed=false`다. 변경 성공 뒤 이전 `expectedVersion`으로 재전송하면 같은
body라도 `409 ROOM_CATEGORY_ASSIGNMENT_VERSION_CONFLICT`다.

현재 Room version은 다음 중 하나로 확보한다.

- 승인 응답의 `roomVersion`
- `GET /api/v1/admin/rooms` 응답의 `version`
- `GET /api/v1/rooms/{roomId}` 응답의 `version`
- 직전 교체 응답의 `roomVersion`

ACTIVE Room에서 실제 변경이 발생하면 일반 사용자 Room 구독자에게
`ROOM_SETTINGS_UPDATED` 이벤트가 전파된다. 관리자 페이지는 이를 위해
WebSocket을 연결하지 않아도 된다.

## 오류 응답

REST 오류는 `application/problem+json`이다. 공통 필드는 다음과 같다.

```json
{
  "type": "urn:hamcheeze:problem:room-category-version-conflict",
  "title": "Room category operation failed",
  "status": 409,
  "detail": "The Room category was changed by another request.",
  "instance": "/api/v1/admin/room-categories/example-category",
  "code": "ROOM_CATEGORY_VERSION_CONFLICT",
  "replayed": false,
  "retryable": false
}
```

body validation 오류에는 `fieldErrors`가 추가될 수 있다. UI 분기는 `detail`
문자열이 아니라 안정적인 `status`와 `code`를 사용한다.

| Status | Code | 관리자 UI 처리 |
|---:|---|---|
| `400` | `INVALID_REQUEST` | 필수 필드, 배열 크기, version 형식 등 입력 확인 |
| `400` | `INVALID_ROOM_CATEGORY` | 이름 또는 카테고리 집합 검증 오류 표시 |
| `401` | `UNAUTHENTICATED` | 인증 계약에 따른 로그인 또는 세션 복구 |
| `403` | `ACCESS_DENIED` | 관리자 권한 부족 화면 표시 |
| `404` | `ROOM_NOT_FOUND` | 대상 방이 존재하지 않음을 표시 |
| `404` | `ROOM_CATEGORY_NOT_FOUND` | 목록을 새로 조회하고 선택값 갱신 |
| `404` | `ROOM_CREATION_REQUEST_NOT_FOUND` | 신청 목록을 새로 조회 |
| `409` | `ROOM_CATEGORY_NAME_CONFLICT` | 이름 중복 표시 |
| `409` | `ROOM_CATEGORY_VERSION_CONFLICT` | 카테고리 재조회 후 재편집 |
| `409` | `ROOM_CATEGORY_ASSIGNMENT_VERSION_CONFLICT` | Room 재조회 후 재편집 |
| `409` | `ROOM_CATEGORY_IN_USE` | 삭제 불가 및 `referencedRoomCount` 표시 |
| `409` | `ROOM_CATEGORY_DEFAULT_PROTECTED` | 기본 카테고리 삭제 불가 표시 |
| `409` | `ROOM_CREATION_DECISION_CONFLICT` | 최신 신청 상태 조회 |
| `409` | `USER_ACTIVE_ROOM_LIMIT_EXCEEDED` | 승인을 완료하지 못했음을 표시 |

## 프론트엔드 구현 체크리스트

- 카테고리 선택값은 이름이 아니라 `categoryId`로 보관한다.
- 사용 여부는 `usageCount > 0`, 삭제 버튼은 `deletable`로 표시한다.
- 방 목록 필터를 변경할 때 기존 `cursor`를 재사용하지 않는다.
- 방 생성 승인과 기존 방 교체 모두 1~5개를 선택해야 제출할 수 있다.
- 중복 ID를 제거하고 배열 순서에 의미를 부여하지 않는다.
- 목록은 응답 순서가 아니라 `name` 기준으로 정렬한다.
- 이름 변경·삭제 시 화면이 보유한 최신 카테고리 `version`을 보낸다.
- 기존 방 교체 시 최신 Room `version`을 보낸다.
- `409` 발생 시 자동 덮어쓰기 대신 최신 데이터를 다시 조회한다.
- 삭제 성공 `204`에서는 JSON body를 파싱하지 않는다.
- 생성 `201`과 승인 `201`의 `Location`을 보존한다.
- 오류 문구가 아니라 `code`로 UI 상태를 분기한다.
- 관리자 카테고리 기능 때문에 WebSocket을 연결하지 않는다.

## 현재 제공하지 않는 계약

다음 항목은 현재 API에 없다.

- 카테고리별 사용 방 목록
- 카테고리 응답의 별도 `inUse` 필드
- 카테고리 비활성화
- 카테고리 수동 순서 및 순서 변경 API
- 카테고리 병합
- 카테고리 또는 방 카테고리 일괄 변경
- 관리 작업 전용 WebSocket 알림

## 권장 연동 시나리오

최소 Local E2E 시나리오는 다음과 같다.

1. 카테고리 목록에 기본 `정책`이 존재하는지 확인한다.
2. 새 카테고리를 생성하고 응답의 `categoryId`, `version`을 저장한다.
3. 이름을 변경하고 증가한 `version`을 확인한다.
4. `PENDING` 방 생성 신청을 조회한다.
5. 카테고리 1~5개를 선택해 승인하고 Room의 `categoryIds`를 확인한다.
6. 같은 신청과 같은 집합으로 승인 재시도하여 `replayed=true`를 확인한다.
7. 관리자 방 목록을 카테고리·상태·공개 범위로 검색한다.
8. Room의 현재 version으로 카테고리 집합을 교체한다.
9. 사용 중인 카테고리의 `usageCount`와 `deletable=false`를 확인한다.
10. 사용 중인 카테고리 삭제가 `ROOM_CATEGORY_IN_USE`로 거절되는지 확인한다.
11. 방에서 해당 카테고리를 제거한 뒤 삭제가 `204`인지 확인한다.
12. 기본 `정책` 삭제가 `ROOM_CATEGORY_DEFAULT_PROTECTED`인지 확인한다.
