# 채팅 REST client 구조

## 문서 상태

- 작성일: 2026-08-06
- 적용 대상: `apps/web`
- 서버 prefix: `http://localhost:8082/api/v1`
- 구현 범위: 방 Command 및 Query 계약, 메시지 이력 REST 계약, 방 목록·상세·최신 이력 화면
  연결, 방 생성·공개 방 참여·나가기·방장 위임·차단·종료 관리 화면 연결,
  `afterSequence` 기반 재연결·누락 자동 복구, 연결·동기화 오류 UX,
  사용자별 ACTIVE 참여 Room quota 오류 UX
- 후속 범위: 로컬 통합·E2E 스모크 테스트

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

### Room category 계약

Room metadata의 `categories`는 배열을 유지하지만 현재 계약에서는 정확히 하나가 필수다.

| API 값        | 사용자 표시 |
| ------------- | ----------- |
| `POLICY`      | 정책        |
| `ENVIRONMENT` | 환경        |
| `LOCAL_ISSUE` | 지역 현안   |

- Room 생성 요청은 `categories: [selectedCategory]`를 반드시 전송한다.
- 설정 변경에서 `categories`를 생략하면 기존 값을 유지하고, 포함하면 배열 전체를 교체한다.
- 공개 목록, 내 방 목록, Room inbox, 방 상세와 설정 변경 snapshot은 `categories`를 필수로
  검증한다.
- 생성·설정 UI는 현재 radio 방식의 단일 선택만 제공한다. Backend 계약이 확장되기 전에는 다중
  선택을 열지 않는다.
- card와 방 상세는 공용 label map과 `ChatRoomCategoryBadges`를 사용하며 API enum을 직접 노출하지
  않는다.

카테고리 변경은 Room metadata 변경일 뿐 메시지 activity, unread, read-state 또는 Room inbox
정렬 위치를 바꾸지 않는다.

### 사용자별 ACTIVE 참여 Room quota

Room 생성과 신규 참여·재참여에서 서버가 `409 USER_ACTIVE_ROOM_LIMIT_EXCEEDED`를 반환할 수
있다. 프론트는 이 결과를 authoritative하게 사용하며 현재 참여 Room 수로 quota를 계산하거나
명령을 미리 차단하지 않는다.

- 현재 서버 기본값 `20`은 배포 설정이므로 사용자 문구와 validation에 하드코딩하지 않는다.
- `ROOM_MEMBER_LIMIT_EXCEEDED`는 해당 Room의 참여 정원이고,
  `USER_ACTIVE_ROOM_LIMIT_EXCEEDED`는 현재 사용자의 참여 Room quota이므로 서로 다른 문구로
  안내한다.
- 사용자 quota 오류에는 다른 참여 방에서 나간 뒤 다시 시도하도록 안내한다.
- `retryable=false`이므로 자동 재시도와 같은 요청 재시도 버튼을 제공하지 않는다.
- 거절된 명령은 Room·Membership을 변경하지 않으므로 성공 cache effect, Room inbox reset 또는
  WebSocket room claim을 실행하지 않는다.
- `replayed=true`인 같은 거절 receipt도 동일한 실패로 표시한다.

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

사용자가 quota 상태를 해결한 뒤 새로 제출
  → createIdempotentCommand(body) 다시 실행
    → 새로운 Idempotency-Key 전송
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
- 메시지 이력 cache는 실시간 병합과 명시적인 복구가 최신성을 관리하므로 stale 처리하지 않는다.
  브라우저 focus, Query 활성화 재개나 네트워크 복구만으로 `latest`를 임의 refetch하지 않는다.
- cache page는 `[최신, 과거, 더 과거]` 순서로 유지하고, 화면에는 page 순서를 뒤집어 전체
  `roomSequence` 오름차순으로 제공한다.
- `afterSequence` 복구는 infinite query page와 섞지 않고 실시간 재동기화 계층에서 처리한다.

### Mutation

모든 mutation은 자동 retry를 사용하지 않는다. 사용자가 재시도하거나 이후 재시도 정책을
적용할 때 mutation variables에 보관된 기존 `IdempotentCommand`를 다시 사용한다.

방 생성과 공개 방 참여 화면은 사용자 동작마다 Command를 한 번 만들고, 서버가
`retryable=true`로 응답하거나 fetch가 응답 전에 실패한 경우에만 “같은 요청으로 다시 시도”를
노출한다. 이 버튼은 새 UUID를 만들지 않고 실패한 Command 객체를 그대로 다시 전달한다. 입력값을
바꿔 새로 제출하거나 참여 버튼을 새로 누르면 새로운 사용자 동작으로 보고 새 UUID를 발급한다.

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

방 생성과 참여가 성공하면 관련 cache 무효화가 끝난 뒤 응답의 `roomId`에 해당하는 채팅방
화면으로 이동한다.

방 상세 화면은 내 멤버십을 별도 endpoint로 동기화한다. 방장 역할이 확인된 경우에만 상태별
멤버 목록 Query를 활성화하며, 일반 멤버에게는 방장 전용 요청 자체를 보내지 않는다. 방장 위임,
멤버 차단·해제, 방 나가기와 방 종료도 동일한 `IdempotentCommand` 재시도 정책을 따른다.

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
`ROOM_SUBSCRIPTIONS_READY`의 destination, payload와 watermark 계약은 확정되어 Worker와
Direct fallback의 구독 준비 상태 머신에 반영했다. WebSocket 이벤트 버퍼도 READY 전부터
메시지와 Room Event를 보관하도록 구현했다. REST snapshot 적용 후 버퍼를 한 delivery씩
전달하고 탭의 적용 확인 범위까지만 제거하는 Worker–탭 handshake도 구현했다. TanStack Query
coordinator는 이 delivery와 `after` 복구 결과를 같은 REST cache에 병합한다.

## 실시간 Query coordinator

`ChatRealtimeQueryCoordinator`는 REST snapshot과 Worker delivery 사이의 적용 순서를
관리한다.

```text
REST message-history cache 확인
  → 마지막 연속 sequence와 READY watermark 비교
  → 부족하면 afterSequence를 nextAfterSequence로 반복 조회
  → ROOM_SNAPSHOT_APPLIED
  → ROOM_EVENTS_DELIVERED
  → 메시지 infinite query 병합
  → gap이면 delivery의 최고 sequence까지 afterSequence 자동 복구 후 재병합
  → Room Event journal 병합
  → ROOM_EVENTS_APPLIED
```

- REST message-history의 첫 page가 cache에 없으면 snapshot 적용 완료를 Worker에 알리지 않는다.
- READY watermark보다 cache의 마지막 연속 sequence가 작으면 `afterSequence` 복구가 목표
  sequence에 도달한 뒤에만 snapshot 적용 완료를 알린다. 서버가 `hasMore=true`로 반환하면
  `nextAfterSequence`를 그대로 다음 요청에 사용한다.
- 복구 응답이 진행되지 않거나 목표 sequence 전에 끝나면 기존 cache를 변경하지 않고 Worker
  buffer와 delivery ACK를 유지한다.
- 실시간 메시지는 기존 모든 page와 `messageId`, `roomSequence` 기준으로 병합한 뒤 최신
  page에 넣는다. 과거 page와 pagination cursor 및 `pageParams`는 유지한다.
- 같은 메시지의 정상 재전달은 중복 저장하지 않는다. 같은 ID 또는 sequence의 불변 필드가
  다르면 cache를 변경하지 않는다.
- Room Event는 `["chat", "rooms", "room-event-journal", roomId]` query에 `eventId` 기준으로
  보관한다. journal에 처음 추가된 이벤트만 방 상세와 내 멤버십 cache에 투영하므로 같은
  delivery가 다시 와도 참여 인원 등을 중복 계산하지 않는다.
- Room Event가 제공하는 방 version, 상태, 방장, 멤버십 역할·상태·version은 즉시 cache에
  반영한다. 연속된 room version일 때만 참여 인원 증감을 계산하고, version이 건너뛰면 인원을
  추정하지 않는다.
- Room Event에는 멤버십 타임스탬프 등 REST 표현의 모든 필드가 없으므로 이벤트 적용 후 방
  상세·내 멤버십·멤버 목록·방 목록 Query를 무효화한다. 즉시 투영한 상태는 화면 지연을 줄이고,
  후속 REST refetch가 완전한 서버 표현으로 보정한다.
- 메시지 cache와 Room Event journal의 다음 값을 먼저 계산한 뒤 둘 다 정상일 때만 실제
  cache를 갱신한다. 따라서 Room Event 충돌 때문에 메시지만 먼저 반영되는 부분 성공을 막는다.
- 두 cache 갱신이 끝난 뒤에만 delivery ACK를 전송한다. ACK 전에 탭이 중단되면 같은 delivery가
  다시 와도 병합이 멱등적으로 동작한다.
- 다른 room 또는 generation의 delivery는 coordinator가 소비하지 않는다.
- 메시지 sequence gap이 있으면 cache 갱신과 ACK를 보류하고, 기존 마지막 연속 sequence부터
  해당 delivery의 최고 sequence까지 자동 복구한 뒤 같은 delivery를 다시 적용한다.
- `overflowed=true` 또는 `invalidEventCount>0`은 메시지 REST만으로 Room Event까지 완전히
  복원할 수 없으므로 cache 갱신과 ACK를 보류하고 페이지 새로고침으로 현재 방 세션과 Worker
  buffer를 초기화하도록 안내한다. 같은 손상 delivery를 단순 재시도하지 않는다.
- 병합 실패 delivery는 Worker transport에 남아 있으며 `retryPendingDelivery`로 같은 payload를
  다시 처리할 수 있다. sequence 누락과 일시적인 REST 오류만 이 경로로 재시도한다.

## 연결·동기화 상태 UX

채팅방 입력은 방 lease가 `active`인지만으로 열지 않는다. WebSocket 연결과 REST/Worker
동기화가 모두 완료되어야 한다.

```text
WebSocket connected
  + 현재 탭의 room lease active
  + READY watermark까지 REST snapshot 복구 완료
  + 보류 중인 Worker delivery 정상 병합
  = 메시지 입력 가능
```

- 연결이 `connecting`, `reconnecting`, `disconnecting`이면 입력을 잠시 막고 준비 상태를
  표시한다.
- `4001 / CONNECTION_REPLACED`는 자동 재연결하지 않는 terminal 상태다. 방 snapshot이 이전
  `active` 값을 보유해도 입력을 허용하지 않으며 다른 환경에서 연결되었다고 안내한다.
- 일반 연결 오류는 상단 연결 상태의 `다시 연결` 동작을 사용한다. 방 재활성화 버튼으로
  WebSocket 오류를 우회하지 않는다.
- `afterSequence` 복구 중에는 진행 상태를 표시하고 입력을 막는다. 복구가 완료되어 coordinator가
  동기화 완료 신호를 보낸 뒤에만 입력을 허용한다.
- 인증·권한 오류에는 효과 없는 반복 재시도 버튼을 제공하지 않는다.
- buffer overflow, 검증 실패, Room Event journal 충돌은 현재 cache의 무결성을 확신할 수 없는
  오류이므로 페이지 새로고침으로 세션을 초기화한다. sequence gap이나 일시적인 서버 오류는
  동일 snapshot과 delivery를 유지한 채 다시 동기화할 수 있다.

## 메시지 병합 정책

`mergeChatMessages`는 REST page, 복구 응답과 향후 WebSocket buffer를 동일한 `ChatMessage`
집합으로 합치는 순수 함수다.

- 입력 출처의 순서와 관계없이 `roomSequence` 오름차순으로 정렬한다.
- `messageId`와 `roomSequence`가 같고 모든 불변 필드가 같은 메시지는 정상 중복으로 제거한다.
- 같은 `messageId`의 내용이 다르거나 같은 `roomSequence`에 다른 메시지가 있으면 계약 충돌로
  처리하고 덮어쓰지 않는다.
- 요청한 방과 다른 `roomId`의 메시지를 섞지 않는다.
- 정렬된 메시지 사이의 모든 누락 sequence 범위를 구조화된 `gaps`로 반환한다.
- `afterSequence` checkpoint가 있으면 해당 값부터 연속으로 적용할 수 있는 마지막 sequence를
  `lastContiguousSequence`로 반환한다.

메시지 이력 Query의 화면용 flatten과 실시간 Query coordinator가 모두 이 병합 함수를
사용한다. coordinator는 gap을 발견하면 ACK를 보류하고, 마지막 연속 sequence부터 `after`
복구를 반복한 뒤 gap이 해소되면 보류 중인 delivery를 재적용한다.
