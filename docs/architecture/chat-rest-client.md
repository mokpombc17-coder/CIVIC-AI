# 채팅 REST client 구조

## 문서 상태

- 작성일: 2026-07-29
- 적용 대상: `apps/web`
- 서버 prefix: `http://localhost:8082/api/v1`
- 구현 범위: 방 Command 및 Query 계약
- 보류 범위: 메시지 이력 pagination

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
```

목록의 `limit`과 멤버 목록의 `status`는 결과 집합을 바꾸므로 query key에 포함한다. cursor는
동일한 목록의 다음 page를 가리키므로 query key에 넣지 않고 infinite query의 `pageParam`으로
관리한다.

### Query

- 공개 방 목록, 내 방 목록과 멤버 목록은 `useInfiniteQuery`를 사용한다.
- 방 상세와 내 멤버십은 roomId별 `useQuery`를 사용한다.
- cursor가 `null`인 첫 page에서는 query parameter를 보내지 않는다.
- 서버가 반환한 `nextCursor`를 해석하지 않고 다음 page parameter로 전달한다.

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

## 보류된 메시지 이력

메시지 이력은 백엔드가 다음 세 조회 모드의 구체적인 query 및 response pagination 필드를 확정한
후 추가한다.

- 최초 진입의 최근 메시지
- `beforeSequence` 기반 과거 이력
- `afterSequence` 기반 재연결 및 누락 복구

`beforeSequence`와 `afterSequence`를 동시에 보내지 않는 규칙과 모든 응답의
`roomSequence` 오름차순 정렬은 이미 합의됐지만, 임시 필드명을 추측하여 API에 넣지 않는다.
