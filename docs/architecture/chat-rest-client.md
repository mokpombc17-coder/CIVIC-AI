# 채팅 REST client 구조

## 문서 상태

- 작성일: 2026-07-29
- 적용 대상: `apps/web`
- 서버 prefix: `http://localhost:8082/api/v1`
- 구현 범위: 방 Command 및 Query 계약, 메시지 이력 REST 계약
- 후속 범위: 메시지 이력 TanStack Query와 WebSocket 이벤트 병합

## 계층

```text
TanStack Query hook
  → chatRoomApi
    → Zod request/response contract
      → chatFetch
        → Chat Resource Server
```

### `chatFetch`

- Chat API base URL을 적용한다.
- 모든 요청에 `credentials: "include"`를 강제한다.
- 기본 `Accept: application/json`과 `cache: "no-store"`를 적용한다.
- HTTP 오류와 `application/problem+json`을 `ChatApiError`로 변환한다.
- 성공 응답 JSON 자체의 도메인 계약은 판단하지 않는다.

### `chatRoomApi`

- endpoint path, method, query parameter와 header를 구성한다.
- `roomId`, pagination parameter와 Command body를 HTTP 요청 전에 검증한다.
- 성공 응답을 `unknown`으로 받은 뒤 endpoint별 Zod schema로 검증한다.
- 서버 성공 응답이 계약과 다르면 `ChatRestContractError`를 던진다.

### REST 계약

`chat-room-contracts.ts`가 다음 계약을 한 곳에서 소유한다.

- 방·멤버십 공통 enum
- 방 생성 및 target user 요청
- 공개 방, 내 방, 방 상세와 멤버십 응답
- cursor pagination 응답
- 방 Command 성공 응답 code와 version
- 채팅 메시지와 최신·과거·복구 이력 응답

서버가 반환하는 `Instant`는 timezone offset이 있는 ISO-8601 문자열로 검증한다. cursor는
해석하지 않는 opaque 문자열이며 다음 요청에 URL encoding하여 그대로 전달한다.

## Idempotency 정책

Command API 함수는 UUID를 내부에서 생성하지 않고 `IdempotentCommand`를 입력으로 받는다.

```text
사용자 동작 시작
  → createIdempotentCommand(body)
    → UUID 생성
      → chatRoomApi command 호출

retryable 오류 또는 네트워크 재시도
  → 기존 IdempotentCommand 재사용
    → 같은 Idempotency-Key와 같은 body 전송
```

API 함수 내부에서 재시도마다 key를 새로 만들면 서버가 기존 요청과 같은 작업으로 식별할 수
없으므로 금지한다. TanStack Query mutation도 retry command 객체를 mutation 생명주기 동안
유지해야 한다.

## TanStack Query 정책

### Query key

모든 방 REST cache는 `["chat", "rooms"]` 아래에 둔다.

```text
public-list
my-list
detail/{roomId}
my-membership/{roomId}
membership-list/{roomId}
message-history/{roomId}
```

목록과 메시지 이력의 `limit`, 멤버 목록의 `status`는 결과 집합을 바꾸므로 query key에
포함한다. cursor와 `beforeSequence`는 동일한 목록의 다음 page를 가리키므로 query key에 넣지
않고 infinite query의 `pageParam`으로 관리한다.

### Query

- 공개 방 목록, 내 방 목록과 멤버 목록은 `useInfiniteQuery`를 사용한다.
- 방 상세와 내 멤버십은 roomId별 `useQuery`를 사용한다.
- cursor가 `null`인 첫 page에서는 query parameter를 보내지 않는다.
- 서버가 반환한 `nextCursor`를 해석하지 않고 다음 page parameter로 전달한다.
- 메시지 이력의 첫 page는 `latest`, 이후 page는 `nextBeforeSequence`를 사용한 `before` 조회다.
- 메시지 이력 query는 `enabled`를 필수로 받아 구독 준비 barrier 이전에는 REST 요청을 시작하지
  않는다.
- 브라우저 focus나 네트워크 복구만으로 메시지 이력을 임의 refetch하지 않는다.
- cache page는 `[최신, 과거, 더 과거]` 순서로 유지하고, 화면에는 page 순서를 뒤집어 전체
  `roomSequence` 오름차순으로 제공한다.
- `afterSequence` 복구는 infinite query page와 섞지 않고 실시간 재동기화 계층에서 처리한다.

### Mutation

모든 mutation은 자동 retry를 사용하지 않는다. 사용자가 재시도하거나 이후 재시도 정책을
적용할 때 mutation variables에 보관된 기존 `IdempotentCommand`를 다시 사용한다.

Command 성공 응답은 room의 전체 표현이 아니므로 version 일부를 기존 cache에 임의로 병합하지
않는다.

```text
방 생성 성공
  → 공개 방 목록 무효화
  → 내 방 목록 무효화

방 상태 Command 성공
  → 공개 방 목록 무효화
  → 내 방 목록 무효화
  → 해당 방 상세 무효화
  → 해당 방의 내 멤버십 무효화
  → 해당 방 멤버 목록 무효화
```

서버의 최신 전체 표현을 다시 조회하는 방식을 사용하면 Command별 부분 응답을 조합하면서
발생하는 cache 불일치를 피할 수 있다.

## 구현된 endpoint

### Command

- `POST /rooms`
- `POST /rooms/{roomId}/commands/join`
- `POST /rooms/{roomId}/commands/leave`
- `POST /rooms/{roomId}/commands/transfer-ownership`
- `POST /rooms/{roomId}/commands/ban-member`
- `POST /rooms/{roomId}/commands/unban-member`
- `POST /rooms/{roomId}/commands/close`

### Query

- `GET /rooms`
- `GET /rooms/{roomId}`
- `GET /rooms/{roomId}/memberships/me`
- `GET /me/rooms`
- `GET /rooms/{roomId}/memberships`
- `GET /rooms/{roomId}/messages`

## 메시지 이력 REST 계약

`chatRoomApi.getRoomMessages`는 조회 목적을 명시적인 mode로 구분한다.

```text
latest → ?limit=50
before → ?beforeSequence={sequence}&limit=50
after  → ?afterSequence={sequence}&limit=50
```

- `latest`는 최초 진입의 최근 메시지를 조회한다.
- `before`는 `nextBeforeSequence`를 사용해 과거 이력을 조회한다.
- `after`는 마지막 연속 sequence 이후를 조회해 재연결 및 누락을 복구한다.
- discriminated union으로 `beforeSequence`와 `afterSequence`의 동시 전송을 구조적으로 막는다.
- 응답 메시지가 요청한 방에 속하고 `roomSequence`가 오름차순인지 검증한다.
- `hasMore`와 조회 방향별 cursor가 일치하지 않으면 계약 오류로 처리한다.

TanStack Query는 `latest + before` 과거 pagination과 화면용 page flatten을 구현한다.
WebSocket 이벤트 버퍼, `after` 복구 결과 및 REST cache 병합은
`ROOM_SUBSCRIPTIONS_READY`의 destination, payload와 watermark 계약이 확정된 뒤 실시간
재동기화 계층에서 구현한다.
