# 채팅 메시지 Admission Control과 자동 재전송 정책

## 문서 상태

- 작성일: 2026-07-30
- 상태: 설계 결정
- 적용 대상: `apps/web`의 STOMP 채팅 메시지 전송
- 목적: 서버의 의도적인 사용량 제어를 사용자 오류로 노출하지 않으면서 재전송 트래픽을 분산한다.
- 현재 구현: Java `String.strip()` 기준 content 정규화 후 검증·전송, admission 결과 분류와
  retry delay 계산, transport 공용 delivery scheduler와 SharedWorker·Direct runtime 및
  transport lifecycle protocol, React composer 상태 통합
- 다음 구현: 브라우저 통합 환경에서 admission 재전송 UX 검증

## 목표

`USER_RATE_LIMITED`와 `SERVER_BUSY`는 잘못된 사용자 입력이 아니라 Chat Resource Server가
처리량을 보호하기 위해 보내는 일시적인 admission control 신호다. 프론트는 이를 일반 오류처럼
빨간 안내와 수동 재전송 버튼으로 표현하지 않는다.

목표 흐름은 다음과 같다.

```text
사용자 전송
  → content 정규화
  → 정규화된 content 검증
  → 동일한 content로 STOMP publish
  → USER_RATE_LIMITED 또는 SERVER_BUSY
  → 화면에는 terminal 실패를 표시하지 않음
  → 서버 retryAfterMs와 client jitter를 적용해 대기
  → 동일 clientMessageId와 동일 content로 자동 재전송
  → ACCEPTED 또는 DUPLICATE에서 완료
```

자동 재전송은 서버 제한을 우회하는 기능이 아니다. 서버가 제시한 최소 대기시간을 지키고 여러
클라이언트의 재전송 시점을 분산하는 client-side delivery 정책이다. 최종 판정 주체는 계속 Chat
Resource Server다.

## 적용 범위

### 조용한 자동 재전송 대상

다음 조건을 모두 만족한 메시지 command 결과만 admission control scheduler가 처리한다.

```text
status === REJECTED
retryable === true
code가 USER_RATE_LIMITED 또는 SERVER_BUSY
```

`retryable=true`만으로 조용한 자동 재전송을 결정하지 않는다. 예를 들어
`PERSISTENCE_FAILED`, `CHAT_PIPELINE_UNAVAILABLE` 또는 transport publish 실패는 장애의 성격과
복구 조건이 다르므로 이 정책에 자동으로 포함하지 않는다.

`USER_RATE_LIMITED`는 서버 계약상 `retryAfterMs`가 반드시 필요하다. 이 값이 `null`이면
프론트가 임의의 token 회복시간을 추측하지 않고 admission 자동 재전송 대상에서 제외한다.
`SERVER_BUSY`는 queue 포화 계약 때문에 `retryAfterMs=null`을 허용하고 client fallback
backoff를 사용한다.

### 적용하지 않는 대상

| 신호                                                     | 처리 원칙                                           |
| -------------------------------------------------------- | --------------------------------------------------- |
| `EMPTY_MESSAGE`, `MESSAGE_TOO_LONG`, `MESSAGE_TOO_LARGE` | 입력 수정이 필요하므로 즉시 안내                    |
| `INVALID_CONTROL_CHARACTER`, `INVALID_CLIENT_MESSAGE_ID` | 클라이언트 검증 또는 계약 오류로 처리               |
| `ROOM_SEND_FORBIDDEN`                                    | 권한·방 상태를 안내하고 재전송하지 않음             |
| `IDEMPOTENCY_CONFLICT`                                   | 같은 ID의 payload 불일치이므로 자동 재전송하지 않음 |
| 구독 거절                                                | 방 구독 상태 정책에서 별도로 처리                   |
| WebSocket 종료                                           | 연결 재수립 정책에서 별도로 처리                    |
| REST query·command                                       | TanStack Query 및 REST command 정책에서 별도로 처리 |

## Content 정규화

사용자가 입력한 content는 최초 전송 전에 한 번만 정규화한다.

```text
rawContent
  → 앞뒤 공백 strip
  → normalizedContent
  → 빈 값, code point, UTF-8 byte, 제어문자 검증
  → 전송 및 모든 재전송에 동일한 normalizedContent 사용
```

다음 불변식을 지킨다.

- 빈 메시지 검사는 strip 이후 수행한다.
- Unicode code point와 UTF-8 byte 제한도 strip 이후 값을 기준으로 계산한다.
- 최초 publish와 자동 재전송은 같은 `normalizedContent`를 사용한다.
- retry 대기 중 사용자가 composer의 draft를 수정해도 이미 생성된 delivery record의 content는
  바뀌지 않는다.
- 수정된 draft를 별도로 전송하면 새 `clientMessageId`를 갖는 새 메시지다.
- Java 서버의 `String.strip()`과 브라우저 정규화 함수가 지원 대상 공백 문자에서 같은 결과를
  내는지 계약 테스트로 고정한다.

정규화, 검증, 전송 계층이 각자 `trim` 또는 `strip`을 반복하지 않는다. 하나의 공통 함수가
`normalizedContent`를 만들고 이후 계층은 그 값을 불변 값으로 전달받는다.

## Delivery 상태 모델

메시지 전송은 최소한 다음 상태를 구분한다.

```text
IDLE
  → SENDING
  → RETRY_WAITING
  → SENDING
  → SENT
  → FAILED
  → CANCELLED
```

| 상태            | 의미                                                 | 사용자 표현                          |
| --------------- | ---------------------------------------------------- | ------------------------------------ |
| `SENDING`       | command 결과를 기다리는 중                           | 기존 전송 중 상태                    |
| `RETRY_WAITING` | admission control에 따라 예약된 재전송을 기다리는 중 | 오류 안내와 버튼을 표시하지 않음     |
| `SENT`          | `ACCEPTED` 또는 `DUPLICATE` 수신                     | 정상 완료                            |
| `FAILED`        | 자동 복구 한도 초과 또는 terminal 실패               | 이때만 실패 안내                     |
| `CANCELLED`     | owner·generation 변경이나 transport 종료로 취소됨    | 오래된 화면에는 실패를 표시하지 않음 |

`RETRY_WAITING`은 실패 상태가 아니라 전송 lifecycle의 중간 상태다. 기존의
`같은 메시지 다시 전송` 버튼은 admission control 흐름에서 제거한다.

## 재전송 식별자

최초 전송 시 다음 delivery record를 만들고 완료 또는 취소될 때까지 유지한다.

```text
clientMessageId
roomId
normalizedContent
ownerId
generation
attempt
firstSentAt
previousDelayMs
scheduledAt
```

모든 admission control 재전송은 다음 값을 그대로 유지한다.

- 같은 `clientMessageId`
- 같은 `roomId`
- 같은 `normalizedContent`

서버가 같은 메시지를 이미 처리했다면 `DUPLICATE`가 성공 종결 상태가 된다. retry마다 새 UUID를
발급하면 멱등성이 깨지고 중복 메시지가 만들어질 수 있으므로 금지한다.

`ChatMessageDeliveryScheduler`는 이 record와 timer를 React 컴포넌트 바깥에서 소유한다. 실제
STOMP publish, 현재 owner·generation 검사, clock, 난수와 timer는 dependency로 주입한다. 따라서
SharedWorker와 Direct transport가 같은 상태 머신을 사용할 수 있고, 단위 테스트에서는 실제
WebSocket이나 실제 시간을 사용하지 않는다.

Scheduler가 외부에 알리는 경계는 두 종류다.

- `onStateChange`: `SENDING`, `RETRY_WAITING` 중간 상태
- `onTerminal`: `sent`, `failed`, `cancelled` 최종 결과

terminal 전환 전에 활성 timer와 delivery map을 먼저 정리한다. callback에서 다시 lifecycle
명령이 발생하더라도 이미 종료된 메시지가 중복 처리되지 않는다.

Transport가 React에 공개하는 `ChatMessageDeliveryLifecycleEvent`는 content와 Worker owner를
노출하지 않고 `clientMessageId`, roomId, generation, attempt, status, retryAt과 terminal
reason만 전달한다. SharedWorker는 `ROOM_MESSAGE_DELIVERY_LIFECYCLE` protocol event로 원래
owner 탭에 전달하고, `SharedWorkerTransport`는 현재 roomId와 generation에 일치하는 event만
외부 listener로 전달한다. Leader Tab은 같은 SharedWorker transport protocol을 재사용하며,
Direct transport와 fallback transport도 동일한 lifecycle observer 계약을 구현한다.

React composer는 자체 command timeout을 두지 않고 transport lifecycle을 전송 상태의 기준으로
사용한다. `sending`, `retry-waiting`과 terminal 상세 결과를 기다리는 짧은
`failure-pending` 상태는 모두 기존 `isSending` UI로 투영한다. 따라서 admission 재전송을
기다리는 동안 입력과 중복 전송은 막되 오류 배너나 수동 재전송 버튼은 표시하지 않는다.

`failed` lifecycle 뒤에는 같은 transport가 전달하는 command result 또는 failure event를
사용해 서버 code에 맞는 terminal 오류 문구를 결정한다. `cancelled`는 오류로 표시하지 않고
전송 content를 현재 방 draft로 복구한다. lifecycle은 `clientMessageId`, roomId와 generation이
모두 현재 submission과 일치할 때만 반영한다.

### SharedWorker 소유권

SharedWorker를 지원하는 브라우저에서는 `ChatSharedWorkerRuntime`이 scheduler 하나를 소유한다.
각 탭은 최초 전송 command만 Worker에 전달하고 admission 결과 분류, timer와 실제 STOMP
재전송은 Worker 안에서 처리한다.

- retryable admission 결과는 탭으로 즉시 전달하지 않는다.
- 최종 `ACCEPTED`, `DUPLICATE`, terminal 거절 또는 자동 재전송 한도 초과만 원래 owner 탭으로
  전달한다.
- 다른 탭의 방 선점, owner port detach, 방 release와 WebSocket 재연결·종료는 관련 delivery를
  취소한다.
- `4001`, `4002`, `4003`으로 WebSocket이 종료되면 해당 연결의 모든 retry timer를 취소한다.
- retry callback은 현재 STOMP 연결, active room subscription, owner와 generation이 모두
  일치할 때만 publish한다.

SharedWorker와 Leader Tab transport를 모두 사용할 수 없는 환경에서는 `DirectStompTransport`가
동일한 scheduler를 소유한다. Direct transport는 탭 간 owner 식별자가 필요하지 않지만 현재
roomId, generation, STOMP 연결과 REST snapshot 적용 상태가 모두 유지될 때만 retry를
publish한다. 방 전환·release, transport detach, stale 재구독과 WebSocket 재연결·종료에서는
대기 중인 delivery를 취소한다.

## 대기시간과 Jitter

### 서버가 `retryAfterMs`를 제공하는 경우

`retryAfterMs`는 권장값이 아니라 재전송하면 안 되는 최소 대기시간으로 취급한다.

```text
notBefore = commandResultReceivedAt + retryAfterMs
scheduledAt = notBefore + random(0, jitterWindowMs)
```

client jitter는 항상 `retryAfterMs` 뒤에 더한다. `retryAfterMs`보다 이른 시각을 선택하는 full
jitter는 사용하지 않는다.

이 정책은 같은 제한 결과를 받은 클라이언트가 모두 정확히 1초, 3초 또는 5초 뒤에 동시에
재전송하는 현상을 완화한다.

### `SERVER_BUSY`에 `retryAfterMs`가 없는 경우

pipeline queue 포화처럼 서버가 정확한 대기시간을 제공하지 못하는 경우에는 bounded exponential
backoff 또는 decorrelated jitter를 사용한다.

개념적인 계산은 다음과 같다.

```text
minimumDelay = baseDelayMs
maximumDelay = min(maxDelayMs, previousDelayMs × growthFactor)
nextDelay = random(minimumDelay, maximumDelay)
```

`baseDelayMs`, `maxDelayMs`, `growthFactor`, jitter window, 최대 시도 횟수와 최대 총 경과시간은
구현 상수로 한곳에서 관리한다. 실제 값은 fake timer 기반 단위 테스트와 로컬 부하 시나리오를
통해 확정한다.

현재 프론트 초기 정책값은 다음과 같다.

| 항목                                    |     초기값 |
| --------------------------------------- | ---------: |
| 서버 `retryAfterMs` 뒤 jitter window    |  `1,000ms` |
| `retryAfterMs=null` fallback base delay |    `500ms` |
| fallback growth factor                  |        `3` |
| fallback 최대 delay                     | `30,000ms` |
| command 결과 timeout                    | `15,000ms` |
| 최대 publish 횟수                       |      `5회` |
| 최대 총 delivery 경과시간               | `60,000ms` |

delay 계산 값은 `DEFAULT_CHAT_MESSAGE_ADMISSION_RETRY_POLICY`, delivery 수명 값은
`DEFAULT_CHAT_MESSAGE_DELIVERY_LIMITS`에서 각각 관리한다. 최대 publish 5회는 최초 1회와 자동
재전송 최대 4회를 합한 값이다. 서버가 `retryAfterMs`를 제공하면 fallback 최대 delay로 서버
대기시간을 줄이지 않는다.

### 여러 메시지가 대기하는 경우

한 room에서 여러 메시지를 동시에 retry하면 한 클라이언트 내부에서도 작은 burst가 다시 생길 수
있다. 메시지 queue를 도입할 경우 다음 원칙을 적용한다.

- 같은 room의 사용자 전송 순서를 보존한다.
- retry 중인 선행 메시지를 건너뛰어 후행 메시지를 무제한 publish하지 않는다.
- 각 메시지의 jitter를 독립적으로 계산하더라도 실제 publish는 scheduler가 직렬화한다.
- 현재 단일 submission UI에서는 하나의 delivery만 활성 상태로 유지한다.

## 종료와 취소

예약된 timer는 다음 상황에서 반드시 취소한다.

- `ACCEPTED` 또는 `DUPLICATE`를 수신한 경우
- 같은 `clientMessageId`의 terminal `REJECTED` 또는 `FAILED`를 수신한 경우
- 최대 시도 횟수 또는 최대 총 경과시간을 초과한 경우
- 탭이 해당 방의 active owner가 아니게 된 경우
- 방 release 또는 다른 방 선점 전환이 발생한 경우
- `4001 / CONNECTION_REPLACED`
- `4002 / ROOM_ACCESS_REVOKED`
- `4003 / ROOM_CLOSED`
- provider, transport 또는 SharedWorker port가 종료된 경우

오래된 timer callback은 room lease의 `generation`, 현재 owner와 delivery 상태를 다시 확인한 뒤
publish한다. timer가 취소된 직후 실행되는 경쟁 상태에서도 stale 메시지를 보내지 않아야 한다.

일반 WebSocket 단절로 연결을 재수립하는 동안에는 timer만으로 publish하지 않는다. 연결과 room
subscription sync가 다시 준비된 뒤 message delivery를 재개할지는 별도의 재연결 계약으로
조정한다.

## 사용자 경험

### 조용히 처리하는 상태

`USER_RATE_LIMITED`와 retryable `SERVER_BUSY`는 다음 UI를 만들지 않는다.

- 빨간 오류 배너
- 토스트
- `같은 메시지 다시 전송` 버튼
- 서버 token, queue 또는 처리량을 추측한 안내

필요하다면 메시지 단위의 작은 pending 표현은 사용할 수 있지만, 일시적인 admission control을
사용자 행동이 필요한 실패처럼 표현하지 않는다.

### 사용자에게 알리는 시점

다음 경우에만 terminal 실패를 표시한다.

- 자동 재전송 한도를 초과함
- 서버가 `retryable=false`를 반환함
- 권한, 방 상태 또는 content 검증처럼 사용자 행동이 필요함
- 연결 복구가 불가능한 terminal 상태가 됨

terminal 실패가 된 content는 composer draft로 복구한다. admission 자동 재전송 한도를 초과한
경우 실패 문구는 표시하되 `같은 메시지 다시 전송` 버튼은 표시하지 않는다. admission과 무관한
retryable terminal 장애에는 기존 수동 복구 동작을 유지한다. 메시지 queue와 optimistic message
UI를 도입할 때는 이 terminal 상태를 메시지 단위 상태로 확장한다.

## 다른 Retry 정책과의 경계

부드러운 UX와 트래픽 분산이라는 원칙은 다른 계층에도 적용할 수 있지만 scheduler를 공유하지
않는다.

### WebSocket 재연결

- 일반 연결 단절은 연결 전용 backoff와 jitter를 사용한다.
- 현재 고정 `reconnectDelay`는 별도 작업에서 교체한다.
- `4001`은 자동 재연결하지 않는다.
- `4002`와 `4003`은 각 close code 계약을 따른다.
- message retry timer가 새 WebSocket을 직접 만들지 않는다.

### Subscription sync 재시도

- `ROOM_AUTHORIZATION_UNAVAILABLE`, `ROOM_SUBSCRIPTION_SYNC_UNAVAILABLE` 등 sync 전용
  `retryable=true` 결과만 다룬다.
- message의 `clientMessageId`가 아니라 새 `requestId`로 sync한다.
- READY 이전에는 message admission retry를 publish하지 않는다.

### 방 구독 제한

`ROOM_SUBSCRIBER_LIMIT_EXCEEDED`처럼 사용자에게 상태 설명이 필요한 제한은 조용히 무한
재시도하지 않는다. 구독 거절의 `retryable` 계약을 보존하고 사용자 친화적인 방 상태와 명시적인
복구 행동을 제공하는 별도 UX 정책이 필요하다.

## 관측성

사용자에게 조용히 처리하더라도 개발과 운영에서 원인을 추적할 수 있어야 한다.

기록할 수 있는 항목:

- code
- attempt
- 서버 `retryAfterMs`
- 적용한 jitter
- 실제 대기시간
- 성공, 중복 완료, terminal 실패 또는 취소 사유

메시지 content와 JWT는 로그에 기록하지 않는다. `clientMessageId`도 운영 로그 정책에 따라
마스킹하거나 correlation 용도로만 제한적으로 사용한다.

## 테스트 기준

### 단위 테스트

- strip 이후 content로 빈 값, code point와 UTF-8 byte를 검증한다.
- 최초 publish와 retry가 같은 `clientMessageId`와 content를 사용한다.
- `retryAfterMs` 이전에는 절대 publish하지 않는다.
- 주입한 난수로 jitter 범위의 최소·최대 경계를 검증한다.
- `retryAfterMs=null`인 `SERVER_BUSY`가 bounded backoff를 사용한다.
- `retryable=false` 또는 allowlist 밖의 code는 admission scheduler에 들어가지 않는다.
- 성공, terminal 실패, room 전환과 close code에서 timer를 취소한다.
- 오래된 generation의 timer callback을 무시한다.
- 최대 재시도 한도를 넘으면 한 번만 terminal 실패로 전환한다.

시간과 난수는 테스트에서 제어할 수 있도록 scheduler에 주입한다. 실제 timer와
`Math.random()`에 직접 의존하는 테스트를 만들지 않는다.

### 통합 및 E2E 테스트

- 짧은 메시지를 빠르게 보내 `USER_RATE_LIMITED`를 유발해도 빨간 오류와 수동 재전송 버튼이
  나타나지 않는다.
- 서버가 알려준 최소 대기시간 이후 같은 메시지가 한 번만 확정된다.
- `SERVER_BUSY` fixture에서 자동 재전송 후 `ACCEPTED` 또는 `DUPLICATE`로 완료된다.
- retry 대기 중 방을 전환하거나 닫으면 예약된 메시지가 전송되지 않는다.
- 새로고침 또는 연결 복구 경계에서 중복 메시지가 만들어지지 않는다.

실제 서버 사용량에 의존하는 테스트와 결정적인 fixture 기반 테스트를 분리한다. CI의 실행
타이밍에 따라 제한 발생 여부가 달라지는 테스트를 핵심 계약 테스트로 사용하지 않는다.

## 구현 전 확인할 값

다음 값은 transport 통합과 부하 시나리오 검증 과정에서 확정한다.

- terminal 실패 시 content 복구 방식
- 향후 여러 메시지 queue에서의 순서 및 동시성 정책

이미 코드에 반영한 jitter, fallback delay, 최대 publish 횟수와 최대 총 경과시간도 로컬 부하
시나리오 결과에 따라 조정할 수 있다.
