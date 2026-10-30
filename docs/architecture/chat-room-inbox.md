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

## 공개방 목록 invalidation

같은 queue의 `PUBLIC_ROOMS_INVALIDATED`(eventVersion 1)는 공개방 목록을 다시 조회하라는 신호다.
서버는 방 생성, 종료, 설정 변경, 관리자 카테고리 변경이 일어나면 공개 여부와 관계없이 보내고,
참여 인원 수 변화에는 보내지 않는다. payload에 방 정보가 없으므로 원인과 관계없이 같은 방식으로
처리한다.

- Room inbox는 다시 조회하지 않고 공개방 목록 query에 다시 받아야 한다는 표시만 남긴다
  (`refetchType: "none"`). 방 생성·참여 등 mutation 뒤의 공개방 목록 무효화도 같다.
- 공개방 목록은 최신 생성순(`createdAt DESC`, 같은 시각이면 `roomId DESC`)이다. 방이 생기거나 종료되면
  뒤 page들의 경계가 밀리므로 첫 page만 바꾸고 뒤 page를 남기면 방이 빠지거나 겹친다.
- TanStack Query가 스스로 다시 받으면 받아 둔 page를 전부 다시 요청하므로, 공개방 목록 query는
  `staleTime`을 무한으로 두고 화면 진입·focus·네트워크 복귀로는 다시 받지 않는다.
- 표시가 남으면 `ChatRoomListView`가 목록 상자 위치를 보고 다시 받는다. 맨 위에서 상자 한 화면 안을 보고
  있으면 둘째 page부터 버리고 첫 page만 다시 받는다. 깊이 내려가 있으면 보던 위치가 흔들리지 않도록
  기다렸다가 그 위치로 돌아오거나 화면에 다시 들어올 때 다시 받는다. 어느 경우든 신호 한 번에 요청은
  최대 1개이고, 뒤 page는 사용자가 다시 내릴 때 새로 받는다.
- 접속 중인 사용자 전원에게 같은 순간 가는 신호이므로 첫 신호 뒤 400ms에 0–600ms 무작위 지연을
  더해 기다리고, 그동안 온 신호는 한 번의 조회로 합친다.
- 연결이 끊긴 동안의 신호는 다시 오지 않으므로 연결될 때 공개방 목록도 다시 조회한다.
- 모르는 eventType은 parser에서 무시하므로 서버가 먼저 배포되어도 동작에 영향이 없다.

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
