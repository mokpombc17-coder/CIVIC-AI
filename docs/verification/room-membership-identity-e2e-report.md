# Room Membership Identity 연동 검증 보고서

## 기준 상태

- 검증일: 2026-08-07 (Asia/Seoul)
- Frontend `main`: `873bad6245c186bb919d627a343fc195174ac914`
- Frontend `origin/main`: `873bad6245c186bb919d627a343fc195174ac914`
- Backend health: `GET http://localhost:8082/actuator/health` → `200`, `UP`
- Backend container image: `sha256:e6fec563b8b10161d…`
- Backend container created at: `2026-08-07T07:47:06.711571197Z`
- Backend commit SHA: image label과 공개 Actuator 정보에서 확인할 수 없음
- 기존 Frontend working tree 변경: `.gitignore`, `apps/mobile/tsconfig.json`

인증 쿠키, JWT 및 민감 헤더는 이 문서에 기록하지 않는다.

## Additive Backend 기준선 검증

### Owner identity REST projection

결과: PASS

검증한 응답:

- Room 생성
- Room 상세
- 공개 Room 목록
- 내 활성 Room 목록
- Room inbox
- Room 종료
- Room detail의 `myMembership.membershipId`

모든 응답의 `ownerMembershipId`와 자기 Membership ID가 생성 응답의
`ownerMembershipId`와 일치했다.

### Membership 대상 command

결과: PASS

`targetMembershipId`만 사용하여 다음 명령을 실제 Backend에 요청했다.

- ban: `200`
- unban: `200`
- ownership transfer: `200`
- 이전 owner ban 및 Room close: `200`

추가 확인:

- LEAVE/BAN 이후 REJOIN에서 `membershipId` 유지
- ownership 응답의 `previousOwnerMembershipId` 일치
- ownership 응답의 `newOwnerMembershipId` 일치
- transfer 이후 Room detail의 `ownerMembershipId` 일치
- ban/unban 응답의 `targetMembershipId` 일치

### Message sender identity

결과: PASS

- STOMP `CHAT_MESSAGE_CREATED.payload.senderMembershipId` 확인
- REST message history의 `senderMembershipId` 확인
- REST와 WebSocket의 sender Membership ID 일치
- message command `ACCEPTED` 확인

### Room inbox notification identity

결과: PASS

- `/user/queue/room-inbox-events` 실제 구독
- `MESSAGE_CREATED` notification 수신
- `notificationHint.senderMembershipId` 확인
- message sender의 owner Membership ID와 일치
- `eventVersion=1` 유지 확인

검증 과정에서 만든 Room은 모두 종료하여 ACTIVE Room quota를 남기지 않았다.

## 실패 및 원인 분류

현재 Backend 결함으로 분류된 실패는 없다.

| 현상                                                                   | 판정                 | 근거 및 조치                                                                                                                         |
| ---------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ownership transfer 후 즉시 close가 `409 ROOM_HAS_OTHER_ACTIVE_MEMBERS` | Fixture 순서 오류    | 이전 owner가 ACTIVE였다. 새 owner가 이전 owner를 먼저 ban한 뒤 close하여 통과했다.                                                   |
| Raw STOMP probe가 `INVALID_HEARTBEAT_POLICY`                           | Probe 계약 오류      | `heart-beat:0,0`을 사용했다. 계약값 `10000,10000`으로 변경 후 REST/WS sender 검증이 통과했다.                                        |
| 개인 inbox SUBSCRIBE receipt 대기 timeout                              | Probe 준비 신호 오류 | Native receipt를 구독 준비 계약으로 가정했다. Room topic 구독 후 `ROOM_SUBSCRIPTIONS_READY`를 사용하자 notification 검증이 통과했다. |

## Backend 전달 대상

현재 전달할 Backend blocker는 없다.

추가로 필요한 운영 식별 정보:

- 승인된 Backend commit SHA
- 실행 Docker image와 commit SHA를 연결할 revision label 또는 build info

## 후속 검증 원칙

Frontend Membership 전환 중 발생하는 실패는 다음 증거와 함께 이 문서에 누적한다.

- REST method, path, status, 요청·응답 필드
- STOMP destination, command, event type/version
- Room ID와 Membership ID
- 기대값과 실제값
- Frontend realtime diagnostics
- Backend / Frontend / fixture / environment 판정

필수 Membership 필드가 누락되면 participant `userId`로 fallback하지 않고 계약
오류로 보고한다.
