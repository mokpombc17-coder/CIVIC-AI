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
> 방 전환 시 사용자 공통 queue 3개는 유지하고 다음 순서로 처리해 주세요.
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
> 같은 `userId`로 인증된 새 연결이 기존 연결을 교체하면 서버는 기존
> WebSocket을 close code `4001`, reason `CONNECTION_REPLACED`로 종료합니다.
> 이 경우 기존 연결에서는 자동 재연결을 중단해 주세요.
>
> STOMP `CONNECT` 시 인증 쿠키가 없거나 JWT가 만료·변조·무효한 경우에는
> close code `4004`가 아니라 `AUTHENTICATION_REQUIRED` STOMP `ERROR`
> frame을 보냅니다. 최초 연결과 자동 재연결 모두 같은 계약입니다. 프론트는
> 이 ERROR를 받으면 인증 필요 상태를 먼저 확정하고 자동 재연결을 중단한 뒤,
> 로그인 성공 후 명시적으로 새 연결을 생성해 주세요. ERROR 뒤에 오는 일반
> WebSocket close event가 인증 필요 상태를 덮어쓰면 안 됩니다.

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
- Allowed Methods: `GET`, `POST`, `PUT`, `OPTIONS`
- Allowed Headers: `Content-Type`, `Idempotency-Key`, `Authorization`

인증 쿠키가 없거나 유효하지 않으면 `401 Unauthorized`, 필요한 권한이
없으면 `403 Forbidden`을 반환한다.

로컬 JWT가 발급하는 scope는 다음과 같다.

```text
chat:connect
chat:rooms:read
chat:rooms:write
chat:messages:write
chat:read-state:write
```

기능별 요구 권한 계약은 다음과 같다.

| 기능 | Scope |
| --- | --- |
| WebSocket 연결 | `chat:connect` |
| 방 및 멤버십 조회 | `chat:rooms:read` |
| 방 topic 구독 및 구독 준비 sync | `chat:rooms:read` |
| 방 생성 및 상태 변경 | `chat:rooms:write` |
| 채팅 메시지 전송 | `chat:messages:write` |
| 개인 Room 읽음 위치 갱신 | `chat:read-state:write` |

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
| `RoomCategory` | `POLICY`, `ENVIRONMENT`, `LOCAL_ISSUE` |
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
| `POST` | `/api/v1/rooms/{roomId}/commands/update-settings` | 방 설정 부분 변경 | `200` |
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
  "description": "AI 정책과 시민 참여 방식을 논의합니다.",
  "categories": ["POLICY"],
  "visibility": "LISTED",
  "joinPolicy": "OPEN"
}
```

`name`, `categories`, `visibility`, `joinPolicy`는 필수다. `description`은 선택
사항이며 누락하거나 `null` 또는 빈 문자열로 보내면 `""`로 저장된다.
`name`은 앞뒤 공백을 제거한 뒤 빈 문자열일 수 없으며 최대 100자까지
허용한다.

`description`은 plain text다. 앞뒤 Unicode 공백은 제거하고 내부 공백과
줄바꿈은 보존한다. 최대 500 Unicode code point이며 TAB, LF, CR을 제외한
C0 제어문자는 허용하지 않는다. Markdown 또는 HTML 렌더링 의미는 제공하지
않는다.

`categories`는 중복 없는 `RoomCategory` 배열이다. 현재 계약에서는 정확히
1개를 요구한다. 배열 형태를 사용해 향후 최대 3개까지 확장할 수 있도록 하되,
현재 2개 이상을 보내면 `400 INVALID_REQUEST`다. 표시 문구는 프론트에서
`POLICY=정책`, `ENVIRONMENT=환경`, `LOCAL_ISSUE=지역 현안`으로 현지화한다.

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

### 방 설정 변경

```http
POST /api/v1/rooms/{roomId}/commands/update-settings
Content-Type: application/json
Idempotency-Key: <uuid>
```

방장만 ACTIVE 방의 설정을 변경할 수 있다. 요청은 부분 갱신이며
`expectedVersion`을 받지 않는다.

```json
{
  "name": "지역 교통 정책 토론방",
  "description": "지역 대중교통 정책과 개선 방안을 논의합니다.",
  "categories": ["LOCAL_ISSUE"],
  "visibility": "UNLISTED",
  "joinPolicy": "OPEN"
}
```

- 누락한 필드는 현재 값을 유지한다.
- 명시적인 `null`은 `400 INVALID_REQUEST`다.
- 빈 object `{}`도 `400 INVALID_REQUEST`다.
- 설명을 제거하려면 `"description": ""`을 보낸다.
- 카테고리는 `categories` 전체 배열 교체 방식이며 현재 정확히 1개여야 한다.
- 정규화된 요청값 전체가 현재 설정과 같으면 version을 올리지 않는다.
- 한 요청에서 여러 필드가 바뀌어도 `roomVersion`은 정확히 1 증가한다.

실제 변경 응답:

```json
{
  "clientRequestId": "07af9111-3e20-43e5-ae80-78d1bf547647",
  "code": "ROOM_SETTINGS_UPDATED",
  "replayed": false,
  "roomId": "room-01",
  "name": "지역 교통 정책 토론방",
  "description": "지역 대중교통 정책과 개선 방안을 논의합니다.",
  "categories": ["LOCAL_ISSUE"],
  "visibility": "UNLISTED",
  "joinPolicy": "OPEN",
  "roomVersion": 8
}
```

실제 변경이 없으면 같은 snapshot과
`ROOM_SETTINGS_UNCHANGED`를 `200 OK`로 반환한다. 같은
`Idempotency-Key`와 같은 canonical patch를 재전송하면 최초 snapshot을
`replayed=true`로 반환하며 version이나 event를 추가하지 않는다. 같은
key의 다른 patch는 `409 IDEMPOTENCY_CONFLICT`다.

Room 없음은 `404 ROOM_NOT_FOUND`, 방장이 아니면
`403 NOT_ROOM_OWNER`, 종료된 방은 `409 ROOM_CLOSED`다.

`LISTED`는 공개 목록 노출, `UNLISTED`는 공개 목록 비노출만 뜻한다.
직접 roomId로 조회하는 기존 계약과 기존 ACTIVE 멤버·구독·메시지 접근은
유지된다. `OPEN`은 신규 join과 LEFT 상태의 rejoin을 허용한다.
`INVITE_ONLY`는 현재 공개 join과 rejoin을 차단하며 기존 ACTIVE 멤버는
유지한다. 초대 생성·수락 API는 현재 제공하지 않는다.

### 방 참여

```http
POST /api/v1/rooms/{roomId}/commands/join
Idempotency-Key: <uuid>
```

요청 body는 없다.

최초 참여는 `201 Created`, 재참여 또는 이미 활성 상태이면 `200 OK`다.

한 방의 `ACTIVE` Membership은 OWNER를 포함하며, 현재 제품 정책의 기본
최대값은 50명이다. 이 값은 서버 설정으로 변경될 수 있으므로 클라이언트가
숫자 50을 고정 계약으로 사용해서는 안 된다. 제한은 신규 join과
`LEFT -> ACTIVE` rejoin에만 적용되며, 정원에 도달한 방에서 실제 ACTIVE 수를
늘리려는 요청은 `409 ROOM_MEMBER_LIMIT_EXCEEDED`로 거절된다. 이미 ACTIVE인
사용자의 중복 join은 정원과 관계없이 `ALREADY_ACTIVE`다. leave 또는 ACTIVE
MEMBER ban으로 자리가 생기면 다시 join/rejoin할 수 있고, unban은 LEFT 상태만
복원하므로 정원을 소비하지 않는다.

이 영속 Membership 제한은 WebSocket의 동시 Room topic 구독 제한인
`chat.websocket.subscription.max-subscribers-per-room`과 서로 다른 설정이다.
두 값은 독립적으로 변경할 수 있다.

최초 참여가 확정될 때 서버는 참여 직전까지 확정된 방의 최신
`roomSequence`를 Membership의 `messageVisibleAfterSequence`로 저장한다.
재참여(`LEFT -> ACTIVE`) 시에는 새 참여 시점의 최신 sequence로 이 경계를
교체하므로 이전 참여 구간과 퇴장 중 생성된 메시지는 다시 조회할 수 없다.
이미 `ACTIVE`인 사용자의 중복 join(`ALREADY_ACTIVE`)은 기존 경계를 변경하지
않는다. 방 생성 시 방장의 경계는 `0`이다.

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
      "description": "AI 정책과 시민 참여 방식을 논의합니다.",
      "categories": ["POLICY"],
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
  "description": "AI 정책과 시민 참여 방식을 논의합니다.",
  "categories": ["POLICY"],
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
      "description": "AI 정책과 시민 참여 방식을 논의합니다.",
      "categories": ["POLICY"],
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

메시지 이력의 접근 하한은 현재 Membership에 저장된
`messageVisibleAfterSequence`다. 사용자는 현재 참여 구간이 시작된 뒤 생성된,
즉 `roomSequence > messageVisibleAfterSequence`인 메시지만 조회할 수 있다.

- 최신 조회에도 이 하한이 적용된다.
- `beforeSequence` 조회는 경계보다 크고 cursor보다 작은 메시지만 반환한다.
  cursor가 경계 이하이면 빈 페이지를 반환한다.
- `afterSequence` 조회의 실제 하한은
  `max(afterSequence, messageVisibleAfterSequence)`다.
- `beforeSequence`나 `afterSequence`를 임의로 조작해도 현재 Membership의
  경계 이전 메시지는 반환되지 않는다.
- 재참여하면 새 접근 경계가 설정되며 이전 참여 구간과 퇴장 중 생성된
  메시지는 조회할 수 없다.

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
      "state": "ACTIVE",
      "messageVersion": 1,
      "createdAt": "2026-07-29T04:40:00Z",
      "updatedAt": "2026-07-29T04:40:00Z",
      "deletedAt": null
    },
    {
      "messageId": "message-120",
      "roomId": "room-01",
      "roomSequence": 120,
      "senderUserId": "local-user-2",
      "clientMessageId": "a42cc7c9-354c-4a67-b6b7-2f660942b21d",
      "content": "반갑습니다.",
      "state": "ACTIVE",
      "messageVersion": 1,
      "createdAt": "2026-07-29T04:40:01Z",
      "updatedAt": "2026-07-29T04:40:01Z",
      "deletedAt": null
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
`roomSequence`로 중복을 제거한다. 버퍼에 있는 메시지 중
`roomSequence <= messageVisibleAfterSequence`인 항목은 적용하지 않고
폐기한다. 이 클라이언트 처리는 상태 복구를 위한 방어 로직이며, 서버도
동일한 경계로 subscriber별 outbound 메시지를 차단한다.

수정·삭제된 메시지도 기존 `roomSequence` 위치에 현재 snapshot 또는 tombstone으로
남는다. 수정·삭제는 새 sequence를 소비하지 않으며 `messageVersion`만 증가한다.
WebSocket 재연결 시 현재 화면에 로드한 최신 범위를 REST snapshot으로 다시
조회하고, REST를 먼저 적용한 뒤 버퍼 event를 같은 `messageId`의
`messageVersion`으로 병합한다. `incoming.messageVersion <= current.messageVersion`
이면 중복 또는 역순 event로 보고 무시한다. 과거 페이지는 사용자가 다시 열 때
REST에서 현재 snapshot을 조회한다.

`afterSequence`는 마지막 연속 sequence 뒤에 새로 생성된 메시지의 누락을
복구하는 cursor다. 과거 메시지의 UPDATE/DELETE change feed가 아니며,
이 cursor만으로 mutation을 증분 복구할 수 있다고 가정하면 안 된다.

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
- 인증은 WebSocket HTTP upgrade가 아니라 STOMP `CONNECT`에서 확정한다.
- STOMP heartbeat는 송신·수신 모두 `10000ms`를 권장한다.
- 한 사용자에게는 활성 연결 한 개만 유지한다. 새 연결이 생기면 기존
  연결이 교체될 수 있다.
- 새 연결로 교체된 기존 연결은 close code `4001`, reason
  `CONNECTION_REPLACED`로 종료한다. 기존 연결의 클라이언트는 이 조합을
  수신하면 자동 재연결을 중단한다.
- 퇴장·차단으로 방 접근이 회수되면 close code `4002`, reason
  `ROOM_ACCESS_REVOKED`, 방 종료 시에는 close code `4003`, reason
  `ROOM_CLOSED`로 연결을 종료한다. 이 코드로 종료된 기존 연결은 재사용하지
  않고 필요한 경우 새 WebSocket 연결을 생성한다.

### STOMP CONNECT 인증 실패

다음 인증 실패는 외부에서 세부 원인을 구분하지 않고 모두 동일한 terminal
신호로 전달한다.

- 인증 쿠키 없음
- JWT 만료
- JWT 서명·issuer·audience 등 검증 실패
- 인증 Principal 생성 실패

서버가 반환하는 STOMP frame의 계약은 다음과 같다.

```text
ERROR
message:AUTHENTICATION_REQUIRED
content-type:application/json

{"code":"AUTHENTICATION_REQUIRED","retryable":false}\0
```

`authReason`은 현재 제공하지 않는다. `message`, `code`, `retryable`이 인증
실패를 판정하는 authoritative 값이다. 인증 ERROR 이후 Spring STOMP transport가
WebSocket을 `1002 PROTOCOL_ERROR` 등 일반 close code로 종료할 수 있지만,
후속 close는 앞서 수신한 `AUTHENTICATION_REQUIRED` 상태를 덮는 신호가 아니다.
인증 실패에 전용 close code `4004`를 사용하지 않는다.

최초 연결과 자동 재연결은 모두 새로운 WebSocket에서 같은 STOMP `CONNECT`
인증 경로를 사용하므로 위 ERROR 계약이 동일하게 적용된다. 다만 네트워크
단절, TLS 오류, HTTP upgrade 실패처럼 STOMP `CONNECT`가 서버에 도달하지 않은
경우에는 ERROR frame을 보낼 수 없으며 일반 transport failure로 처리한다.

프론트는 `AUTHENTICATION_REQUIRED`를 받으면 다음 순서를 따른다.

1. terminal authentication state를 저장한다.
2. STOMP 자동 재연결을 중단한다.
3. 로그인 필요 UI를 표시한다.
4. 후속 WebSocket close event로 terminal 상태를 덮지 않는다.
5. 로그인 성공 후 명시적으로 새 WebSocket/STOMP 연결을 생성한다.
6. 연결 성공 후 기존 active Room session과 topic subscription을 재동기화한다.

현재 활성 WebSocket은 연결 시점의 STOMP `CONNECT`에서만 인증한다. 연결된
상태에서 JWT `exp`에 도달했다는 이유만으로 서버가 socket을 즉시 종료하거나
SEND/SUBSCRIBE마다 JWT를 다시 검증하지 않는다. 연결이 끊어진 뒤 새
`CONNECT`를 시도할 때 쿠키가 유효하지 않으면 위 인증 ERROR가 적용된다.

`4001 CONNECTION_REPLACED`는 인증에 성공한 같은 `userId`의 새 연결이 기존
active connection을 교체할 때만 기존 연결에 전달한다. 현재 프로토콜에는
`clientInstanceId`나 `logicalSessionId`가 없으므로 같은 브라우저의 새 연결과
다른 기기의 새 연결을 서버가 구분하지 않는다. 인증되지 않은 연결 시도만으로
기존 연결에 `4001`을 보내지는 않는다.

교체 시 서버는 다음 key-value 필드를 한 줄의 구조화 로그로 남긴다.

```text
WebSocket connection replacement: userId=<userId>, oldConnectionId=<oldId>, newConnectionId=<newId>, replacementReason=CONNECTION_REPLACED, closeResult=<result>
```

`closeResult`는 `CLOSED`, `ALREADY_CLOSED_OR_MISSING`, `FAILED` 중 하나다.
`FAILED`는 WARN, 나머지는 INFO level로 기록한다. JWT, 인증 쿠키, STOMP frame
body는 기록하지 않는다. 현재 서버가 `clientInstanceId`를 수집하지 않으므로
`oldClientInstanceId`와 `newClientInstanceId`도 로그 필드에 포함하지 않는다.

퇴장, 차단 또는 방 종료가 commit된 뒤 transport close가 실패하더라도
해당 connection의 그 방 `messages`, `room-events` subscription은 서버
registry에서 즉시 격리된다. 따라서 close 재시도 전에도 추가 room payload는
전달되지 않는다. Command가 `ACCESS_REVOCATION_FAILED`,
`retryable=true`를 반환하면 같은 `Idempotency-Key`로 다시 요청하며,
서버는 Room/Membership을 다시 변경하거나 terminal Room event를 다시
발행하지 않고 transport close만 재시도한다. 사용자 공통
`command-results`, `system-events` queue는 이 방 단위 격리 대상이 아니다.

Room/Membership 변경이 commit된 뒤 현재 access snapshot을 읽을 수 없거나
snapshot이 누락·무효인 경우에도 기존 room subscription을 유지하지 않는다.
서버는 현재 경계를 추측하지 않고 해당 사용자의 그 방 접근을 전체 회수하며,
`messages`와 `room-events`를 먼저 격리한 뒤 transport close를 시도한다.
상태가 불명확하므로 현재 Membership과 일치하는 새 subscription까지 종료될 수
있다. 클라이언트는 `4002 ROOM_ACCESS_REVOKED`를 받은 연결을 재사용하지 않고
새 WebSocket 연결을 생성한 뒤 room topic 구독과 subscription sync를 다시
수행한다.

Access snapshot 조회가 실패했더라도 quarantine과 transport close가
성공했거나 matching connection이 없으면 원래 Room command는 정상 결과로
반환될 수 있다. Transport close가 실패한 경우에만
`ACCESS_REVOCATION_FAILED`, `retryable=true`를 반환하며, 같은
`Idempotency-Key`로 재요청해 close를 재시도한다.

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
| `SEND` | `/app/rooms/{roomId}/messages/edit` | 작성자 메시지 수정 |
| `SEND` | `/app/rooms/{roomId}/messages/delete` | 작성자 메시지 soft delete |
| `SEND` | `/app/rooms/{roomId}/subscriptions/sync` | 방 topic 구독 준비 확인 |
| `SUBSCRIBE` | `/topic/rooms/{roomId}/messages` | 방 채팅 메시지 수신 |
| `SUBSCRIBE` | `/topic/rooms/{roomId}/room-events` | 방 상태 변경 이벤트 수신 |
| `SUBSCRIBE` | `/user/queue/command-results` | 내 메시지 전송 결과 수신 |
| `SUBSCRIBE` | `/user/queue/system-events` | 구독 거절 및 사용자 대상 방 이벤트 수신 |
| `SUBSCRIBE` | `/user/queue/room-inbox-events` | 토스트 hint 및 room-inbox REST query invalidation 수신 |

다음 destination은 현재 비활성화되어 있다.

```text
/topic/rooms/{roomId}/read-receipts
```

와일드카드 destination 구독은 허용하지 않는다. 방 단위 topic을
구독하려면 해당 방의 활성 멤버여야 한다.

로컬 기본 설정상 한 연결에서 활성 방 구독은 한 개, 전체 구독은 최대
여섯 개다. 정상 클라이언트는 사용자 queue 세 개와 현재 Room topic 두 개,
총 다섯 개를 동시에 사용하므로 `max-subscriptions-per-connection`은 최소
`5`여야 하며, 그보다 낮은 설정은 애플리케이션 startup validation에서
거절된다. 기본값 `6`은 추가 구독 하나의 여유를 둔다.

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
  "messageVisibleAfterSequence": 100,
  "watermarkSequence": 120
}
```

`messageVisibleAfterSequence`는 현재 참여 구간의 배타적 접근 하한이다.
클라이언트는 이 값 이하의 실시간 buffer 메시지를 적용하지 않고 폐기해야 한다.

`watermarkSequence`는 READY를 생성할 때 서버에 저장되어 있던 해당 방의
최신 `roomSequence`이며 빈 방은 `0`이다. 이 값은 REST 응답의 상한을
고정하는 cursor가 아니며 `messageVisibleAfterSequence`와 의미가 다르다.
REST 결과와 버퍼 이벤트는 계속
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
| `ROOM_SUBSCRIPTION_STALE` | `false` | 기존 room subscription이 접근 회수 과정에서 격리되었거나 현재 Membership과 다른 `messageVisibleAfterSequence`를 사용한다. 아래 절차로 새로 구독한다. |
| `ROOM_AUTHORIZATION_UNAVAILABLE` | `true` | 멤버십 권한 확인이 일시적으로 불가능하다. |
| `ROOM_SUBSCRIPTION_SYNC_UNAVAILABLE` | `true` | watermark 조회가 일시적으로 불가능하다. |

`retryable=true`이면 연결과 topic 구독이 유지된 상태에서 새 `requestId`로
sync 요청만 재시도할 수 있다. READY를 받기 전에는 REST snapshot을 시작하지
않는다.

재참여 후 기존 room subscription의 경계가 이전
`messageVisibleAfterSequence`라면 서버는 이를 READY로 인정하지 않는다.
`ROOM_SUBSCRIPTION_STALE`을 받으면 다음 순서로 복구한다.

```text
1. 기존 /topic/rooms/{roomId}/messages subscription 해제
2. 기존 /topic/rooms/{roomId}/room-events subscription 해제
3. 현재 방 topic 두 개를 새로 구독
4. 새 requestId로 subscription sync
5. ROOM_SUBSCRIPTIONS_READY 수신 후 REST 이력 동기화
```

현재 Membership이 `LEFT` 또는 `BANNED`이면 stale 여부보다 현재 접근 거절이
우선하므로 `ROOM_SUBSCRIPTION_FORBIDDEN`을 반환한다. 실시간 buffer의
`messageVisibleAfterSequence` 필터는 상태 복구를 위한 방어 수단이며 서버의
outbound 격리를 대체하지 않는다.

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

### 메시지 수정·삭제

수정 destination:

```text
/app/rooms/{roomId}/messages/edit
```

```json
{
  "clientMutationId": "550e8400-e29b-41d4-a716-446655440010",
  "messageId": "message-01",
  "content": "수정된 메시지"
}
```

삭제 destination:

```text
/app/rooms/{roomId}/messages/delete
```

```json
{
  "clientMutationId": "550e8400-e29b-41d4-a716-446655440011",
  "messageId": "message-01"
}
```

- 두 command 모두 `chat:messages:write` scope와 활성 Membership이 필요하며
  메시지 작성자 본인만 실행할 수 있다.
- `clientMutationId`는 command별 UUID다. 네트워크 재시도에는 같은 ID와
  같은 payload를 사용한다. 같은 ID의 다른 payload는
  `IDEMPOTENCY_CONFLICT`다.
- 클라이언트 `expectedVersion`은 보내지 않는다. 서버의 단일 message
  pipeline이 수락한 순서대로 CREATE/EDIT/DELETE를 처리한다.
- 수정 content는 신규 전송과 같은 trim, 길이, UTF-8 byte, C0 제어문자
  검증을 적용한다.
- 동일한 정규화 content로 수정하면 `UNCHANGED`이며 version과 `updatedAt`은
  바뀌지 않고 room event도 발생하지 않는다.
- 삭제는 물리 삭제가 아니라 `DELETED_BY_AUTHOR` tombstone이다. content는
  `null`이 되고 `deletedAt == updatedAt`이다. 새 mutation ID로 다시
  삭제하면 `ALREADY_DELETED`이며 version과 event는 늘지 않는다.
- 수정·삭제는 대상 메시지의 최초 `roomSequence`를 유지한다. 방 sequence나
  REST cursor를 새로 소비하지 않는다. 관리자 moderation, 복원, 수정 이력은
  현재 지원하지 않는다.

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

`ACCEPTED`는 채팅 메시지와 해당 `CHAT_MESSAGE_CREATED` 전파 항목이
MongoDB transaction에 함께 영속화되었다는 뜻이다. 다른 WebSocket
subscriber에게 이벤트가 이미 전달되었다는 뜻은 아니다. 따라서
`ACCEPTED`와 `CHAT_MESSAGE_CREATED`는 어느 쪽이 먼저 도착해도 정상이며,
프론트는 두 응답의 고정 순서를 가정하지 않는다.

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

수정·삭제 result는 기존 queue에서 다음 additive 필드를 사용한다.
`clientMessageId`에 mutation ID를 넣지 않는다.

```json
{
  "clientMessageId": null,
  "status": "UPDATED",
  "code": null,
  "retryable": false,
  "retryAfterMs": null,
  "messageId": "message-01",
  "roomSequence": 10,
  "commandType": "EDIT_MESSAGE",
  "clientMutationId": "550e8400-e29b-41d4-a716-446655440010",
  "messageVersion": 2,
  "messageState": "ACTIVE",
  "replayed": false
}
```

성공 및 no-op status는 `UPDATED`, `UNCHANGED`, `DELETED`,
`ALREADY_DELETED`다. 거절은 `status=REJECTED`와
`MESSAGE_NOT_FOUND`, `MESSAGE_MUTATION_FORBIDDEN`, `MESSAGE_DELETED`,
`IDEMPOTENCY_CONFLICT` 등의 code를 사용한다. 저장 장애는 기존처럼
`status=FAILED`, `code=PERSISTENCE_FAILED`다. 같은 receipt를 재생하면
최초 status와 snapshot을 반환하고 `replayed=true`다.

command result와 UPDATE/DELETE room event의 도착 순서는 고정되지 않는다.
result의 `messageVersion`은 이후 mutation이 먼저 처리되면 이미 오래된 값일
수 있으므로 최종 snapshot은 room event 또는 REST 응답을 기준으로 병합한다.

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
    "state": "ACTIVE",
    "messageVersion": 1,
    "createdAt": "2026-07-29T04:40:00Z",
    "updatedAt": "2026-07-29T04:40:00Z",
    "deletedAt": null
  }
}
```

`eventType`은 `CHAT_MESSAGE_CREATED`, `CHAT_MESSAGE_UPDATED`,
`CHAT_MESSAGE_DELETED` 중 하나다. 세 event 모두 같은 topic과 전체 message
snapshot을 사용한다. DELETE payload는 `content=null`,
`state=DELETED_BY_AUTHOR`이며 `deletedAt`이 설정된다.

메시지 이벤트는 at-least-once로 전파되므로 동일 이벤트가 다시 도착할 수
있다. 프론트는 같은 `messageId`에 대해
`incoming.messageVersion <= current.messageVersion`이면 무시한다.
`messageVersion`은 해당 메시지 안에서만 비교하며 방 전체 순서가 아니다.

`roomSequence`를 이용해 방 안에서 메시지 순서를 판단한다. 정상 전파
경로에서는 발생 순서에 가깝게 처리하지만, publish 재시도 중에는 앞선
`roomSequence`가 뒤 이벤트보다 늦게 도착할 수 있다. gap을 발견하면 기존
REST 메시지 이력 API로 복구한다. Outbox는 오프라인 클라이언트의 이벤트
수신이나 exactly-once 전달을 보장하지 않는다.

CREATE/UPDATE/DELETE 모두 최초 생성의 불변 `roomSequence`를 broker
header로 사용한다. 서버 outbound interceptor는 구독자의
`messageVisibleAfterSequence` 이하 event를 browser로 보내기 전에
subscriber별로 차단한다. 따라서 현재 참여 이전 메시지의 수정·삭제 payload도
클라이언트에 노출되지 않는다.

Backlog metric sampling은 메시지 dispatcher와 분리된 전용 worker에서
fixed-delay로 실행된다. MongoDB metric 조회가 지연되거나 실패해도
claim, publish, delete, retry와 `chatOutbox` readiness에는 영향을 주지
않으며, Gauge는 마지막으로 성공한 메모리 snapshot만 읽는다.

현재 binary가 지원하지 않는 outbox schema/event 문서는 claim하지 않고
보존한다. 지원 metadata를 가졌지만 deterministic event ID, 양수
`roomSequence`, message version, event timestamp, 필수 식별자 또는 payload
invariant가 손상된 문서는
`PAYLOAD_DECODE_ERROR`로 최대 backoff에 재시도하며 자동 삭제하지 않는다.

### 메시지 Outbox 배포와 rollback

Outbox v1은 단일 서버 인스턴스와 Spring Simple Broker를 전제로 하며,
기존 메시지를 backfill하지 않는다. 메시지를 직접 publish하는 pre-outbox
버전과 outbox dispatcher 버전의 혼합 실행은 지원하지 않는다.

Pre-outbox 버전으로 rollback하기 전에는 신규 메시지 ingress를 중단하고
message pipeline과 outbox dispatcher를 순서대로 drain한다. `inFlight = 0`
확인 뒤 metric snapshot이 아니라 MongoDB에서 다음 exact query를 실행한다.

```javascript
db.chat_outbox_events.countDocuments({})
```

결과가 `0`이고 unsupported 문서도 없을 때만 rollback한다. Pending 문서가
있으면 forward fix 또는 outbox-compatible binary로 dispatcher를 복구해
drain한다. 자동 purge는 금지하며, 긴급 purge는 운영자 승인, collection
export 또는 backup, 실시간 이벤트 유실 수용 기록을 갖춘 별도 비상 절차로만
수행한다.

### 방 이벤트

구독:

```text
/topic/rooms/{roomId}/room-events
```

공통 envelope:

```json
{
  "eventVersion": 1,
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
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
ROOM_SETTINGS_UPDATED
```

payload 형태:

| 이벤트 | payload의 상태 객체 |
| --- | --- |
| `ROOM_CREATED` | `owner` |
| `ROOM_MEMBER_JOINED`, `ROOM_MEMBER_REJOINED`, `ROOM_MEMBER_LEFT`, `ROOM_MEMBER_BANNED`, `ROOM_MEMBER_UNBANNED` | `member` |
| `ROOM_OWNERSHIP_TRANSFERRED` | `previousOwner`, `newOwner` |
| `ROOM_CLOSED` | `owner` |
| `ROOM_SETTINGS_UPDATED` | `name`, `description`, `categories`, `visibility`, `joinPolicy` 전체 settings snapshot |

모든 `member`, `owner`, `previousOwner`, `newOwner` 상태 객체에는 플랫폼 사용자 식별자인
`userId`와 방 멤버십 식별자인 `membershipId`가 함께 포함됩니다.

`ROOM_SETTINGS_UPDATED` 예:

```json
{
  "eventVersion": 1,
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "ROOM_SETTINGS_UPDATED",
  "emittedAt": "2026-07-31T06:00:00Z",
  "payload": {
    "roomId": "room-01",
    "roomVersion": 8,
    "roomStatus": "ACTIVE",
    "name": "지역 교통 정책 토론방",
    "description": "지역 대중교통 정책과 개선 방안을 논의합니다.",
    "categories": ["LOCAL_ISSUE"],
    "visibility": "UNLISTED",
    "joinPolicy": "OPEN"
  }
}
```

모든 Room event는 같은 `Room.version` 공간을 공유한다.

- `incoming.roomVersion == current.roomVersion + 1`: event 적용
- `incoming.roomVersion <= current.roomVersion`: 중복 또는 이미 반영된
  event이므로 무시
- `incoming.roomVersion > current.roomVersion + 1`: event gap이므로
  `GET /api/v1/rooms/{roomId}` 재조회

설정 변경 후 공개 목록 노출 여부가 바뀔 수 있으므로
`visibility` 변경을 반영해야 하는 화면은 `GET /api/v1/rooms`를 다시
조회한다. 공개 목록 전용 WebSocket event는 제공하지 않는다.

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

Room category 도입 후 `chat_rooms`의 현재 schema는 v4이며 `categories`가
필수다. v1~v3 문서에 임의 기본 카테고리를 부여하지 않고 fail-closed로
거절한다. 이번 로컬 개발 전환에서는 기존 데이터를 보존하지 않으므로 서버를
기동하기 전에 전용 로컬 chat MongoDB database/volume 전체를 초기화한다.
운영 데이터에는 별도 migration 정책 없이 이 초기화 절차를 적용하지 않는다.

Membership는 `schemaVersion=2`와 `messageVisibleAfterSequence`를
요구한다. Membership schema v1 또는 경계 필드가 누락된 문서는 경계를
`0`으로 추정하지 않고 메시지 접근을 fail-closed로 거절한다. 이런 문서가
존재하면 운영 환경에서는 별도 데이터 migration이 필요하고, 로컬
fixture라면 해당 fixture의 초기화 또는 재생성이 필요하다. Room description
호환성이 legacy Membership까지 지원한다는 의미는 아니다.

```bash
docker compose -f compose.local.yaml up --build -d
python3 scripts/frontend-local-smoke.py
```

스크립트는 별도 Python 패키지 없이 다음 15단계 흐름을 검증한다.

1. `http://localhost:8082/actuator/health`
2. credential CORS preflight
3. 잘못된 쿠키로 최초 STOMP `CONNECT`와 새 연결의 재연결 `CONNECT`가 모두
   동일한 `AUTHENTICATION_REQUIRED` ERROR를 반환하고, 유효한 쿠키로 명시적
   재연결하면 `CONNECTED`가 반환되는지 확인
4. `civic_ai_access_token` 쿠키 JWT로 내 방 목록과 공개 방 목록 조회
5. description과 categories를 포함한 `LISTED`, `OPEN` 방 생성
6. 방 상세와 cursor 기반 전체 공개 목록에서 description/categories 반영 확인
7. 구독 유지 상태의 설정 변경, `ROOM_SETTINGS_UPDATED`, replay/no-op 확인
8. `UNLISTED` 공개 목록 제외와 `INVITE_ONLY` join 차단 확인
9. 메시지 CREATE/UPDATE/DELETE event와 command result 확인
10. REST 메시지 tombstone 재동기화 확인
11. 수정·삭제 중 `roomSequence` 불변 확인
12. 다음 CREATE의 sequence와 REST snapshot 확인
13. `LISTED`, `OPEN` 복원 후 cursor 기반 전체 공개 목록 재반영 확인
14. 두 번째 사용자 Room join 확인
15. room-inbox unread, read-state PUT, 개인 CREATE/DELETE invalidation 확인

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
    이때 `roomSequence <= messageVisibleAfterSequence`인 버퍼 메시지는
    폐기한다.
16. `/app/rooms/{roomId}/messages`로 메시지를 전송한다.
17. command 결과와 `CHAT_MESSAGE_CREATED` 이벤트를 확인한다.
18. 작성자 수정·삭제 command를 보내고 result와 UPDATE/DELETE event를
    각각 `clientMutationId`, `messageId`, `messageVersion`으로 연결한다.
19. 재연결 후 현재 로드 범위를 REST로 새로 조회한 뒤 buffered event를
    `messageVersion`으로 병합한다.

## Room inbox unread와 ReadState

메시지 schema v3는 불변 boolean `countable`을 필수로 저장한다. 현재 USER
메시지는 항상 `true`이며 UPDATE와 DELETE 뒤에도 값이 유지된다. REST 메시지
이력과 `CHAT_MESSAGE_CREATED`, `CHAT_MESSAGE_UPDATED`,
`CHAT_MESSAGE_DELETED` payload에도 이 값이 포함된다. 향후 SYSTEM 메시지는
`false`로 생성할 수 있지만 이번 버전은 SYSTEM 메시지와 `MessageType`을
제공하지 않는다.

이 변경은 기존 message schema v1/v2, `countable`이 없는 outbox payload,
mutation fixture의 보존이나 backfill을 지원하지 않는다. message outbox의
storage `schemaVersion`은 `2`이고 `countable`이 필수다. 외부
`CHAT_MESSAGE_*`의 `eventVersion`은 기존 `1`을 유지한다. outbox storage
schema v1은 claim하지 않고 unsupported backlog로 관찰하며, schema v2에서
`countable`이 누락되면 supported malformed payload로 fail-closed 처리한다.

애플리케이션 startup은 운영 데이터를 자동으로 삭제하거나 sequence를
수정하지 않는다. message collection을 초기화할 때는 다음 중 하나를 선택한다.

```text
A. Room과 Membership도 함께 초기화
B. 기존 chat_room_sequences 보존
C. Room/Membership를 보존한다면 repair script로 접근 경계 이상의
   안전한 sequence lower bound 재생성
```

Room/Membership를 보존하면서 `chat_room_sequences`를 빈 상태로 두면 안 된다.
복구 스크립트는 유실된 과거의 exact lastSequence를 재구성하지 않고, 보존된
Membership·ReadState·현재 Message보다 작지 않은 lower bound만 복구한다.

```bash
# 변경 예정값만 출력
docker compose -f compose.local.yaml exec -T \
  -e REPAIR_ROOM_SEQUENCE_MODE=dry-run mongodb \
  mongosh --quiet mongodb://localhost:27017/chat_local --file /dev/stdin \
  < scripts/repair-room-sequences-after-message-reset.js

# 명시적으로 적용
docker compose -f compose.local.yaml exec -T \
  -e REPAIR_ROOM_SEQUENCE_MODE=apply mongodb \
  mongosh --quiet mongodb://localhost:27017/chat_local --file /dev/stdin \
  < scripts/repair-room-sequences-after-message-reset.js

# Membership/ReadState/Message가 current sequence를 넘지 않는지 확인
docker compose -f compose.local.yaml exec -T mongodb \
  mongosh --quiet mongodb://localhost:27017/chat_local --file /dev/stdin \
  < scripts/validate-room-sequence-consistency.js
```

운영 데이터가 생긴 뒤에는 별도 migration 없이 같은 초기화 방식을 다시 사용할
수 없다.

사용자별 raw 읽음 cursor는 Membership가 아니라
`chat_room_read_states`에 lazy 생성된다. 외부에 노출하는 값은 항상 다음
effective cursor다.

```text
readThroughSequence = max(
  membership.messageVisibleAfterSequence,
  RoomReadState.lastReadSequence 또는 0
)
```

### 읽음 위치 갱신

```http
PUT /api/v1/rooms/{roomId}/read-state
Content-Type: application/json

{"throughSequence":123}
```

`chat:read-state:write` scope와 ACTIVE Room의 ACTIVE Membership이 필요하다.
로컬 CORS는 `PUT`을 허용한다. 응답은 다음과 같다.

```json
{
  "roomId": "room-01",
  "readThroughSequence": 123,
  "updated": true
}
```

- 요청이 현재 참여 경계보다 낮거나 effective cursor 이하이면 `200`,
  `updated=false`이며 cursor와 `updatedAt`은 감소하거나 변경되지 않는다.
- 현재 `chat_room_sequences.lastSequence`보다 크면
  `409 READ_SEQUENCE_AHEAD`다. sequence 문서가 없으면 현재 값은 `0`이다.
- Membership 접근 경계나 저장된 ReadState가 current sequence보다 크면
  서버 데이터 오류인 `500 READ_STATE_INCONSISTENT`, `retryable=false`다.
- Room/Membership/ReadState/sequence Mongo 조회나 ReadState 갱신 중 발생한
  timeout, connection/socket, recoverable resource failure와 MongoDB의
  transient transaction label만 내부 원인을 노출하지 않고
  `503 ROOM_INBOX_UNAVAILABLE`, `retryable=true`로 반환한다.
  duplicate key, document validation, permission, invalid command/hint,
  generic Mongo 오류, identity 충돌, unsupported schema 및 programming
  invariant는 503으로 감싸지 않고 `500`, `retryable=false`로 처리한다.
- 비활성 Membership은 `403 ACCESS_DENIED`, CLOSED Room은
  `409 READ_STATE_NOT_AVAILABLE`다.
- ACTIVE 확인 직후 leave/ban이 commit되면 마지막 monotonic 개인 cursor
  write가 남을 수 있으나 접근 권한이나 Membership 상태를 복원하지 않는다.
- 별도 `Idempotency-Key`는 필요하지 않다.

### Room inbox 목록

```http
GET /api/v1/me/room-inbox?cursor={cursor}&limit=20
```

`chat:rooms:read` scope가 필요하고 limit은 기본·최대 모두 `20`이다.
`limit=21`은 `400 INVALID_REQUEST`다. 기존 `/me/rooms`는 변경되지 않는다.
목록은 사용자의 전체 ACTIVE Membership 후보에 ACTIVE Room과 공통 summary를
결합한 뒤 `effectiveLastActivityAt DESC`, `roomId DESC`로 정렬한다.

Summary last message는
`lastMessage.roomSequence > membership.messageVisibleAfterSequence`일 때만
노출한다. 같거나 낮으면 `lastMessage=null`이고 `lastActivityAt`은 현재 참여
구간의 `membership.joinedAt`이다. Rejoin은 `joinedAt`과 접근 경계를 함께
갱신하므로 참여 전 message 시각은 응답, 정렬, cursor 어디에도 사용하지
않는다. Summary가 없는 sparse Room도 같은 fallback을 사용한다.

각 item은 기존 active Room metadata와 다음 값을 포함한다.

```json
{
  "categories": ["POLICY"],
  "readThroughSequence": 123,
  "unreadCount": 200,
  "unreadCountCapped": true,
  "lastMessage": {
    "messageId": "message-124",
    "roomSequence": 124,
    "messageVersion": 1,
    "state": "ACTIVE",
    "preview": "다음 회의는 월요일입니다.",
    "previewTruncated": false,
    "createdAt": "2026-08-04T08:30:00Z"
  },
  "lastActivityAt": "2026-08-04T08:30:00Z"
}
```

삭제 tombstone은 `state=DELETED_BY_AUTHOR`, `preview=null`,
`previewTruncated=false`로 반환하며 localized 삭제 문구는 반환하지 않는다.
접근 가능한 last message가 없으면 `lastMessage=null`이고 `lastActivityAt`은
항상 non-null인 Membership `joinedAt`이다.

Room inbox cursor는 전용 v2 payload를 JSON → UTF-8 → URL-safe Base64
without padding으로 인코딩한다.
`lastActivityAt`은 MongoDB Date와 동일한 millisecond precision과 표현 범위를
사용하며, 범위 밖 또는 sub-millisecond timestamp는 `INVALID_CURSOR`다.

```json
{
  "version": 2,
  "scope": "MY_ROOM_INBOX",
  "lastActivityAt": "2026-08-04T08:30:00Z",
  "lastRoomId": "room-A"
}
```

다음 페이지 조건은 `effectiveLastActivityAt < lastActivityAt` 또는 시각이
같고 `roomId < lastRoomId`다. 기존 Room inbox v1 cursor, `/me/rooms` cursor,
다른 scope, unknown JSON field는 `400 INVALID_CURSOR`다. 다음 cursor는 마지막
반환 item의 effective 시각과 Room ID로 생성한다. 정적인 source에서는
중복·누락이 없지만 페이지 요청 사이 새로운 CREATE로 순서가 변하면 장기
snapshot은 보장하지 않는다. 클라이언트는 invalidation 후 첫 페이지부터
재조회해야 한다.

unread 조건은 `roomSequence > readThroughSequence`, `state=ACTIVE`,
`countable=true`, `senderUserId != currentUserId`다. 수정은 unread 수를
바꾸지 않고, 읽지 않은 tombstone은 제외하며 자신의 메시지도 제외한다.
기본 cap은 `200`이다. 정확히 200이면 `capped=false`, 201 이상이면
`unreadCount=200`, `capped=true`다.

Mongo page query는 `chat_memberships`의 `userId/status` index를 hint하고,
Room과 summary를 각각 `_id`로 lookup한 뒤 effective 시각을 계산하여 cursor
filter, blocking sort, `limit+1`을 적용한다. query에는 bounded maxTime과
`allowDiskUse=false`가 적용된다. Service는 reader 순서를 변경하지 않는다.
각 page의 최대 20개 Room에 대한 unread Mongo count는
`limit=cap+1`, `maxTime`, `ix_chat_message_unread` hint를 사용한다. 한
Room이라도 timeout 또는 Mongo 오류가 발생하면 일부 0을 반환하지 않고 전체
요청을 `503 ROOM_INBOX_UNAVAILABLE`, `retryable=true`로 실패시킨다.
Summary document가 없으면 정상 fallback이지만 unsupported/malformed summary,
잘못된 lookup cardinality 또는 domain invariant는 fallback하지 않고
`500 ROOM_INBOX_SUMMARY_INCONSISTENT`, `retryable=false`다. Request path는
summary를 repair하거나 write하지 않는다.

MongoDB 7.0.14 replica-set Testcontainers에서 visible/hidden/missing summary,
ACTIVE/DELETED snapshot과 time tie를 섞은 fixture로 확인한 executionStats는
다음과 같다. Membership은
`ix_chat_membership_user_status`, Room과 summary lookup은 각각 `_id_`의
indexed loop join을 사용했다. Effective field 때문에 bounded blocking sort가
발생하지만 500 Room까지 `allowDiskUse=false`, `usedDisk=false`, spill 0이었다.

| ACTIVE Room | keys examined | docs examined | execution ms | returned |
|---:|---:|---:|---:|---:|
| 20 | 55 | 55 | 5 | 20 |
| 100 | 275 | 275 | 5 | 21 |
| 500 | 1375 | 1375 | 14 | 21 |

절대 실행 시간은 CI 성공 기준이 아니며 환경별로 다시 기록한다.

대표 query plan은 다음 명령으로 반복 확인한다.

```bash
docker compose -f compose.local.yaml exec -T \
  -e UNREAD_MESSAGE_COUNT=50000 mongodb \
  mongosh --quiet mongodb://localhost:27017/chat_local --file /dev/stdin \
  < scripts/unread-query-load.js

docker compose -f compose.local.yaml exec -T mongodb \
  mongosh --quiet mongodb://localhost:27017/chat_local --file /dev/stdin \
  < scripts/unread-query-explain.js

docker compose -f compose.local.yaml exec -T \
  -e UNREAD_ROOM_COUNT=20 -e UNREAD_MESSAGE_COUNT=1000 mongodb \
  mongosh --quiet mongodb://localhost:27017/chat_local --file /dev/stdin \
  < scripts/unread-query-load.js

docker compose -f compose.local.yaml exec -T \
  -e UNREAD_ROOM_COUNT=20 mongodb \
  mongosh --quiet mongodb://localhost:27017/chat_local --file /dev/stdin \
  < scripts/unread-query-benchmark.js
```

출력의 `indexName`, `winningPlan`, `totalKeysExamined`,
`totalDocsExamined`, `executionTimeMillis`, `nReturned`을 데이터 규모별로
기록한다. benchmark는 MongoDB에 순차 count command를 실행한 DB 기준
수치이며 HTTP endpoint latency가 아니다. 절대 latency를 자동 테스트의 고정
성공 기준으로 사용하지 않는다.

### Room inbox summary persistence (내부 계약)

`chat_room_inbox_summaries`는 `_id=roomId`, `schemaVersion=1`인 Room별
희소 projection이다. 메시지가 없는 Room에는 document를 만들지 않으며 기존
데이터 backfill 전까지 read path에서 사용하지 않는다. CREATE/UPDATE/DELETE
message, mutation receipt, message outbox와 같은 Mongo transaction에서
summary를 조건부 갱신한다.

마지막 메시지는 가장 큰 CREATE `roomSequence`로만 정한다. UPDATE/DELETE는
현재 summary가 같은 `messageId`와 `roomSequence`를 가리키고 더 큰
`messageVersion`일 때만 반영한다. `lastActivityAt`은 원본 message
`createdAt`으로 고정하고 snapshot `updatedAt`은 message `updatedAt`을
사용한다. ACTIVE preview는 첫 CRLF/LF/CR 이전의 최대 60 Unicode code
point이며 TAB을 공백으로 바꾸고 양끝 공백을 제거한다. 삭제 tombstone은
`preview=null`, `previewTruncated=false`다.

Summary maintenance는 일반 chat-server lifecycle을 기동하지 않는 독립
Java main과 `roomInboxSummaryMaintenance` Gradle task로만 명시적으로
실행한다. MongoDB URI는 `CHAT_MONGODB_URI`를 사용하며 mode 누락 또는
`dry-run`, `apply`, `validate` 외의 값은 write 전에 거절한다.

```bash
CHAT_MONGODB_URI='mongodb://localhost:27017/chat_local?replicaSet=rs0' \
./gradlew roomInboxSummaryMaintenance --args='--mode=dry-run'

CHAT_MONGODB_URI='mongodb://localhost:27017/chat_local?replicaSet=rs0' \
./gradlew roomInboxSummaryMaintenance --args='--mode=apply'

CHAT_MONGODB_URI='mongodb://localhost:27017/chat_local?replicaSet=rs0' \
./gradlew roomInboxSummaryMaintenance --args='--mode=validate'
```

모든 mode는 source인 `chat_messages`, `chat_room_sequences` collection과
`uk_chat_message_room_sequence` unique index의 정확한 key 순서
(`roomId ASC`, `roomSequence ASC`)를 write 전에 확인한다. `validate`는 summary
collection 존재도 요구하고, `apply`는 source preflight가 통과한 뒤에만
summary collection을 초기화한다. Candidate는 이 index를 명시적으로 hint한
cursor/batch query로 순회하여 Room별 가장 큰 CREATE sequence의 현재 message
snapshot으로 정한다. `countable`, Room 또는 Membership 상태는 선정 조건이
아니다. Apply는 관측한 summary 전체 snapshot에 대한 CAS와 source message
재조회·bounded retry를 사용하고, 더 큰 sequence나 같은 sequence의 더 큰
version을 뒤로 돌리지 않는다. 변경 가능한 collection은
`chat_room_inbox_summaries`뿐이다.

Validation은 Message → Summary와 stable source/summary pair를 사용하는
Summary → Message exact snapshot 비교, `chat_room_sequences`, sparse document
count를 함께 검증한다. Orphan, unsupported schema, malformed reverse 상태는
violation으로 보고하지만 자동 삭제하지 않는다. Dry-run은 message-bearing
Room의 관측 시점 예상 repair action만 계산하며 projection 전체 검증을
대체하지 않는다. Apply는 write 시점의 CAS 조건을 다시 평가한다. 선택 옵션은
`--room-id`, `--after-room-id`, `--batch-size`, `--max-room-retries`다.

Summary를 REST read source로 전환하기 직전에는 기존 배포/운영 수단으로 신규
message와 mutation admission을 잠시 중지하고, 이미 수락된 pipeline과 in-flight
Mongo transaction이 모두 끝났음을 확인한다. Maintenance 도구 자체는 runtime
server 또는 admission을 제어하지 않는다. Maintenance window에서는 다음
순서로 실행한다.

1. `dry-run` 실행 및 결과 검토
2. `apply` 실행
3. `validate` 실행
4. `apply` 재실행
5. `validate` 재실행
6. `violations=0`, `projectionViolations=0`, `concurrentlyChanged=0`,
   `failures=0`, `valid=true` 확인
7. summary read path 전환
8. message와 mutation admission 재개

위 gate를 실제 환경에서 확인하기 전에는 summary를 read path에서 사용하지
않는다.

## 개인 Room inbox WebSocket event

연결마다 다음 queue를 한 번 구독한다.

```text
/user/queue/room-inbox-events
```

이 구독은 기본 최대 subscription 6개 중 하나다. 개인 queue 3개와 현재
Room topic 2개를 함께 구독하며, 기본 설정에는 추가 subscription 하나의
여유가 있다. 현재 Room message topic을 구독 중인 사용자도 서버 수신
대상에서 제외하지 않으며, foreground/현재 화면/토스트 억제 판단은 프론트가
한다.

CREATE 예:

```json
{
  "eventVersion": 1,
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "ROOM_INBOX_INVALIDATED",
  "cause": "MESSAGE_CREATED",
  "roomId": "room-01",
  "roomNameHint": "토론방",
  "emittedAt": "2026-08-03T01:10:00Z",
  "sourceEventIds": ["chat-message-created:message-84"],
  "coalescedCreateCount": 1,
  "notificationHint": {
    "messageId": "message-84",
    "messageVersion": 1,
    "senderUserId": "user-2",
    "messageCreatedAt": "2026-08-03T01:09:59Z",
    "preview": "다음 회의는 월요일입니다.",
    "previewTruncated": false
  }
}
```

`cause`는 `MESSAGE_CREATED`, `MESSAGE_UPDATED`, `MESSAGE_DELETED`다.
UPDATE 예:

```json
{
  "eventVersion": 1,
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "ROOM_INBOX_INVALIDATED",
  "cause": "MESSAGE_UPDATED",
  "roomId": "room-01",
  "roomNameHint": null,
  "emittedAt": "2026-08-05T08:00:00Z",
  "sourceEventIds": ["chat-message-updated:message-84:v2"],
  "coalescedCreateCount": null,
  "notificationHint": null
}
```

정상 summary resolution에서는 summary의 현재 `messageId`, `roomSequence`,
`messageVersion`과 일치하고 state가 `ACTIVE`인 UPDATE만 발행한다. 과거 message,
낮은 version, 더 새로운 CREATE 뒤 UPDATE, DELETE 뒤 지연 UPDATE는 생략한다.
Summary 없음, unsupported/malformed document, storage/runtime 실패로 현재 identity를
판정할 수 없으면 stale cache false-negative를 피하기 위해 UPDATE invalidation을
보수적으로 허용한다. 이 fallback도 toast hint를 포함하지 않으며 notification
실패는 message outbox 성공이나 retry 상태를 바꾸지 않는다.

UPDATE와 DELETE는 `notificationHint=null`이며 REST query invalidation에만
사용한다. CREATE preview는 첫 CRLF/LF/CR 이전, 최대 30 Unicode
code point이고 TAB은 공백으로 바꾸며 양끝 공백을 제거한다. 줄바꿈 뒤나
30 code point 뒤가 생략될 때만 `previewTruncated=true`다. 서버는 말줄임표를
붙이지 않는다.

개인 event는 메시지 cache insert/update/delete payload가 아니며 unread를
직접 `+1/-1` 하는 authoritative 값도 아니다. 수신 시 room-inbox query를
debounce invalidate한다. delivery는 비영속 best-effort/at-least-once이다.
`eventId`는 public delivery instance를, `sourceEventIds`는 원본 outbox event를
식별한다. outbox delete 실패 후 새로운 `eventId`로 같은 source가 다시 전달될
수 있으므로 클라이언트는 source ID를 bounded TTL/LRU로 중복 제거한다.

서버는 room-topic publish 성공 뒤 bounded in-memory queue에 non-blocking
offer하고, Room별 100ms window에서 recipient 조회와 외부 event를
coalescing한다. queue full, observer 오류, summary resolution 오류, 개별 전송
오류는 message outbox
성공과 재시도 상태를 바꾸지 않는다. 동일 window의 같은 메시지
CREATE→DELETE는 CREATE hint를 억제하고 DELETE invalidation만 보낸다. 여러
UPDATE version 중 정상 resolution된 현재 version만 유지하고, UPDATE 뒤 새로운
CREATE 또는 DELETE가 current summary가 되면 UPDATE invalidation을 생략한다.

Room window 전체에서 먼저 `sourceOutboxEventId`를 중복 제거하고 전체
`deletedMessageIds`를 계산한 뒤 Room과 ACTIVE Membership을 각각 한 번만
조회한다. CREATE→DELETE cancellation과 recipient eligibility를 전체 window에
적용한 다음에만 public event를 CREATE, UPDATE, DELETE cause별로 분할한다.

CREATE recipient는 ACTIVE Membership이면서 message sequence가
`messageVisibleAfterSequence`보다 크고, `countable=true`이며 sender 본인이
아니어야 한다. UPDATE/DELETE recipient는 ACTIVE Membership과 같은 strict
sequence boundary만 적용하며 sender와 `countable` 조건을 사용하지 않는다.
따라서 작성자 본인과 `countable=false` message mutation도 invalidation을 받을
수 있지만 toast는 표시하지 않는다.

하나의 public event는 `sourceEventIds`를 최소 1개, 최대 100개 포함한다.
`max-events-per-room-batch`는 한 public event의 source 상한이며 설정 범위도
1~100이다. eligible source가 더 많으면 CREATE, UPDATE, DELETE 원인별로 여러 event가
전송될 수 있다. CREATE의 `coalescedCreateCount`는 전체 Room window가 아니라
해당 public event chunk의 source 수이며, hint도 그 chunk에서 가장 큰
`roomSequence`를 사용한다. UPDATE/DELETE chunk는 Room 이름·count·hint가 모두
null이다.
같은 window의 source 순서는 outbox queue 관측 순서를 유지하고, 한 원인 안에서
하나의 source는 정확히 한 chunk에만 포함된다.

각 public event는 delivery 전에 production ObjectMapper로 직렬화하며 JSON
UTF-8 크기가 `chat.websocket.message.max-stomp-message-bytes` 이상이면 해당
event만 drop하고 `room.inbox.notification.public_event.oversized`를 기록한다.
다른 recipient/event 처리와 message outbox 성공 상태에는 영향을 주지 않는다.
동일 source가 다른 window에서 다시 전달되는 at-least-once 동작은 허용한다.

public event는 생성 시 version/type/canonical UUID/Room ID/time/source ID를
검증한다. CREATE는 Room 이름, 1 이상의 count, 동일 개수의 CREATE source,
30 code point 이하 hint가 필수다. UPDATE와 DELETE는 각 cause에 맞는 source만
허용하고 Room 이름·count·hint가 모두 null이어야 한다. 기존 CREATE/DELETE JSON
shape와 `eventVersion=1`은 유지되며 Backend가 먼저 배포되어도 기존 Frontend는
알 수 없는 UPDATE cause만 무시할 수 있다.

notification recipient snapshot은 Room 정원 설정과 별개인 안전 상한
`max-recipient-snapshot-size`(기본 100)를 사용한다. 따라서 정원 설정을 50
아래로 낮춰도 기존 초과 Room이 안전 상한 이하면 개인 event를 계속 제공한다.
안전 상한 초과, `activeMemberCount` 불일치 또는 `hasNext=true`면 batch를
fail-closed하고 `room.inbox.notification.recipient_snapshot.rejected`를
기록한다. REST room-inbox는 계속 authoritative하다. 한 recipient delivery가
실패해도 다음 recipient 전송을 계속한다.

현재 구현은 단일 chat-server 인스턴스와 in-memory presence를 전제로 하며
오프라인 replay, Push, durable notification outbox를 제공하지 않는다. 향후
Push 보장이 필요하면 message와 room-topic outbox를 저장하는 transaction에
별도 durable notification intent를 함께 기록해야 한다.
