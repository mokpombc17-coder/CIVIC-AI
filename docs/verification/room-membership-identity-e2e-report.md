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

## Frontend Membership 전환 E2E

Frontend 전환 커밋:

- `c955cff feat(web): use membership identity in room state`
- `6f1bb6f feat(web): target room members by membership id`

추가한 Playwright 시나리오:

- `e2e/chat-room-membership-identity.spec.ts`
- 서로 다른 두 사용자의 Room 생성 및 참여
- `senderMembershipId` 기반 자기 메시지 수정 권한 판정
- 다른 참여자에게 수정·삭제 action을 노출하지 않음
- 멤버 관리 화면에서 public `userId`를 표시하지 않음
- ban/unban/ownership 요청 body가 `targetMembershipId` 하나만 포함하는지 검증
- command 응답의 Membership ID와 요청 target 일치 검증
- ownership transfer 후 새 방장에게 owner control 이동 확인

실행 결과:

```text
pnpm exec playwright test e2e/chat-room-membership-identity.spec.ts
→ 1 passed

pnpm exec playwright test e2e/chat-message-mutations.spec.ts
→ 1 passed
```

테스트 fixture Room은 새 방장이 이전 방장을 차단한 뒤 종료하여 정리했다.

## 실패 및 원인 분류

현재 Backend 결함으로 분류된 실패는 없다.

| 현상                                                                   | 판정                 | 근거 및 조치                                                                                                                         |
| ---------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ownership transfer 후 즉시 close가 `409 ROOM_HAS_OTHER_ACTIVE_MEMBERS` | Fixture 순서 오류    | 이전 owner가 ACTIVE였다. 새 owner가 이전 owner를 먼저 ban한 뒤 close하여 통과했다.                                                   |
| Raw STOMP probe가 `INVALID_HEARTBEAT_POLICY`                           | Probe 계약 오류      | `heart-beat:0,0`을 사용했다. 계약값 `10000,10000`으로 변경 후 REST/WS sender 검증이 통과했다.                                        |
| 개인 inbox SUBSCRIBE receipt 대기 timeout                              | Probe 준비 신호 오류 | Native receipt를 구독 준비 계약으로 가정했다. Room topic 구독 후 `ROOM_SUBSCRIPTIONS_READY`를 사용하자 notification 검증이 통과했다. |
| E2E 메시지 전송 버튼 timeout                                           | E2E locator 오류     | 실제 접근성 이름은 `전송`이었으나 `보내기`로 찾았다. 실제 이름으로 수정 후 통과했다.                                                 |
| E2E 참여자 row locator timeout                                         | E2E locator 오류     | dialog locator를 각 row의 자식 조건으로 중첩했다. dialog 범위의 고유 role locator로 수정 후 통과했다.                                |

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

## Frontend public participant `userId` 제거 준비 감사

Production 코드의 Room 참여자 식별 경로를 다시 검색하고 다음과 같이 분류했다.

### Membership ID로 전환된 판단 경로

- 메시지 self/other 판정과 참여자 label key: `senderMembershipId`
- 방장 판정과 owner control: `ownerMembershipId`
- Room member cache lookup 및 projection key: `membershipId`
- ban/unban/ownership 요청 및 retry identity: `targetMembershipId`
- message snapshot identity 비교: `senderMembershipId`

위 경로에는 participant `userId` 비교, key, 표시 또는 command target fallback이
남아 있지 않다.

### Membership-only hard cutover 상태

- REST Room projection, Membership, command result와 message snapshot schema에서
  participant `userId` 필드를 제거했다.
- Room owner compatibility projection을 제거하고 `ownerMembershipId`만 유지한다.
- Read-state Membership lifecycle identity도 `membershipId`로 통일한다. 로그인
  사용자 변경에 대한 비동기 결과 격리는 별도의 `principalGeneration`이 담당한다.
- Message, Room inbox와 Room WebSocket event를 v2로 전환했고 Room member state의
  legacy `userId`를 제거했다.

Room 관련 동작에는 `userId` fallback을 추가하지 않는다. Backend가 필수
Membership identity를 누락하면 프론트 계약 오류로 처리한다.
