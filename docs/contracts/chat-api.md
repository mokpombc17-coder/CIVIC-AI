# Chat Resource Server 프론트엔드 연동 명세

## 문서 상태

- 기준 환경: 로컬 연동
- Chat Resource Server: `http://localhost:8082`
- WebSocket endpoint: `ws://localhost:8082/ws`
- Frontend origin: `http://localhost:3000`
- 인증 쿠키: `civic_ai_access_token`
- REST API prefix: `/api/v1`

현재 서버가 제공하는 범위는 방 관리 REST API와 실시간 채팅 WebSocket/STOMP이다.
메시지 이력 조회와 공개 방 목록 REST API도 제공한다.

## 프론트엔드 전달 문구

> Chat Resource Server의 로컬 포트를 `8081`에서 `8082`로 변경했습니다.
> Docker 외부 포트와 Spring Boot 내부 포트 모두 `8082`로 통일했습니다.
>
> 프론트에서는 다음 주소를 사용해 주세요.
>
> - REST API base URL: `http://localhost:8082`
> - WebSocket endpoint: `ws://localhost:8082/ws`
>
> REST 요청에는 `credentials: "include"`를 적용해 주세요.
> WebSocket은 브라우저가 HTTP upgrade 요청에
> `civic_ai_access_token` HttpOnly 쿠키를 자동 첨부하므로 STOMP
> `CONNECT`에 `Authorization` 헤더를 추가하지 않아도 됩니다.
>
> 방 생성·변경 POST API에는 요청마다 UUID 형식의
> `Idempotency-Key` 헤더가 필요합니다. 같은 요청을 재시도할 때는
> 반드시 같은 key를 사용해 주세요.
>
> 상세 REST 및 STOMP 명세는 첨부한 `chat-api.md`를 참고해 주세요.
> 백엔드는 현재 Docker에서 MongoDB와 함께 기동되며
> `http://localhost:8082/actuator/health`가 `UP`인 상태입니다.
>
> SharedWorker의 활성 방 선점 전환 방식도 서버 계약과 호환되는 것으로
> 최종 확인했습니다. 서버는 동일 WebSocket session의 STOMP frame을 수신
> 순서대로 처리합니다.
>
> 방 전환 시 사용자 공통 queue 2개는 유지하고 다음 순서로 처리해 주세요.
>
> 1. 기존 방 `/messages` UNSUBSCRIBE
> 2. 기존 방 `/room-events` UNSUBSCRIBE
> 3. 새 방 `/messages` SUBSCRIBE
> 4. 새 방 `/room-events` SUBSCRIBE
>
> 같은 session에서 위 frame을 순서대로 보내면 별도의 receipt 대기는 필요하지
> 않습니다. 기존 방 topic이 하나라도 남은 상태에서 새 `roomId`를 구독하면
> `ACTIVE_ROOM_LIMIT_EXCEEDED`로 해당 구독만 거절되며 WebSocket 연결은
> 유지됩니다.
>
> 같은 방을 여러 탭에서 열 때 기존 topic 구독을 재사용하고 owner tab만
> 교체하는 방식도 허용합니다. `ROOM_REPLACED`는 프론트 내부 이벤트로 관리해
> 주세요.
>
> 메시지 이력 조회 계약도 보강했습니다. 채팅방 최초 진입 시에는 커서 없이
> `GET /api/v1/rooms/{roomId}/messages?limit=50`을 호출하면 최신 메시지
> 50개를 오름차순으로 반환합니다. 과거 이력은 응답의
> `nextBeforeSequence`를 다음 요청의 `beforeSequence`로 전달해 조회해 주세요.
> WebSocket 재연결이나 sequence 누락 복구에는 마지막으로 연속 적용한
> sequence를 `afterSequence`로 전달합니다.
>
> 최초 진입과 재연결에서는 `/user/queue/system-events`를 먼저 구독하고
> 방 topic 두 개를 구독한 뒤, 같은 STOMP session에서
> `/app/rooms/{roomId}/subscriptions/sync`로 sync 요청을 보내 주세요.
> `ROOM_SUBSCRIPTIONS_READY`를 수신한 뒤 REST 이력 조회를 시작합니다.
> 프론트 이벤트 버퍼링은 방 topic의 `SUBSCRIBE`를 보내기 전에 시작해야 합니다.
> Native STOMP `receipt`는 구독 준비 계약으로 사용하지 않습니다.
>
> 다른 브라우저나 디바이스의 새 연결이 기존 연결을 교체하면 서버는 기존
> WebSocket을 close code `4001`, reason `CONNECTION_REPLACED`로 종료합니다.
> 이 경우 기존 연결에서는 자동 재연결을 중단해 주세요.

## 인증 및 공통 요청 규칙

### 브라우저 인증

프론트는 JWT를 직접 읽거나 저장하지 않는다. Next.js 로컬 인증
에뮬레이터가 설정한 HttpOnly 쿠키를 브라우저가 자동으로 전달한다.

```text
Cookie: civic_ai_access_token=<jwt>
```

REST 요청 예:

```typescript
await fetch("http://localhost:8082/api/v1/me/rooms", {
  method: "GET",
  credentials: "include",
});
```

로컬 REST CORS 계약은 다음과 같다.

- Allowed Origin: `http://localhost:3000` (`*` wildcard 사용 안 함)
- Credentials: `true`
- Allowed Methods: `GET`, `POST`, `OPTIONS`
- Allowed Headers: `Content-Type`, `Idempotency-Key`, `Authorization`

인증 쿠키가 없거나 유효하지 않으면 `401 Unauthorized`, 필요한 권한이
없으면 `403 Forbidden`을 반환한다.

로컬 JWT가 발급하는 scope는 다음과 같다.

```text
chat:connect
chat:rooms:read
chat:rooms:write
chat:messages:write
```

기능별 요구 권한 계약은 다음과 같다.

| 기능 | Scope |
| --- | --- |
| WebSocket 연결 | `chat:connect` |
| 방 및 멤버십 조회 | `chat:rooms:read` |
| 방 topic 구독 및 구독 준비 sync | `chat:rooms:read` |
| 방 생성 및 상태 변경 | `chat:rooms:write` |
| 채팅 메시지 전송 | `chat:messages:write` |

### Idempotency-Key

모든 방 생성·변경 `POST` API에는 다음 헤더가 필요하다.

```http
Idempotency-Key: 07af9111-3e20-43e5-ae80-78d1bf547647
```

- 값은 UUID 형식이어야 한다.
- 네트워크 오류로 같은 요청을 재시도할 때는 같은 key를 사용한다.
- 같은 key와 같은 요청을 다시 보내면 기존 결과를 반환하며
  `replayed`가 `true`가 된다.
- 같은 key를 다른 요청에 재사용하면 `409 IDEMPOTENCY_CONFLICT`를
  반환한다.
- 누락되거나 UUID 형식이 아니면 `400 INVALID_IDEMPOTENCY_KEY`를
  반환한다.

## 공통 enum

| 이름 | 값 |
| --- | --- |
| `RoomVisibility` | `LISTED`, `UNLISTED` |
| `JoinPolicy` | `OPEN`, `INVITE_ONLY` |
| `RoomStatus` | `ACTIVE`, `CLOSED` |
| `MembershipRole` | `OWNER`, `MEMBER` |
| `MembershipStatus` | `ACTIVE`, `LEFT`, `BANNED` |
| `RoomParticipationStatus` | `ACTIVE`, `LEFT`, `BANNED`, `NOT_JOINED`, `ROOM_CLOSED` |

`Instant` 타입은 ISO-8601 UTC 문자열로 전달된다.

```text
2026-07-29T04:30:00Z
```

## REST API 요약

| Method | Path | 설명 | 성공 상태 |
| --- | --- | --- | --- |
| `POST` | `/api/v1/rooms` | 방 생성 | `201` |
| `POST` | `/api/v1/rooms/{roomId}/commands/join` | 방 참여 | `201` 또는 `200` |
| `POST` | `/api/v1/rooms/{roomId}/commands/leave` | 방 나가기 | `200` |
| `POST` | `/api/v1/rooms/{roomId}/commands/transfer-ownership` | 방장 위임 | `200` |
| `POST` | `/api/v1/rooms/{roomId}/commands/ban-member` | 멤버 차단 | `200` |
| `POST` | `/api/v1/rooms/{roomId}/commands/unban-member` | 멤버 차단 해제 | `200` |
| `POST` | `/api/v1/rooms/{roomId}/commands/close` | 방 종료 | `200` |
| `GET` | `/api/v1/rooms` | 공개 방 목록 | `200` |
| `GET` | `/api/v1/rooms/{roomId}` | 방 상세 조회 | `200` |
| `GET` | `/api/v1/rooms/{roomId}/memberships/me` | 내 멤버십 조회 | `200` |
| `GET` | `/api/v1/me/rooms` | 내 활성 방 목록 | `200` |
| `GET` | `/api/v1/rooms/{roomId}/memberships` | 방 멤버 목록 | `200` |
| `GET` | `/api/v1/rooms/{roomId}/messages` | 채팅 메시지 이력 조회 | `200` |

`roomId`는 영문자, 숫자, `_`, `-`로 구성된 1~64자 문자열이다.

## 방 Command API

### 방 생성

```http
POST /api/v1/rooms
Content-Type: application/json
Idempotency-Key: <uuid>
```

요청:

```json
{
  "name": "시민 AI 토론방",
  "visibility": "LISTED",
  "joinPolicy": "OPEN"
}
```

세 필드는 모두 필수다. `name`은 앞뒤 공백을 제거한 뒤 빈 문자열일 수 없으며 최대
100자까지 허용한다.

응답 `201 Created`:

```json
{
  "clientRequestId": "07af9111-3e20-43e5-ae80-78d1bf547647",
  "code": "ROOM_CREATED",
  "replayed": false,
  "roomId": "room-01",
  "ownerMembershipId": "membership-01",
  "ownerUserId": "local-user-1",
  "roomVersion": 1,
  "ownerMembershipVersion": 1
}
```

응답에는 다음 `Location` 헤더가 포함된다.

```http
Location: /api/v1/rooms/{roomId}
```

### 방 참여

```http
POST /api/v1/rooms/{roomId}/commands/join
Idempotency-Key: <uuid>
```

요청 body는 없다.

최초 참여는 `201 Created`, 재참여 또는 이미 활성 상태이면 `200 OK`다.

```json
{
  "clientRequestId": "91b985ff-9e8e-4fb8-bf02-a360498a3d31",
  "code": "JOINED",
  "replayed": false,
  "roomId": "room-01",
  "membershipId": "membership-02",
  "membershipUserId": "local-user-2",
  "roomVersion": 2,
  "membershipVersion": 1
}
```

가능한 성공 `code`:

```text
JOINED
REJOINED
ALREADY_ACTIVE
```

`JOINED` 응답에는 다음 `Location` 헤더가 포함된다.

```http
Location: /api/v1/rooms/{roomId}/memberships/me
```

### 방 나가기

```http
POST /api/v1/rooms/{roomId}/commands/leave
Idempotency-Key: <uuid>
```

요청 body는 없다.

응답 `200 OK`의 형태는 방 참여 응답과 동일하다.

가능한 성공 `code`:

```text
LEFT
ALREADY_LEFT
```

방장은 다른 활성 멤버가 있는 상태에서 나갈 수 없다. 먼저 방장을
위임하거나 방을 종료해야 한다.

### 방장 위임

```http
POST /api/v1/rooms/{roomId}/commands/transfer-ownership
Content-Type: application/json
Idempotency-Key: <uuid>
```

요청:

```json
{
  "targetUserId": "local-user-2"
}
```

`targetUserId`는 공백이 아닌 필수 문자열이다.

응답 `200 OK`:

```json
{
  "clientRequestId": "1cc1334d-f0e2-45f1-a7ca-f638a9f699f7",
  "code": "OWNERSHIP_TRANSFERRED",
  "replayed": false,
  "roomId": "room-01",
  "previousOwnerUserId": "local-user-1",
  "newOwnerUserId": "local-user-2",
  "previousOwnerMembershipId": "membership-01",
  "newOwnerMembershipId": "membership-02",
  "roomVersion": 3,
  "previousOwnerMembershipVersion": 2,
  "newOwnerMembershipVersion": 2
}
```

### 멤버 차단

```http
POST /api/v1/rooms/{roomId}/commands/ban-member
Content-Type: application/json
Idempotency-Key: <uuid>
```

요청:

```json
{
  "targetUserId": "local-user-2"
}
```

응답 `200 OK`:

```json
{
  "clientRequestId": "a9b6bb58-a180-4e85-897b-1a90a027e798",
  "code": "BANNED",
  "replayed": false,
  "roomId": "room-01",
  "targetUserId": "local-user-2",
  "targetMembershipId": "membership-02",
  "roomVersion": 4,
  "membershipVersion": 3
}
```

가능한 성공 `code`는 `BANNED`, `ALREADY_BANNED`다.

### 멤버 차단 해제

```http
POST /api/v1/rooms/{roomId}/commands/unban-member
Content-Type: application/json
Idempotency-Key: <uuid>
```

요청:

```json
{
  "targetUserId": "local-user-2"
}
```

응답 형태는 멤버 차단 응답과 동일하다. 가능한 성공 `code`는
`UNBANNED`, `ALREADY_UNBANNED`다.

### 방 종료

```http
POST /api/v1/rooms/{roomId}/commands/close
Idempotency-Key: <uuid>
```

요청 body는 없다.

응답 `200 OK`:

```json
{
  "clientRequestId": "1ef50aac-5d83-4a92-9908-0ae96e38a2db",
  "code": "CLOSED",
  "replayed": false,
  "roomId": "room-01",
  "ownerMembershipId": "membership-01",
  "ownerUserId": "local-user-1",
  "roomVersion": 5,
  "ownerMembershipVersion": 3
}
```

가능한 성공 `code`는 `CLOSED`, `ALREADY_CLOSED`다.

## 방 Query API

모든 Query API는 `200 OK`와 함께 다음 헤더를 반환한다.

```http
Cache-Control: no-store
```

### 공개 방 목록

```http
GET /api/v1/rooms?cursor={cursor}&limit=20
```

- `status=ACTIVE`, `visibility=LISTED`인 방만 반환한다.
- `cursor`: 선택 사항. 서버가 반환한 `nextCursor`를 그대로 사용한다.
- `limit`: 선택 사항. 기본값 `20`, 허용 범위 `1~100`.
- `chat:rooms:read` scope가 필요하며, 목록 조회 자체에는 방 멤버십이 필요하지 않다.
- `joinPolicy=OPEN`인 방은 기존 방 참여 API로 참여할 수 있다.
- `joinPolicy=INVITE_ONLY`인 방도 목록에는 보이지만 현재 직접 참여할 수 없다.

응답:

```json
{
  "items": [
    {
      "roomId": "room-01",
      "name": "시민 AI 토론방",
      "ownerUserId": "local-user-1",
      "status": "ACTIVE",
      "visibility": "LISTED",
      "joinPolicy": "OPEN",
      "activeMemberCount": 2,
      "createdAt": "2026-07-29T04:30:00Z",
      "version": 2
    }
  ],
  "nextCursor": null,
  "hasNext": false
}
```

`hasNext`가 `true`이면 다음 요청의 `cursor`에 `nextCursor`를 전달한다.

### 방 상세 조회

```http
GET /api/v1/rooms/{roomId}
```

응답:

```json
{
  "roomId": "room-01",
  "name": "시민 AI 토론방",
  "ownerUserId": "local-user-1",
  "status": "ACTIVE",
  "visibility": "LISTED",
  "joinPolicy": "OPEN",
  "activeMemberCount": 2,
  "createdAt": "2026-07-29T04:30:00Z",
  "closedAt": null,
  "version": 2,
  "participationStatus": "ACTIVE",
  "myMembership": {
    "membershipId": "membership-01",
    "roomId": "room-01",
    "userId": "local-user-1",
    "role": "OWNER",
    "status": "ACTIVE",
    "joinedAt": "2026-07-29T04:30:00Z",
    "leftAt": null,
    "bannedAt": null,
    "version": 1
  }
}
```

사용자가 참여하지 않은 방이면 `myMembership`는 `null`일 수 있다.

### 내 멤버십 조회

```http
GET /api/v1/rooms/{roomId}/memberships/me
```

응답:

```json
{
  "membershipId": "membership-01",
  "roomId": "room-01",
  "userId": "local-user-1",
  "role": "OWNER",
  "status": "ACTIVE",
  "joinedAt": "2026-07-29T04:30:00Z",
  "leftAt": null,
  "bannedAt": null,
  "version": 1
}
```

멤버십이 없으면 `404 MEMBERSHIP_NOT_FOUND`를 반환한다.

### 내 활성 방 목록

```http
GET /api/v1/me/rooms?cursor={cursor}&limit=20
```

- `cursor`: 선택 사항. 서버가 반환한 `nextCursor`를 그대로 사용한다.
- `limit`: 선택 사항. 기본값 `20`, 허용 범위 `1~100`.

응답:

```json
{
  "items": [
    {
      "roomId": "room-01",
      "name": "시민 AI 토론방",
      "ownerUserId": "local-user-1",
      "status": "ACTIVE",
      "visibility": "LISTED",
      "joinPolicy": "OPEN",
      "activeMemberCount": 2,
      "createdAt": "2026-07-29T04:30:00Z",
      "version": 2,
      "membershipId": "membership-01",
      "membershipRole": "OWNER",
      "membershipStatus": "ACTIVE",
      "joinedAt": "2026-07-29T04:30:00Z",
      "membershipVersion": 1
    }
  ],
  "nextCursor": null,
  "hasNext": false
}
```

`hasNext`가 `true`이면 다음 요청의 `cursor`에 `nextCursor`를 전달한다.
cursor 값을 프론트에서 해석하거나 수정하지 않는다.

### 방 멤버 목록

```http
GET /api/v1/rooms/{roomId}/memberships?status=ACTIVE&cursor={cursor}&limit=20
```

- 방장만 조회할 수 있다.
- `status`: 기본값 `ACTIVE`; `ACTIVE`, `LEFT`, `BANNED` 중 하나.
- `cursor`: 선택 사항.
- `limit`: 선택 사항. 기본값 `20`, 허용 범위 `1~100`.

응답:

```json
{
  "items": [
    {
      "membershipId": "membership-02",
      "userId": "local-user-2",
      "role": "MEMBER",
      "status": "ACTIVE",
      "joinedAt": "2026-07-29T04:31:00Z",
      "leftAt": null,
      "bannedAt": null,
      "version": 1
    }
  ],
  "nextCursor": null,
  "hasNext": false
}
```

## 메시지 이력 Query API

채팅방 최초 진입:

```http
GET /api/v1/rooms/{roomId}/messages?limit=50
```

이전 이력 조회:

```http
GET /api/v1/rooms/{roomId}/messages?beforeSequence=71&limit=50
```

재연결 또는 누락 복구:

```http
GET /api/v1/rooms/{roomId}/messages?afterSequence=120&limit=50
```

요청 query parameter:

| Parameter | 필수 여부 | 계약 |
| --- | --- | --- |
| `beforeSequence` | 선택 | 이 값보다 작은 메시지 중 가장 가까운 과거 메시지부터 최대 `limit`개를 조회한다. `1` 이상이어야 한다. |
| `afterSequence` | 선택 | 이 값보다 큰 메시지를 순방향으로 최대 `limit`개 조회한다. `0` 이상이어야 한다. |
| `limit` | 선택 | 기본값 `50`, 허용 범위 `1~100` |

- `beforeSequence`와 `afterSequence`를 모두 생략하면 가장 최근 메시지부터
  최대 `limit`개를 조회한다.
- `beforeSequence`와 `afterSequence`는 동시에 사용할 수 없다. 함께 전달하면
  `400 INVALID_REQUEST`를 반환한다.
- 명시적인 `afterSequence=0`은 전체 이력을 처음부터 순방향으로 조회할 때
  사용한다. 채팅방 최초 진입의 기본 요청은 아니다.
- 메시지는 `roomSequence` 오름차순으로 반환한다.
- `chat:rooms:read` scope와 해당 방의 활성 멤버십이 필요하다.
- 응답에는 `Cache-Control: no-store`가 포함된다.

최신 메시지를 조회했고 더 오래된 메시지가 남아 있는 응답 예:

```json
{
  "items": [
    {
      "messageId": "message-119",
      "roomId": "room-01",
      "roomSequence": 119,
      "senderUserId": "local-user-1",
      "clientMessageId": "ed7d2fe8-996d-4660-822f-e84af1218743",
      "content": "안녕하세요.",
      "createdAt": "2026-07-29T04:40:00Z"
    },
    {
      "messageId": "message-120",
      "roomId": "room-01",
      "roomSequence": 120,
      "senderUserId": "local-user-2",
      "clientMessageId": "a42cc7c9-354c-4a67-b6b7-2f660942b21d",
      "content": "반갑습니다.",
      "createdAt": "2026-07-29T04:40:01Z"
    }
  ],
  "nextBeforeSequence": 119,
  "nextAfterSequence": null,
  "hasMore": true
}
```

응답 cursor 계약:

| 조회 방향 | `hasMore=true`일 때 설정되는 필드 | 다음 요청 |
| --- | --- | --- |
| 최초 최신 조회 또는 `beforeSequence` 조회 | `nextBeforeSequence` | `beforeSequence={nextBeforeSequence}` |
| `afterSequence` 조회 | `nextAfterSequence` | `afterSequence={nextAfterSequence}` |

- `hasMore=false`이면 `nextBeforeSequence`와 `nextAfterSequence`는 모두
  `null`이다.
- 빈 방도 `200`을 반환하며 `items`는 빈 배열, 두 cursor는 `null`,
  `hasMore`는 `false`이다.

활성 멤버가 아니면 `403 ACCESS_DENIED`, 권한 확인이 일시적으로 불가능하면
`503 AUTHORIZATION_UNAVAILABLE`, 메시지 조회가 일시적으로 불가능하면
`503 MESSAGE_HISTORY_UNAVAILABLE`를 반환한다.

최초 진입 시에는 방 topic을 구독하기 전에 실시간 이벤트 버퍼링을 시작한다.
메시지·방 이벤트 topic을 구독하고 아래의 구독 준비 sync 요청에 대한
`ROOM_SUBSCRIPTIONS_READY`를 받은 뒤 cursor 없는 최신 이력 요청을 호출한다.
REST 응답을 먼저 적용한 뒤 버퍼링한 이벤트를 적용하며, `messageId` 또는
`roomSequence`로 중복을 제거한다.

WebSocket 재연결 시에도 같은 구독 준비 절차를 거친 뒤 마지막으로 연속 적용한
sequence를 `afterSequence`로 이 API에 전달한다. sequence 누락을 감지한 경우에도
같은 방식으로 마지막 연속 sequence 이후를 다시 조회한다.

## REST 오류 응답

REST 오류는 `application/problem+json` 형식을 사용한다.

```json
{
  "type": "urn:hamcheeze:problem:invalid-idempotency-key",
  "title": "Invalid room API request",
  "status": 400,
  "detail": "Idempotency-Key must be a UUID",
  "instance": "/api/v1/rooms",
  "code": "INVALID_IDEMPOTENCY_KEY",
  "replayed": false,
  "retryable": false
}
```

body validation 오류에는 `fieldErrors`가 추가된다.

```json
{
  "type": "urn:hamcheeze:problem:invalid-request",
  "title": "Invalid room API request",
  "status": 400,
  "detail": "The request body is invalid.",
  "instance": "/api/v1/rooms",
  "code": "INVALID_REQUEST",
  "replayed": false,
  "retryable": false,
  "fieldErrors": [
    {
      "field": "visibility",
      "message": "must not be null"
    }
  ]
}
```

주요 상태와 code:

| HTTP | Code |
| --- | --- |
| `400` | `INVALID_REQUEST`, `INVALID_ROOM_ID`, `INVALID_CURSOR`, `INVALID_IDEMPOTENCY_KEY` |
| `401` | `UNAUTHENTICATED` |
| `403` | `ACCESS_DENIED`, `NOT_ROOM_OWNER`, `MEMBERSHIP_BANNED` |
| `404` | `ROOM_NOT_FOUND`, `MEMBERSHIP_NOT_FOUND`, `TARGET_MEMBERSHIP_NOT_FOUND` |
| `409` | `ROOM_CLOSED`, `JOIN_POLICY_NOT_OPEN`, `ROOM_HAS_OTHER_ACTIVE_MEMBERS`, `OWNER_CANNOT_LEAVE`, `OWNER_CANNOT_BE_BANNED`, `TARGET_MEMBERSHIP_NOT_ACTIVE`, `TARGET_MEMBERSHIP_NOT_MEMBER`, `OWNERSHIP_TARGET_MUST_DIFFER`, `IDEMPOTENCY_CONFLICT` |
| `503` | 재시도 가능한 인프라 오류 |
| `500` | `INTERNAL_ERROR` 또는 재시도 불가능한 인프라 오류 |

`retryable`이 `true`인 Command 오류를 재시도할 때는 동일한
`Idempotency-Key`를 사용한다.

## WebSocket/STOMP

### 연결

```text
ws://localhost:8082/ws
```

- Native WebSocket 위의 STOMP를 사용한다.
- SockJS endpoint가 아니다.
- 브라우저가 WebSocket handshake에 HttpOnly 쿠키를 자동으로 첨부한다.
- 쿠키로 인증되었다면 STOMP `CONNECT`에 `Authorization`을 넣지 않는다.
- STOMP heartbeat는 송신·수신 모두 `10000ms`를 권장한다.
- 한 사용자에게는 활성 연결 한 개만 유지한다. 새 연결이 생기면 기존
  연결이 교체될 수 있다.
- 새 연결로 교체된 기존 연결은 close code `4001`, reason
  `CONNECTION_REPLACED`로 종료한다. 기존 연결의 클라이언트는 이 조합을
  수신하면 자동 재연결을 중단한다.

`@stomp/stompjs` 예:

```typescript
import { Client } from "@stomp/stompjs";

const client = new Client({
  brokerURL: "ws://localhost:8082/ws",
  connectHeaders: {},
  heartbeatIncoming: 10_000,
  heartbeatOutgoing: 10_000,
  reconnectDelay: 3_000,
});
```

### Destination 요약

| 동작 | Destination | 설명 |
| --- | --- | --- |
| `SEND` | `/app/rooms/{roomId}/messages` | 채팅 메시지 전송 |
| `SEND` | `/app/rooms/{roomId}/subscriptions/sync` | 방 topic 구독 준비 확인 |
| `SUBSCRIBE` | `/topic/rooms/{roomId}/messages` | 방 채팅 메시지 수신 |
| `SUBSCRIBE` | `/topic/rooms/{roomId}/room-events` | 방 상태 변경 이벤트 수신 |
| `SUBSCRIBE` | `/user/queue/command-results` | 내 메시지 전송 결과 수신 |
| `SUBSCRIBE` | `/user/queue/system-events` | 구독 거절 및 사용자 대상 방 이벤트 수신 |

다음 destination은 현재 비활성화되어 있다.

```text
/topic/rooms/{roomId}/read-receipts
```

와일드카드 destination 구독은 허용하지 않는다. 방 단위 topic을
구독하려면 해당 방의 활성 멤버여야 한다.

로컬 기본 설정상 한 연결에서 활성 방 구독은 한 개, 전체 구독은 최대
다섯 개다.

### 구독 준비 barrier

STOMP `SUBSCRIBE` frame을 보낸 것만으로 프론트가 서버의 구독 처리를
확정해서는 안 된다. 서버는 Native STOMP `receipt`를 구독 준비 계약으로
제공하지 않으며, 같은 STOMP session의 application-level sync 요청과
`/user/queue/system-events` 응답을 barrier로 사용한다.

최초 진입, 방 전환 후 이력 동기화, WebSocket 재연결 시 다음 순서를 사용한다.

```text
1. 실시간 방 이벤트 버퍼링 시작
2. SUBSCRIBE /user/queue/system-events
3. SUBSCRIBE /topic/rooms/{roomId}/messages
4. SUBSCRIBE /topic/rooms/{roomId}/room-events
5. SEND      /app/rooms/{roomId}/subscriptions/sync
6. /user/queue/system-events에서 ROOM_SUBSCRIPTIONS_READY 수신
7. REST 최신 이력 또는 afterSequence 이력 조회
8. REST 결과 적용 후 버퍼 이벤트 병합 및 중복 제거
```

사용자 공통 `/user/queue/system-events` 구독은 WebSocket 연결마다 한 번만
생성한다. 이미 구독되어 있다면 방 전환 때 2단계를 반복하지 않는다.
프론트는 1단계를 방 topic `SUBSCRIBE`보다 먼저 실행해야 한다.

sync destination:

```text
/app/rooms/{roomId}/subscriptions/sync
```

필요 scope는 `chat:rooms:read`이며, payload의 `requestId`는 요청별 UUID다.

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

서버는 동일 session에서 앞서 보낸 두 room topic `SUBSCRIBE`를 처리했고
사용자의 활성 멤버십을 다시 확인한 경우에만 다음 응답을 같은 session의
`/user/queue/system-events`로 전송한다.

```json
{
  "status": "READY",
  "eventType": "ROOM_SUBSCRIPTIONS_READY",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "roomId": "room-01",
  "watermarkSequence": 120
}
```

`watermarkSequence`는 READY를 생성할 때 서버에 저장되어 있던 해당 방의
최신 `roomSequence`이며 빈 방은 `0`이다. 이 값은 REST 응답의 상한을
고정하는 cursor가 아니다. REST 결과와 버퍼 이벤트는 계속
`messageId`와 `roomSequence`로 중복을 제거한다.

sync 요청이 거절되면 다음 형태를 사용한다.

```json
{
  "status": "REJECTED",
  "eventType": "ROOM_SUBSCRIPTION_SYNC_REJECTED",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "roomId": "room-01",
  "code": "ROOM_SUBSCRIPTIONS_NOT_READY",
  "retryable": false
}
```

| Code | `retryable` | 의미 |
| --- | --- | --- |
| `INVALID_SYNC_REQUEST` | `false` | `requestId`가 올바른 UUID가 아니다. |
| `ROOM_SUBSCRIPTIONS_NOT_READY` | `false` | 같은 session에 필요한 방 topic 두 개가 모두 등록되지 않았다. 구독 거절 이벤트와 구독 순서를 확인한다. |
| `ROOM_SUBSCRIPTION_FORBIDDEN` | `false` | 사용자가 해당 방의 활성 멤버가 아니다. |
| `ROOM_AUTHORIZATION_UNAVAILABLE` | `true` | 멤버십 권한 확인이 일시적으로 불가능하다. |
| `ROOM_SUBSCRIPTION_SYNC_UNAVAILABLE` | `true` | watermark 조회가 일시적으로 불가능하다. |

`retryable=true`이면 연결과 topic 구독이 유지된 상태에서 새 `requestId`로
sync 요청만 재시도할 수 있다. READY를 받기 전에는 REST snapshot을 시작하지
않는다.

### 활성 방 선점 전환

SharedWorker는 사용자 공통 destination을 유지한 채 활성 방을 선점 방식으로 전환할 수 있다.
서버는 동일한 WebSocket session에서 받은 STOMP frame을 수신 순서대로 처리한다.

방 A에서 방 B로 전환할 때 다음 순서를 사용한다.

```text
UNSUBSCRIBE /topic/rooms/{roomA}/messages
UNSUBSCRIBE /topic/rooms/{roomA}/room-events
SUBSCRIBE   /topic/rooms/{roomB}/messages
SUBSCRIBE   /topic/rooms/{roomB}/room-events
```

- 각 `UNSUBSCRIBE`에는 기존 `SUBSCRIBE`에서 사용한 subscription ID를 전달한다.
- `/user/queue/command-results`와 `/user/queue/system-events` 구독은 방 전환 중에도 유지한다.
- 기존 방의 마지막 room-scoped subscription이 제거되면 기존 `roomId`가 비활성화된다.
- 같은 WebSocket session에서 위 네 frame을 순서대로 보내면 별도의 receipt 대기 없이 처리 순서가
  보존된다.
- 기존 방 topic이 하나라도 남은 상태에서 다른 `roomId`를 구독하면
  `ACTIVE_ROOM_LIMIT_EXCEEDED`로 해당 구독만 거절하며 연결은 유지한다.
- 같은 방을 여러 탭에서 열 때는 SharedWorker가 기존 topic 구독을 재사용하며 동일 destination을
  중복 구독하지 않는다.
- 탭 owner 교체와 `ROOM_REPLACED` 알림은 프론트 내부 상태이며 서버 WebSocket/STOMP 이벤트가
  아니다.

### 메시지 전송

Destination:

```text
/app/rooms/{roomId}/messages
```

payload:

```json
{
  "clientMessageId": "ed7d2fe8-996d-4660-822f-e84af1218743",
  "content": "안녕하세요."
}
```

- `clientMessageId`: 메시지별 UUID. 재시도 시 같은 값을 사용한다.
- `content`: 공백만 있는 메시지는 허용하지 않는다.
- 최대 2,000 Unicode code point 및 UTF-8 8,192 bytes.
- TAB, LF, CR을 제외한 C0 제어 문자는 허용하지 않는다.

전송 예:

```typescript
client.publish({
  destination: `/app/rooms/${roomId}/messages`,
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify({
    clientMessageId: crypto.randomUUID(),
    content: message,
  }),
});
```

### 메시지 Command 결과

구독:

```text
/user/queue/command-results
```

수락:

```json
{
  "clientMessageId": "ed7d2fe8-996d-4660-822f-e84af1218743",
  "status": "ACCEPTED",
  "code": null,
  "retryable": false,
  "retryAfterMs": null,
  "messageId": "message-01",
  "roomSequence": 1
}
```

같은 `clientMessageId`와 같은 메시지를 재전송한 경우:

```json
{
  "clientMessageId": "ed7d2fe8-996d-4660-822f-e84af1218743",
  "status": "DUPLICATE",
  "code": null,
  "retryable": false,
  "retryAfterMs": null,
  "messageId": "message-01",
  "roomSequence": 1
}
```

거절:

```json
{
  "clientMessageId": "ed7d2fe8-996d-4660-822f-e84af1218743",
  "status": "REJECTED",
  "code": "MESSAGE_TOO_LONG",
  "retryable": false,
  "retryAfterMs": null,
  "messageId": null,
  "roomSequence": null
}
```

실패:

```json
{
  "clientMessageId": "ed7d2fe8-996d-4660-822f-e84af1218743",
  "status": "FAILED",
  "code": "PERSISTENCE_FAILED",
  "retryable": true,
  "retryAfterMs": null,
  "messageId": null,
  "roomSequence": null
}
```

주요 거절 code:

```text
EMPTY_MESSAGE
INVALID_CLIENT_MESSAGE_ID
INVALID_CONTROL_CHARACTER
MESSAGE_TOO_LONG
MESSAGE_TOO_LARGE
ROOM_SEND_FORBIDDEN
USER_RATE_LIMITED
IDEMPOTENCY_CONFLICT
SERVER_BUSY
```

주요 실패 code:

```text
ROOM_AUTHORIZATION_UNAVAILABLE
CHAT_PIPELINE_UNAVAILABLE
INTERNAL_ERROR
PERSISTENCE_FAILED
```

`retryable`이 `true`이면 `retryAfterMs` 이후 동일한
`clientMessageId`와 동일한 content로 재시도한다.

### 채팅 메시지 이벤트

구독:

```text
/topic/rooms/{roomId}/messages
```

payload:

```json
{
  "eventVersion": 1,
  "eventType": "CHAT_MESSAGE_CREATED",
  "payload": {
    "messageId": "message-01",
    "roomId": "room-01",
    "roomSequence": 1,
    "senderUserId": "local-user-1",
    "clientMessageId": "ed7d2fe8-996d-4660-822f-e84af1218743",
    "content": "안녕하세요.",
    "createdAt": "2026-07-29T04:40:00Z"
  }
}
```

`roomSequence`를 이용해 방 안에서 메시지 순서를 판단한다.

### 방 이벤트

구독:

```text
/topic/rooms/{roomId}/room-events
```

공통 envelope:

```json
{
  "eventVersion": 1,
  "eventId": "event-01",
  "eventType": "ROOM_MEMBER_JOINED",
  "emittedAt": "2026-07-29T04:41:00Z",
  "payload": {
    "roomId": "room-01",
    "roomVersion": 2,
    "roomStatus": "ACTIVE",
    "member": {
      "membershipId": "membership-02",
      "userId": "local-user-2",
      "role": "MEMBER",
      "status": "ACTIVE",
      "membershipVersion": 1
    }
  }
}
```

이벤트 타입:

```text
ROOM_CREATED
ROOM_MEMBER_JOINED
ROOM_MEMBER_REJOINED
ROOM_MEMBER_LEFT
ROOM_OWNERSHIP_TRANSFERRED
ROOM_MEMBER_BANNED
ROOM_MEMBER_UNBANNED
ROOM_CLOSED
```

payload 형태:

| 이벤트 | payload의 상태 객체 |
| --- | --- |
| `ROOM_CREATED` | `owner` |
| `ROOM_MEMBER_JOINED`, `ROOM_MEMBER_REJOINED`, `ROOM_MEMBER_LEFT`, `ROOM_MEMBER_BANNED`, `ROOM_MEMBER_UNBANNED` | `member` |
| `ROOM_OWNERSHIP_TRANSFERRED` | `previousOwner`, `newOwner` |
| `ROOM_CLOSED` | `owner` |

모든 `member`, `owner`, `previousOwner`, `newOwner` 상태 객체에는 플랫폼 사용자 식별자인
`userId`와 방 멤버십 식별자인 `membershipId`가 함께 포함됩니다.

### 사용자 System 이벤트

구독:

```text
/user/queue/system-events
```

구독 거절 예:

```json
{
  "status": "REJECTED",
  "code": "ROOM_SUBSCRIPTION_FORBIDDEN",
  "destination": "/topic/rooms/room-01/messages"
}
```

구독 거절 code:

```text
ACTIVE_ROOM_LIMIT_EXCEEDED
SUBSCRIPTION_LIMIT_EXCEEDED
ROOM_SUBSCRIBER_LIMIT_EXCEEDED
DUPLICATE_SUBSCRIPTION
INVALID_DESTINATION
DESTINATION_DISABLED
ROOM_SUBSCRIPTION_FORBIDDEN
ROOM_AUTHORIZATION_UNAVAILABLE
```

사용자에게 직접 전달해야 하는 방 이벤트도 같은 queue로 올 수 있다.
이 경우에는 앞의 `RoomEventEnvelope` 형태다. 프론트는 `status` 또는
`eventType` 필드로 두 형태를 구분한다.

## 최종 로컬 연동 스모크 테스트

Docker Compose로 서버와 MongoDB를 실행한 뒤 프론트 연동 계약 전체를 한 번에 확인할 수 있다.

```bash
docker compose -f compose.local.yaml up --build -d
python3 scripts/frontend-local-smoke.py
```

스크립트는 별도 Python 패키지 없이 다음 흐름을 검증한다.

1. `http://localhost:8082/actuator/health`
2. credential CORS preflight
3. `civic_ai_access_token` 쿠키 JWT REST 인증
4. 내 방 목록과 공개 방 목록
5. `LISTED`, `OPEN` 방 생성과 상세 조회
6. 쿠키 WebSocket handshake
7. `Authorization` 헤더 없는 STOMP `CONNECT`
8. 방 topic 두 개의 구독 준비 sync와 `ROOM_SUBSCRIPTIONS_READY`
9. 메시지 전송, command 결과, `CHAT_MESSAGE_CREATED`
10. REST 메시지 이력 재동기화

각 실행은 이름이 `frontend-smoke-`로 시작하는 테스트 방 하나와 메시지 하나를 로컬 MongoDB에
추가한다. 다른 주소를 사용할 때는 `--base-url`, `--ws-url`, `--origin`, `--subject` 옵션으로
덮어쓸 수 있다.

## 권장 프론트 연동 순서

1. Next.js 임시 로그인을 실행한다.
2. `GET /api/v1/me/rooms`로 REST 쿠키 인증을 확인한다.
3. `GET /api/v1/rooms`로 공개 방 목록을 확인한다.
4. `POST /api/v1/rooms`로 방을 생성한다.
5. `GET /api/v1/rooms/{roomId}`로 생성된 방을 확인한다.
6. `ws://localhost:8082/ws`에 연결한다.
7. `/user/queue/command-results`를 구독한다.
8. `/user/queue/system-events`를 구독한다.
9. 방 실시간 이벤트의 로컬 버퍼링을 시작한다.
10. `/topic/rooms/{roomId}/messages`를 구독한다.
11. `/topic/rooms/{roomId}/room-events`를 구독한다.
12. 같은 STOMP session에서
    `/app/rooms/{roomId}/subscriptions/sync`로 UUID `requestId`를 보낸다.
13. `/user/queue/system-events`에서 같은 `requestId`의
    `ROOM_SUBSCRIPTIONS_READY`를 기다린다.
14. `GET /api/v1/rooms/{roomId}/messages`로 최신 메시지를 조회하고,
    이전 이력은 `beforeSequence` cursor로 조회한다.
15. REST 결과를 먼저 적용하고 버퍼 이벤트를 병합하며 중복을 제거한다.
16. `/app/rooms/{roomId}/messages`로 메시지를 전송한다.
17. command 결과와 `CHAT_MESSAGE_CREATED` 이벤트를 확인한다.
