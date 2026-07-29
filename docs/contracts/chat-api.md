# Chat Resource Server 프론트엔드 연동 명세

## 문서 상태

- 기준 환경: 로컬 연동
- Chat Resource Server: `http://localhost:8082`
- WebSocket endpoint: `ws://localhost:8082/ws`
- Frontend origin: `http://localhost:3000`
- 인증 쿠키: `civic_ai_access_token`
- REST API prefix: `/api/v1`

현재 서버가 제공하는 범위는 방 관리 REST API와 실시간 채팅 WebSocket/STOMP이다.
메시지 이력 조회 REST API는 아직 제공하지 않는다.

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

```http
GET /api/v1/rooms/{roomId}/messages?afterSequence=0&limit=50
```

- `afterSequence`: 선택 사항. 기본값 `0`. 이 값보다 큰 `roomSequence`만 조회한다.
- `limit`: 선택 사항. 기본값 `50`, 허용 범위 `1~100`.
- 메시지는 `roomSequence` 오름차순으로 반환한다.
- `chat:rooms:read` scope와 해당 방의 활성 멤버십이 필요하다.
- 응답에는 `Cache-Control: no-store`가 포함된다.

응답:

```json
{
  "items": [
    {
      "messageId": "message-01",
      "roomId": "room-01",
      "roomSequence": 1,
      "senderUserId": "local-user-1",
      "clientMessageId": "ed7d2fe8-996d-4660-822f-e84af1218743",
      "content": "안녕하세요.",
      "createdAt": "2026-07-29T04:40:00Z"
    }
  ],
  "nextAfterSequence": null,
  "hasNext": false
}
```

`hasNext`가 `true`이면 다음 요청의 `afterSequence`에 `nextAfterSequence`를 전달한다.
활성 멤버가 아니면 `403 ACCESS_DENIED`, 권한 확인이 일시적으로 불가능하면
`503 AUTHORIZATION_UNAVAILABLE`, 메시지 조회가 일시적으로 불가능하면
`503 MESSAGE_HISTORY_UNAVAILABLE`를 반환한다.

WebSocket 재연결 시에는 메시지 topic을 먼저 구독하고, 구독이 완료될 때까지 들어온 이벤트를
버퍼링한 상태에서 마지막으로 연속 적용한 sequence를 `afterSequence`로 이 API를 호출한다.
REST 이력을 먼저 sequence 순서로 적용한 뒤 버퍼링한 이벤트를 적용하며, `messageId` 또는
`roomSequence`로 중복을 제거한다. sequence 누락을 감지한 경우에도 같은 방식으로 마지막 연속
sequence 이후를 다시 조회한다.

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

## 권장 프론트 연동 순서

1. Next.js 임시 로그인을 실행한다.
2. `GET /api/v1/me/rooms`로 REST 쿠키 인증을 확인한다.
3. `GET /api/v1/rooms`로 공개 방 목록을 확인한다.
4. `POST /api/v1/rooms`로 방을 생성한다.
5. `GET /api/v1/rooms/{roomId}`로 생성된 방을 확인한다.
6. `ws://localhost:8082/ws`에 연결한다.
7. `/user/queue/command-results`를 구독한다.
8. `/user/queue/system-events`를 구독한다.
9. `/topic/rooms/{roomId}/messages`를 구독한다.
10. `/topic/rooms/{roomId}/room-events`를 구독한다.
11. `GET /api/v1/rooms/{roomId}/messages?afterSequence=0`으로 기존 메시지를 조회한다.
12. `/app/rooms/{roomId}/messages`로 메시지를 전송한다.
13. command 결과와 `CHAT_MESSAGE_CREATED` 이벤트를 확인한다.
