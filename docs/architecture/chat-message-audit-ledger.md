# Chat Message Audit Ledger

## 목적과 저장 책임

일반 채팅 기능과 향후 Super Admin Export의 저장 원천을 분리한다.

```text
chat_messages
→ 일반 REST·WebSocket·검색이 사용하는 현재 상태

chat_message_audit_events
→ CREATE·UPDATE·DELETE revision을 보존하는 append-only 원장

chat_room_message_audit_sequences
→ Room별 증분 Export watermark
```

`chat_messages.roomSequence`는 메시지 생성 순서다. 수정·삭제에서는 바뀌지
않는다. `roomChangeSequence`는 CREATE·UPDATE·DELETE 성공 상태 전이마다
Room별로 증가하며, replay·no-op·rejection에서는 증가하지 않는다.

## 현재 메시지와 삭제 원문

`chat_messages` schema v5의 persistence-only 계약은 다음과 같다.

```text
ACTIVE
content = 현재 본문
retainedContent = null
deletedAt = null

DELETED_BY_AUTHOR
content = null
retainedContent = 삭제 직전 최신 본문
deletedAt = updatedAt
```

`retainedContent`는 `ChatMessage`와 공개 `ChatMessagePayload`에 포함하지 않는다.
메시지 이력, 검색, Context, WebSocket event와 Room inbox에는 삭제 전 본문을
노출하지 않는다. 검색은 계속 ACTIVE message의 현재 `content`만 사용한다.

## Audit Event

Audit Event schema v1은 다음 세 event를 지원한다.

```text
MESSAGE_CREATED
before = null
after = 생성된 ACTIVE v1

MESSAGE_UPDATED
before = 수정 직전 ACTIVE revision
after = 수정 직후 ACTIVE revision

MESSAGE_DELETED
before = 삭제 직전 ACTIVE revision
after = content=null인 DELETED_BY_AUTHOR tombstone
```

Event ID는 `chat-message-audit:{messageId}:v{messageVersion}`로 결정한다.
`(roomId, roomChangeSequence)`와 `(messageId, messageVersion)`도 unique하다.
Audit collection에는 TTL을 두지 않으며 outbox dispatcher가 claim하거나
삭제하지 않는다.

`senderUserId`는 최초 작성자, `actorUserId`는 해당 변경 실행자다. 현재 actor는
`ROOM_PARTICIPANT`만 사용하지만 모델은 향후 `SUPER_ADMIN`, `SYSTEM`을 구분한다.
이 식별자는 내부 감사 정보이며 일반 Room 계약에 노출하지 않는다.

## Transaction 경계

메시지 current state, Room inbox summary, 기존 WebSocket outbox, audit event와
두 sequence allocation은 같은 Mongo transaction에 참여한다. 감사 event 저장이
실패하면 메시지 생성·수정·삭제도 commit하지 않는다. transaction retry나
idempotency replay에서는 기존 message/receipt를 먼저 확인하므로 새 audit event와
`roomChangeSequence`를 만들지 않는다.

기존 `chat_outbox_events`는 at-least-once 실시간 전달 queue이고,
`chat_message_audit_events`는 영구 revision 원장이다. 둘은 서로 대체하지 않는다.

## 내부 조회와 향후 Export

`ChatMessageAuditReader`는 현재 watermark 조회와 다음 증분 범위를 제공한다.

```text
afterSequenceExclusive
< roomChangeSequence
<= upToSequenceInclusive
```

결과는 `roomChangeSequence ASC`다. 현재 REST Controller에는 연결하지 않는다.
Export API, job, artifact, Super Admin 인증은 별도 작업이다.

## 로컬 DB 초기화

schema v4 message의 자동 변환이나 기존 tombstone 원문 backfill은 지원하지 않는다.
이번 binary는 `chat_messages` schema v5만 지원한다. 연동 전 로컬 Mongo volume과
프론트 캐시를 초기화한다.

```bash
docker compose -f compose.local.yaml down -v
docker compose -f compose.local.yaml up --build -d
```

초기화 후 생성되는 메시지부터 완전한 감사 revision을 보존한다.
