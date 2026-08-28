# 연구용 Room 대화 Export

## 목적과 접근 경계

연구용 Export는 특정 사용자가 Room의 대화 흐름에서 제시한 의견과 이후의
수정·삭제를 연구자가 함께 분석할 수 있도록 한다. 이 기능은 사용자 행동
트래킹이 아니며 참여, 접속, 읽음, 기기 또는 네트워크 이벤트를 수집하지 않는다.

`POST /api/v1/research/rooms/{roomId}/exports`는
`chat:research:exports` scope 전용이다. Room Membership은 요구하지 않으며 ACTIVE와
CLOSED Room을 모두 지원한다. 기존 `chat:audit:exports` 관리자 Export 계약과 Job
checkpoint에는 영향을 주지 않는다.

출력의 `userId`는 감사 이벤트의 내부 `senderUserId`다. 가명화되지 않은 제한
데이터이므로 익명 데이터로 취급해서는 안 된다. displayName, membershipId, 역할,
Membership 상태, 프로필, 연락처와 참여자 목록은 결합하거나 출력하지 않는다.

## Canonical source와 캡처 기준

`chat_message_audit_events`만 생성·수정·삭제 이력의 canonical source로 사용한다.
`chat_messages`를 읽어 감사 원장에 누락된 과거 메시지를 보충하지 않는다. 따라서
메시지 감사 원장 도입 전에 생성된 메시지, 기존 schema에서 생성되어 audit event가
없는 메시지, 삭제 원문 backfill이 수행되지 않은 기존 tombstone은 자동으로
포함되지 않는다.

연구용 Export의 데이터 완전성은 대상 Room의 메시지가 감사 원장 도입 이후
생성되었거나 별도 backfill이 완료되었다는 운영 전제를 따른다. 감사 원장에 존재하지
않는 기존 `chat_messages` 데이터는 연구용 Artifact에 포함되지 않는다.

Export 시작 시 Room을 읽고 audit watermark를 읽은 뒤 Room을 다시 읽는다. 두 Room
read의 version과 status가 같아야 snapshot이 확정되며, 설정된
`snapshotMaxAttempts` 안에 안정화되지 않으면 retryable
`503 CHAT_EXPORT_UNAVAILABLE`이다.

확정된 `capturedChangeSequence`에 대해 다음 범위만 스캔한다.

```text
0 < roomChangeSequence <= capturedChangeSequence
```

생성 도중 발생한 이후 변경은 포함하지 않는다. 원장은 1부터 watermark까지
연속이어야 하며, Room identity, CREATE 선행, messageId별 revision snapshot,
messageVersion, roomSequence, senderUserId, senderMembershipId 불변식을 검사한다.
불일치는 non-retryable `500 CHAT_EXPORT_LEDGER_INCONSISTENT`이다.

## Artifact 계약

ZIP에는 정확히 다음 네 entry만 있다.

```text
manifest.json
messages.jsonl
message_changes.jsonl
transcript.html
```

JSON과 JSONL은 UTF-8, LF, BOM 없음이며 JSON 시각은 UTC `Instant`다.

### messages.jsonl

캡처 watermark 시점의 최종 대화를 `messageSequence` 오름차순으로 제공한다.
`messageSequence`는 내부 `roomSequence`, 즉 메시지가 처음 생성된 대화 위치다.
필드는 `messageSequence`, `userId`, `content`, `createdAt`, `deleted`만 제공한다.

UPDATE는 최종 수정 내용을 유지한다. DELETE는 삭제 상태의 null content 대신
DELETE event의 `before.content`, 즉 삭제 직전 내용을 유지하고 `deleted=true`로
구분한다. 여러 번 수정 후 삭제된 경우 마지막 수정 내용이 출력된다.

### message_changes.jsonl

CREATE, UPDATE, DELETE를 `changeSequence` 오름차순으로 모두 제공한다.
`changeSequence`는 내부 `roomChangeSequence`, 즉 Room에서 변경이 발생한 순서다.
필드는 `changeSequence`, `messageSequence`, `userId`, `changeType`, `content`,
`changedAt`만 제공한다. CREATE/UPDATE content는 `after.content`, DELETE content는
`before.content`이며 null일 수 없다.

두 sequence는 합치지 않는다. `messageSequence`는 메시지 위치라서 수정·삭제에도
변하지 않고, `changeSequence`는 모든 변경에 새로 부여된다.

### transcript.html과 manifest.json

transcript는 `messages.jsonl`과 같은 순서와 최종 내용을 Asia/Seoul 시각으로
표시한다. 작성자는 userId만 표시하며 수정됨·삭제됨 상태를 함께 보여준다. Room
이름, 설명, userId와 content는 HTML escape하고 외부 resource 및 JavaScript를
CSP로 차단한다.

manifest schema v2는 Room 이름·설명과 순서 의미 없는 `roomCategoryIds`,
capture/generation 시각, watermark, 식별·내용 표현 정책, count와 세 데이터
파일의 byte size/SHA-256을 기록한다. 요청 연구자 ID나 참여자 목록은 기록하지
않는다. 전체 ZIP SHA-256은 응답 헤더로만 제공한다.

## 생명주기와 자원 제한

연구 Job은 `chat_research_export_jobs`에 별도로 저장하며 동일 Room의 RUNNING Job은
partial unique index로 하나만 허용한다. 서버 시작 시 남은 RUNNING Job은
`FAILED/SERVER_RESTARTED`로 복구한다. Artifact는 private temp workspace에서만
생성되고 영구 저장 또는 재다운로드되지 않는다.

Controller가 body write와 flush를 완료한 뒤에만 Job을 SUCCEEDED로 전환한다.
disconnect/write timeout은 DELIVERY_FAILED, 성공 상태 저장 실패는
SUCCESS_TRANSITION_FAILED다. 모든 경로에서 workspace cleanup과 전역 Export permit
반환을 독립적으로 시도한다.

관리자와 연구 Export는 동일한 `chat.export` concurrency guard, temp root,
deadline, disk reservation과 다음 제한을 공유한다: event 수, distinct message 수,
replay content bytes, artifact/workspace bytes, generation duration 및 최소 free disk.
messages, changes, transcript, manifest와 ZIP 생성 중의 실제 byte가 workspace budget을
소비한다.

## 제외 데이터

기간/cursor/Incremental Export, 사용자별 Export, 가명화, Membership 및 참여 이력,
Room 가입·퇴장·ban, read cursor/receipt, WebSocket 연결·heartbeat·focus·visibility,
IP, User-Agent, 기기, 프로필, displayName, 참여자 파일, 영구 Artifact와 재다운로드
API는 이 기능의 범위가 아니다.
