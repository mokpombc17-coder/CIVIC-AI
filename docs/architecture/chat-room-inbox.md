# Room inbox cache와 realtime 동기화

Room inbox의 최종 상태는 `GET /api/v1/me/room-inbox`가 소유한다. 개인 WebSocket event와
로컬 message command result는 REST를 다시 조회할 시점을 알려주는 신호이며, Room card cache를
직접 수정하지 않는다.

## REST 계약과 표시

각 Room inbox item은 unread projection과 함께 `lastMessage`, `lastActivityAt`을 제공한다.
Room metadata의 `categoryIds`도 UUID 문자열 배열로 함께 검증한다. category catalog와 사용자
표시명 계약이 확정되기 전까지 목록에서는 category를 표시하지 않는다.

- `lastMessage.state=ACTIVE`: 서버 preview를 표시하고 `previewTruncated=true`일 때만 `…`를
  한 번 붙인다.
- `lastMessage.state=DELETED_BY_AUTHOR`: `삭제된 메시지입니다.`를 표시한다.
- `lastMessage=null`: `표시할 메시지가 없습니다.`를 표시한다. 접근 경계 이전 메시지가 있을 수
  있으므로 Room 전체가 비어 있다고 표현하지 않는다.
- `lastActivityAt`: Asia/Seoul 달력 기준으로 오늘은 시각, 어제는 `어제`, 같은 연도는 월·일,
  다른 연도는 연·월·일을 표시한다.

`lastMessage.createdAt`과 `lastActivityAt`은 같은 시각이어야 한다. 수정·삭제는 최신 메시지의
원래 생성 시각과 정렬 위치를 바꾸지 않는다.
카테고리 변경 역시 message activity가 아니므로 `lastActivityAt`, unread와 latest-first 순서를
바꾸지 않는다.

## latest-first infinite query reset

서버 정렬은 `effectiveLastActivityAt DESC, roomId DESC`이며 cursor는 opaque 값이다. 메시지
생성으로 이미 로드한 2페이지의 Room이 1페이지 상단으로 이동할 수 있으므로 기존 page를 직접
이동하거나 이전 cursor chain을 재사용하지 않는다.

목록 구성이나 정렬에 영향을 줄 수 있는 신호는 `resetRoomInboxQueries`를 사용한다.

```text
기존 fetch 취소
→ loaded pages와 pageParams 폐기
→ active query는 initialPageParam=null로 첫 페이지 재조회
→ inactive query는 다음 mount에서 첫 페이지 조회
```

read-state PUT은 unread 값만 바꾸고 정렬에는 영향을 주지 않으므로 기존 query invalidation을
유지한다. 성공한 탭은 현재 Room inbox query를 invalidate한 뒤 같은 브라우저의 worker protocol에
현재 인증 세대와 확정 sequence를 전달한다. 다른 탭은 같은 인증 세대의 confirmation만 단조 증가로
반영하고 Room inbox query를 invalidate하며, 다시 broadcast하지 않는다.

## Realtime invalidation

`/user/queue/room-inbox-events`의 `ROOM_INBOX_INVALIDATED` cause는 다음과 같이 처리한다.

| Cause             | Room inbox reset | Toast                                     |
| ----------------- | ---------------- | ----------------------------------------- |
| `MESSAGE_CREATED` | 예               | 기존 foreground·다른 Room 조건에서만 표시 |
| `MESSAGE_UPDATED` | 예               | 표시하지 않음                             |
| `MESSAGE_DELETED` | 예               | 표시하지 않음                             |

`notificationHint`는 CREATE 시점의 비영속 toast hint다. Room card의 preview나 unread를 event
payload로 patch하지 않는다. 개인 event는 best-effort이고 중복·유실될 수 있으므로
`sourceEventIds`를 5분 TTL, 최대 1,000개 LRU로 중복 제거하고 연결 복구, window focus,
online 복귀에도 REST page chain을 reset한다.

## 자신의 message result

작성자는 CREATE 개인 event recipient에서 제외되므로 transport의 local result도 동일한 debounced
reset 경로에 연결한다.

- send: `ACCEPTED`, `DUPLICATE`
- mutation: `UPDATED`, `DELETED`, `ALREADY_DELETED`
- reset하지 않음: `UNCHANGED`, `REJECTED`, `FAILED`와 local publish failure

개인 UPDATE/DELETE event와 local result가 모두 도착해도 coordinator의 400ms debounce와
1,500ms maxWait 안에서 합쳐진다.

## 운영 활성화 조건

프론트 배포 전에 Backend REST가 `lastMessage`와 `lastActivityAt`을 필수로 반환해야 한다.
`MESSAGE_UPDATED` event는 늦게 배포되어도 CREATE/DELETE 동작은 유지된다. Backend summary read
source 전환은 운영 maintenance에서 다음 gate를 모두 확인한 뒤 진행한다.

```text
violations = 0
projectionViolations = 0
concurrentlyChanged = 0
failures = 0
valid = true
```

프론트 작업은 Backend DB, Mongo volume 또는 maintenance 상태를 변경하지 않는다.
