# Room 생성 승인 구조

## 목적

운영 환경에서는 사용자가 Room을 즉시 생성하지 않고 생성 신청을 제출한다.
`chat:rooms:approve` scope를 보유한 관리자가 신청 원문을 검토한 뒤 수정 없이
승인하거나 반려한다. local 환경의 기존 E2E 흐름은 같은 신청 모델을 사용하되
자동 승인한다.

이 기능은 이메일이나 WebSocket 알림을 제공하지 않는다. 신청자는 자신의 신청
목록과 상세 API를 조회해 현재 상태와 반려 사유를 확인한다.

## 실행 모드

처리 로직은 Spring profile 이름을 직접 검사하지 않고 다음 설정을 사용한다.

```yaml
chat:
  room:
    creation:
      mode: DIRECT # 또는 APPROVAL_REQUIRED
      max-pending-requests-per-user: 3
```

- 기본값과 prod는 `APPROVAL_REQUIRED`다.
- local은 `DIRECT`다.
- `DIRECT`도 신청을 저장한 뒤 공통 Room 승인 로직으로 자동 승인한다.
- 잘못된 설정이나 명시되지 않은 환경이 즉시 생성으로 열리지 않도록 기본값은
  승인 필요 모드다.

## 데이터와 상태 전이

생성 신청은 `chat_room_creation_requests` collection에 저장한다.

```text
PENDING -> APPROVED
PENDING -> REJECTED
PENDING -> CANCELED
```

종료 상태는 다시 변경하지 않는다. 같은 사용자의 같은 `clientRequestId`는 unique며
요청 fingerprint가 같을 때만 replay한다. 서로 다른 payload에 같은 키를 사용하면
`IDEMPOTENCY_CONFLICT`다.

사용자는 동시에 최대 3개의 `PENDING` 신청만 보유할 수 있다. 내부 `pendingSlot`
partial unique index가 애플리케이션의 사전 count와 별개로 이 상한을 원자적으로
보장한다. 종료 전이에서는 slot을 제거해 다음 신청이 사용할 수 있게 한다.

Room ID와 OWNER Membership ID는 신청 시점이 아니라 승인 시점에 할당한다.
신청 document에는 제안된 Room 설정과 결정 결과만 저장하며 별도 Room 초안은 만들지
않는다.

## 승인 트랜잭션

승인은 하나의 Mongo transaction에서 다음 순서로 처리한다.

```text
현재 PENDING 신청 재조회
-> 신청자의 ACTIVE Room quota 재검사
-> Room 및 OWNER Membership 생성
-> 신청을 APPROVED로 compare-and-set
-> commit
```

신청 compare-and-set에 실패하면 transaction 전체가 rollback되므로 경합에서 패한
승인이 고아 Room이나 Membership을 남기지 않는다. commit 후에만 기존
`ROOM_CREATED` 후속 이벤트 전달을 실행한다.

승인 시 quota가 가득 찬 경우 `USER_ACTIVE_ROOM_LIMIT_EXCEEDED`를 반환하고 신청은
`PENDING`으로 유지한다. 관리자의 승인 scope는 신청자의 quota를 면제하지 않는다.

## 결정 경합

승인·반려·취소는 모두 `PENDING`과 domain version을 조건으로 compare-and-set한다.
따라서 동시에 실행되어도 하나의 종료 상태만 저장된다.

- 동일 신청의 승인 재시도는 기존 Room을 반환하며 `replayed=true`다.
- 같은 반려 사유의 재시도만 replay한다.
- 다른 반려 사유, 승인과 반려, 승인과 취소 등 반대 결정은
  `ROOM_CREATION_DECISION_CONFLICT`다.
- 승인 transaction이 경합에서 패하면 생성한 Room과 Membership도 함께 rollback된다.

## API와 권한

사용자 신청·조회·취소는 기존 Room scope를 사용한다.

```text
POST /api/v1/rooms                                  chat:rooms:write
GET  /api/v1/me/room-creation-requests              chat:rooms:read
GET  /api/v1/me/room-creation-requests/{id}         chat:rooms:read
POST /api/v1/me/room-creation-requests/{id}/cancel  chat:rooms:write
```

관리자 목록·상세·승인·반려는 모두 전용 scope만 허용한다.

```text
/api/v1/admin/room-creation-requests/**  chat:rooms:approve
```

Room owner, participant, `chat:rooms:read`, `chat:rooms:write`,
`chat:audit:exports` 권한은 관리자 결정을 허용하지 않는다.

## 운영 경계

- 반려 사유는 trim 후 1~100 Unicode code point인 한 줄 plain text다.
- 이메일, WebSocket 또는 별도 알림은 이 단계의 범위가 아니다.
- 관리자는 신청자의 Room 설정을 수정할 수 없다.
- 관리자 응답에는 신청자 `userId`가 포함되지만 프로필·이메일·전화번호는 조회하거나
  결합하지 않는다.
- 승인 신청 Artifact나 별도 감사 Export는 생성하지 않는다. 결정 이력은 신청
  document의 상태, 결정 주체와 시각으로 보존한다.
