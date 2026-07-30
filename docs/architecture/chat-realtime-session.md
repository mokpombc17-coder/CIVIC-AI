# 채팅 실시간 세션과 멀티탭 정책

## 문서 상태

- 작성일: 2026-07-29
- 상태: 설계 결정
- 적용 대상: `apps/web`의 브라우저 및 Expo WebView 채팅 런타임
- 서버: Chat Resource Server
- 프로토콜: Native WebSocket 위의 STOMP
- 클라이언트 라이브러리: `@stomp/stompjs`
- 현재 구현: SharedWorker 소유 단일 연결·활성 방 lease·STOMP subscription 전환·멀티탭 UX
- 다음 구현: 수정 API 명세에 따른 실시간 payload 전달

이 문서는 SharedWorker라는 기술 자체를 도입하는 것을 목표로 하지 않는다. 최상위 목표는 한
브라우저에서 같은 사용자가 Chat Resource Server와 맺는 WebSocket 연결과 활성 채팅방 구독을
하나로 제한하는 것이다.

## 최상위 불변식

지원되는 멀티탭 환경에서는 다음 불변식을 지켜야 한다.

```text
한 브라우저의 한 사용자
  → Chat Resource Server WebSocket 1개
  → STOMP Client 1개
  → 사용자 queue subscription 1세트
  → 활성 채팅방 1개
  → 활성 채팅방 topic subscription 1세트
  → 활성 채팅방을 소유하는 탭 1개
```

여기서 "한 브라우저"의 기술적 범위는 동일한 웹 origin, 브라우저 프로필 및 스토리지 파티션을
공유하여 같은 SharedWorker에 접근할 수 있는 browsing context 집합이다. 서로 다른 브라우저,
시크릿 창, 다른 origin, 모바일 앱과 데스크톱 웹을 합쳐 전역 WebSocket 하나를 보장한다는 뜻은
아니다.

## 용어

### 방 닫기

이 문서에서 "이전 채팅방을 닫는다"는 표현은 클라이언트 활성 방 세션을 해제한다는 뜻이다.

수행하는 작업:

- 이전 방의 STOMP message topic 구독 해제
- 이전 방의 STOMP room-event topic 구독 해제
- 이전 탭의 메시지 입력 비활성화
- 이전 탭에 활성 방 소유권이 교체되었음을 알림

수행하지 않는 작업:

- `POST /api/v1/rooms/{roomId}/commands/close`
- 방 멤버십 `leave`
- 전체 WebSocket 종료
- 브라우저 탭을 강제로 닫거나 다른 URL로 이동

서버 도메인의 `ROOM_CLOSED`와 클라이언트의 활성 방 해제는 서로 다른 개념이다.

### 연결 소유권

STOMP Client와 WebSocket을 생성하고 연결·재연결·종료하는 책임이다. 목표 구조에서는
SharedWorker가 연결 소유권을 가진다.

### 활성 방 소유권

현재 방 topic을 구독하고 메시지를 보낼 수 있는 탭의 권한이다. 동시에 하나의 MessagePort만
활성 방 소유자가 될 수 있다.

### 탭과 MessagePort

각 브라우저 탭은 SharedWorker와 하나의 `MessagePort`로 통신한다. Worker는 탭을 직접 다루지
않고 내부 `portId`로 식별한다.

## 현재 구조와 목표 구조

### 현재

```text
SharedWorker 지원 브라우저
  ChatRealtimeProvider
    → SharedWorkerTransport
      → MessagePort
        → Chat SharedWorker
          → @stomp/stompjs Client 1개
            → WebSocket 1개

SharedWorker 미지원 단일 WebView
  ChatRealtimeProvider
    → DirectStompTransport
      → @stomp/stompjs Client
        → WebSocket
```

SharedWorker 지원 여부는 transport factory가 판단한다. 지원 브라우저에서는 탭마다
`SharedWorkerTransport`와 MessagePort를 만들지만 STOMP Client는 Worker 안에서 하나만 생성한다.
SharedWorker 미지원 환경에서만 `DirectStompTransport`를 사용한다.

### 목표

```text
탭 A ─┐
      ├─ SharedWorkerTransport ─ MessagePort ─ Chat SharedWorker
탭 B ─┘                                         │
                                                ├─ STOMP Client 1개
                                                ├─ WebSocket 1개
                                                ├─ user queue 1세트
                                                └─ active room topic 1세트
```

React 컴포넌트는 `ChatRealtimeTransport`에만 의존한다. 연결 소유자가 Direct transport에서
SharedWorker로 바뀌어도 다음 컴포넌트와 Hook의 사용 계약은 유지한다.

- `ChatRealtimeProvider`
- `useChatRealtimeConnection`
- `ChatConnectionStatus`

## 계층별 책임

### 채팅 페이지

- `/chat/[roomId]` 진입 시 방 소유권을 요청한다.
- 다른 탭에서 선점된 뒤 사용자가 재활성화 버튼을 누르면 방 소유권을 다시 요청한다.
- bfcache에서 페이지가 복원되면 끊어진 MessagePort를 다시 연결한 뒤 방 소유권을 복구한다.
- `/chat/[roomId]`를 벗어나면 자신이 가진 방 소유권을 해제한다.
- Worker가 전달한 탭별 활성 상태에 따라 입력과 전송 UI를 제어한다.
- HttpOnly JWT를 읽거나 Worker로 전달하지 않는다.

### ChatRealtimeProvider

- 탭과 transport의 attach/detach 생명주기를 React route 생명주기에 연결한다.
- 외부 transport snapshot을 `useSyncExternalStore`로 React에 제공한다.
- STOMP Client를 React 컴포넌트에 노출하지 않는다.
- SharedWorker와 Direct fallback의 차이를 하위 UI에 노출하지 않는다.

### SharedWorkerTransport

- SharedWorker를 생성하거나 기존 Worker에 연결한다.
- `MessagePort`를 열고 탭의 command를 Worker로 전달한다.
- Worker event를 connection 및 room snapshot으로 변환한다.
- Worker 생성 실패와 런타임 오류를 구분한다.
- Worker가 살아 있을 가능성이 있는 상태에서 Direct WebSocket을 추가로 만들지 않는다.

### Chat SharedWorker

- 모든 연결된 `MessagePort`를 관리한다.
- STOMP Client와 WebSocket을 하나만 소유한다.
- user queue를 연결당 한 번 구독한다.
- 활성 방과 해당 방의 subscription을 하나만 관리한다.
- 탭 간 활성 방 소유권을 중재한다.
- 연결·구독 상태와 오류를 관련 탭에 전달한다.
- 재연결 후 user queue와 현재 활성 방을 복구한다.

### STOMP Client

현재 기본 계약을 유지한다.

```text
brokerURL:          ws://localhost:8082/ws
connectHeaders:     {}
heartbeatIncoming:  10,000ms
heartbeatOutgoing:  10,000ms
reconnectDelay:     3,000ms
```

STOMP `CONNECT`에 `Authorization`을 추가하지 않는다. WebSocket handshake에서 브라우저가
`civic_ai_access_token` HttpOnly 쿠키를 전달한다.

### TanStack Query

- REST query 결과와 화면 캐시를 탭별로 관리한다.
- Worker가 전달한 서버 event를 현재 탭의 query cache에 반영한다.
- 연결 소유권이나 STOMP subscription 자체를 관리하지 않는다.
- 재연결 누락 데이터는 메시지 이력 API와 `roomSequence` 계약에 따라 복구한다.

## STOMP subscription 정책

### 연결당 유지하는 사용자 subscription

```text
/user/queue/command-results
/user/queue/system-events
```

두 subscription은 연결 성공 시 한 번 만들고 방 전환 중에는 유지한다.

### 활성 방에서만 유지하는 subscription

```text
/topic/rooms/{activeRoomId}/messages
/topic/rooms/{activeRoomId}/room-events
```

동시에 서로 다른 두 방의 topic을 구독하지 않는다.

현재 백엔드 로컬 기본 제한을 기준으로 하면 총 subscription 수는 최대 네 개다.

```text
user queue 2개 + active room topic 2개 = 총 4개
```

### 방 전환

`room-01`에서 `room-02`로 전환할 때:

```text
유지:
  /user/queue/command-results
  /user/queue/system-events

해제:
  /topic/rooms/room-01/messages
  /topic/rooms/room-01/room-events

생성:
  /topic/rooms/room-02/messages
  /topic/rooms/room-02/room-events
```

방을 전환하기 위해 WebSocket을 끊고 다시 연결하지 않는다.

## 활성 방 lease

Worker는 활성 방을 단일 lease로 관리한다.

```ts
type ActiveRoomLease = Readonly<{
  roomId: string;
  ownerPortId: string;
  generation: number;
}>;
```

### roomId

현재 Worker가 topic을 구독하는 방이다.

### ownerPortId

현재 방을 활성화한 탭의 MessagePort 식별자다. 이 탭만 메시지 전송을 요청할 수 있다.

### generation

방 전환마다 증가하는 단조 증가 값이다. 이전 subscription이나 비동기 복구 작업에서 늦게 도착한
결과를 무시하는 데 사용한다.

```text
room-01 generation 1
room-02 generation 2
room-03 generation 3
```

generation 1의 callback이 room-03 활성화 이후 도착하면 현재 상태에 반영하지 않는다.

## 멀티탭 활성 방 정책

### 다른 방을 여는 경우

```text
탭 A가 room-01 활성화
  → activeRoom = room-01, owner = A

탭 B가 room-02 활성화
  → room-01 subscription 해제
  → 탭 A에 ROOM_REPLACED 전달
  → room-02 subscription 생성
  → activeRoom = room-02, owner = B
```

탭 A는 그대로 열려 있지만 메시지를 보내거나 실시간 메시지를 수신하는 활성 탭은 아니다.

### 같은 방을 다른 탭에서 여는 경우

```text
탭 A가 room-01 활성화
탭 B가 room-01 소유권 요청
  → room-01 subscription 유지
  → owner만 A에서 B로 교체
  → 탭 A에 ROOM_REPLACED 전달
```

불필요하게 동일 topic을 unsubscribe/subscribe하지 않는다.

### 이전 탭을 다시 보는 경우

비활성 탭 A를 다시 보는 것만으로는 같은 방의 소유권을 자동으로 선점하지 않는다. 사용자가
`이 탭에서 다시 활성화`를 누르면 Worker가 현재 owner를 교체하고 기존 owner 탭에
`ROOM_REPLACED`를 전달한다. 탭 포커스만으로 자동 선점하면 두 탭을 오갈 때마다 입력 권한이
의도치 않게 이동하므로 명시적인 사용자 동작을 요구한다.

탭 포커스만으로 REST `join`, `leave`, `close` command를 실행하지 않는다.

### 활성 탭이 방 화면을 벗어나는 경우

활성 owner 탭이 `/chat/[roomId]`에서 나가면 `RELEASE_ROOM`을 보낸다.

- owner와 roomId가 일치하면 현재 방 subscription을 해제한다.
- 다른 탭의 오래된 release이면 무시한다.
- Worker는 임의로 이전 탭의 방을 자동 복원하지 않는다.
- 남은 탭이 visible/focus 상태에서 다시 `CLAIM_ROOM`을 보내면 그 방을 활성화한다.

이 정책은 보이지 않는 오래된 탭을 Worker가 임의로 다시 활성화하는 동작을 방지한다.

## 비활성 탭 UX 정책

활성 방 소유권을 다른 탭에 넘긴 탭은 다음 안내를 표시한다.

```text
다른 탭에서 채팅방을 사용 중입니다.
[이 탭에서 다시 활성화]
```

비활성 탭에서는:

- 메시지 입력을 비활성화한다.
- 메시지 전송 버튼을 비활성화한다.
- Worker에 남아 있던 오래된 전송 요청이 있어도 서버로 보내지 않는다.
- 방의 기존 REST/Query 화면은 유지할 수 있다.
- "이 탭에서 다시 활성화"를 누르면 `CLAIM_ROOM`을 다시 보낸다.

UI 비활성화만 보안 또는 일관성 경계로 사용하지 않는다. Worker가 메시지 전송 요청을 다시
검증한다.

## Worker 메시지 계약 초안

이 계약은 웹과 Expo 네이티브 사이의 bridge 계약이 아니다. `apps/web` 내부의 탭과 SharedWorker
사이에서만 사용하므로 `packages/bridge`에 두지 않는다.

### 페이지에서 Worker로

```ts
type ChatWorkerCommand =
  | {
      type: "ATTACH";
      portId: string;
    }
  | {
      type: "CLAIM_ROOM";
      portId: string;
      requestId: string;
      roomId: string;
    }
  | {
      type: "RELEASE_ROOM";
      portId: string;
      requestId: string;
      roomId: string;
    }
  | {
      type: "SEND_MESSAGE";
      roomId: string;
      clientMessageId: string;
      content: string;
    }
  | {
      type: "RECONNECT";
      portId: string;
    }
  | {
      type: "AUTH_CHANGED";
    }
  | {
      type: "DETACH";
    };
```

### Worker에서 페이지로

```ts
type ChatWorkerEvent =
  | {
      type: "CONNECTION_SNAPSHOT";
      snapshot: ChatConnectionSnapshot;
    }
  | {
      type: "ROOM_ACTIVATED";
      requestId: string;
      roomId: string;
      generation: number;
    }
  | {
      type: "ROOM_REPLACED";
      roomId: string;
      activatedRoomId: string;
      generation: number;
    }
  | {
      type: "ROOM_RELEASED";
      requestId: string;
      roomId: string;
      generation: number;
    }
  | {
      type: "ROOM_ACTIVATION_FAILED";
      requestId: string;
      roomId: string;
      code: string;
      message: string;
    }
  | {
      type: "ROOM_SUBSCRIPTION_FAILED";
      roomId: string;
      generation: number;
      code: string;
      message: string;
    }
  | {
      type: "CHAT_MESSAGE_CREATED";
      payload: unknown;
    }
  | {
      type: "ROOM_EVENT";
      payload: unknown;
    }
  | {
      type: "COMMAND_RESULT";
      payload: unknown;
    }
  | {
      type: "SYSTEM_EVENT";
      payload: unknown;
    }
  | {
      type: "LOCAL_COMMAND_REJECTED";
      clientMessageId?: string;
      code: string;
    };
```

수정된 Chat API 명세가 확정되기 전까지 서버 event payload는 `unknown`으로 취급한다. 확정 후
런타임 검증 스키마와 타입을 추가한다.

## 방 전환 알고리즘

Worker가 `CLAIM_ROOM`을 받으면 다음 순서로 처리한다.

1. 요청한 port가 현재 연결된 port인지 확인한다.
2. `roomId` 형식을 검증한다.
3. 현재 room과 owner가 모두 같으면 현재 snapshot을 다시 전달하고 종료한다.
4. generation을 증가시킨다.
5. 이전 owner에게 `ROOM_REPLACED`를 전달한다.
6. roomId가 달라졌다면 이전 room subscription을 해제한다.
7. 새 `ActiveRoomLease`를 저장한다.
8. STOMP가 연결되지 않았다면 구독 의도만 저장하고 연결 완료를 기다린다.
9. 연결되어 있다면 새 room topic을 구독한다.
10. 새 owner에게 `ROOM_ACTIVATED`를 전달한다.

같은 room에서 owner만 바뀌는 경우 기존 subscription을 유지한다.

## 메시지 전송 정책

Worker는 `SEND_MESSAGE`를 서버로 publish하기 전에 모두 검증한다.

```text
요청 portId === activeRoom.ownerPortId
요청 roomId === activeRoom.roomId
STOMP 연결 상태 === CONNECTED
room subscription 상태 === ACTIVE
clientMessageId가 유효한 UUID
content가 클라이언트 기본 제약을 통과
```

검증에 실패하면 서버로 보내지 않고 요청한 탭에 `LOCAL_COMMAND_REJECTED`를 전달한다.

활성 탭 UI가 비활성화되어 있어도 Worker 검증을 생략하지 않는다. UI event queue, 오래된 탭 코드,
빠른 소유권 전환으로 인해 stale command가 도착할 수 있기 때문이다.

## 생명주기

### 탭 attach

```text
ChatRealtimeProvider mount
  → SharedWorkerTransport 생성
  → SharedWorker 또는 기존 Worker에 연결
  → MessagePort start
  → ATTACH
  → 현재 CONNECTION_SNAPSHOT 수신
```

첫 번째 port가 연결되면 Worker가 STOMP 연결을 활성화한다. 추가 port는 기존 STOMP 연결을
공유한다.

### 탭 detach

정상적인 route cleanup과 `pagehide`에서 `DETACH`를 전송하고 MessagePort를 닫는다.
페이지가 bfcache에서 `pageshow`로 복원되면 같은 transport가 새 MessagePort로 다시 attach한다.

- 비활성 port면 port만 제거한다.
- 활성 room owner면 room lease를 해제하고 room subscription을 정리한다.
- 다른 port가 남아 있으면 WebSocket은 유지한다.
- 마지막 port가 나가면 STOMP 연결을 종료한다.

브라우저 강제 종료나 process crash에서는 `DETACH`를 보내지 못할 수 있다. 명시적 detach,
MessagePort 오류 처리, SharedWorker 자체의 owner 생명주기 및 이후의 새로운 claim으로 복구한다.

### WebSocket 재연결

STOMP 재연결이 완료되면 기존 subscription은 유지된 것으로 간주하지 않는다.
단, 서버가 `4001 / CONNECTION_REPLACED`로 종료한 연결은 재연결 대상에서 제외한다.

1. user queue 두 개를 다시 구독한다.
2. 현재 `ActiveRoomLease`가 있으면 현재 generation으로 방 topic을 다시 구독한다.
3. active owner 탭에 재동기화 필요 상태를 알린다.
4. 메시지 이력 API가 확정되면 마지막 `roomSequence` 이후의 누락 메시지를 복구한다.
5. 복구 도중 generation이 바뀌면 이전 복구 결과를 폐기한다.

### 다른 환경의 연결에 의한 교체

같은 사용자가 다른 브라우저, 프로필 또는 기기에서 새 연결을 만들면 서버가 기존 연결을
WebSocket close code `4001`, reason `CONNECTION_REPLACED`로 종료한다.

- SharedWorker와 Direct fallback은 close callback에서 STOMP Client를 `deactivate()`한다.
- connection snapshot을 `replaced` 상태와 `CONNECTION_REPLACED` 오류 code로 전환한다.
- SharedWorker는 같은 terminal snapshot을 연결된 모든 port에 전달한다.
- 일반 자동 재연결과 기존 `RECONNECT` 명령을 모두 중단한다.
- UI는 `다른 환경에서 연결됨`을 표시하고 일반적인 `다시 연결` 버튼을 노출하지 않는다.

이는 서로 다른 환경이 번갈아 상대 연결을 교체하는 재연결 경쟁을 막기 위한 terminal
상태다. 향후 명시적인 선점 UX가 필요하면 일반 재연결과 구분된 별도 사용자 동작으로 추가한다.

### 인증 변경

HttpOnly 쿠키가 변경되어도 이미 연결된 WebSocket의 인증 사용자는 자동으로 바뀌지 않는다.

```text
AUTH_CHANGED
  → 기존 STOMP 연결 종료
  → 새 WebSocket handshake
  → 변경된 쿠키로 인증
  → user queue 재구독
  → active room이 있으면 재구독
```

페이지는 JWT를 읽어 Worker로 전달하지 않는다.

## 연결 및 subscription 상태

### 연결 상태

```text
idle
connecting
connected
reconnecting
disconnecting
disconnected
replaced
error
```

Worker의 snapshot을 모든 port에 전달하고 각 탭이 독립적으로 연결 상태를 추측하지 않는다.

### 활성 방 상태

```text
idle
claimed
subscribing
active
replaced
rejected
```

연결과 방 상태를 하나의 enum으로 합치지 않는다. WebSocket은 연결되어 있지만 활성 방이 없거나,
연결 재시도 중에도 복구할 활성 방 lease가 존재할 수 있기 때문이다.

## 경쟁 상태 방지

Worker의 event loop만으로 모든 경쟁 상태가 해결된다고 가정하지 않는다. 재연결, 권한 확인,
메시지 이력 복구는 비동기 작업이므로 이전 작업이 늦게 완료될 수 있다.

각 subscription callback과 복구 작업은 시작 당시 generation을 캡처한다.

```ts
const subscriptionGeneration = activeRoom.generation;

handleIncomingMessage((message) => {
  if (subscriptionGeneration !== activeRoom?.generation) {
    return;
  }

  deliverToActiveOwner(message);
});
```

다음 항목에도 request 또는 generation correlation을 적용한다.

- `CLAIM_ROOM` 요청과 결과
- subscription 거절 system event
- 재연결 후 방 복구
- 메시지 이력 조회
- 메시지 command 결과

## 오류 처리 정책

### Worker 생성 실패

SharedWorker를 생성하지 못했으며 Worker가 실행되지 않았음이 확실할 때만
`DirectStompTransport` fallback을 사용할 수 있다.

### 실행 중 Worker 오류

실행 중 Worker 오류가 발생했다고 즉시 탭마다 Direct WebSocket을 만들지 않는다. 기존 Worker와
WebSocket이 살아 있는 상태에서 fallback을 만들면 단일 연결 불변식이 깨질 수 있다.

처리 순서:

1. 모든 탭에 Worker 오류 상태 표시
2. 기존 port 정리 여부 확인
3. 동일 SharedWorker 재연결 또는 재생성 시도
4. Worker가 종료되었음이 확인된 뒤에만 fallback 검토

### WebSocket 및 STOMP 오류

- Worker가 단일 재연결 루프를 소유한다.
- 탭의 `RECONNECT` 요청 여러 개를 하나의 재연결 시도로 합친다.
- 모든 port에 동일한 connection snapshot을 전달한다.
- `4001 / CONNECTION_REPLACED`는 terminal `replaced` 상태로 전환하고 재연결하지 않는다.
- 그 밖의 비재시도 인증 오류는 서버 close/error 계약이 확정되면 같은 방식으로 분류한다.

### 방 구독 거절

`/user/queue/system-events`의 구독 거절 code를 현재 lease와 연결한다.

```text
ROOM_SUBSCRIPTION_FORBIDDEN
ACTIVE_ROOM_LIMIT_EXCEEDED
SUBSCRIPTION_LIMIT_EXCEEDED
ROOM_SUBSCRIBER_LIMIT_EXCEEDED
DUPLICATE_SUBSCRIPTION
INVALID_DESTINATION
DESTINATION_DISABLED
ROOM_AUTHORIZATION_UNAVAILABLE
```

거절된 경우:

- 현재 lease와 동일한 요청인지 확인
- room 상태를 `rejected`로 변경
- 메시지 전송 차단
- owner 탭에 `ROOM_ACTIVATION_FAILED` 전달
- code의 재시도 가능 여부에 따라 lease 유지 또는 해제

### 오래된 port의 요청

이미 owner가 교체된 port의 `RELEASE_ROOM`, `SEND_MESSAGE`, 구독 결과는 현재 lease와 대조하여
무시하거나 로컬 거절한다.

## 지원 환경과 fallback 정책

### SharedWorker 지원 브라우저

`SharedWorkerTransport`를 사용하고 멀티탭 단일 WebSocket과 단일 활성 방을 보장한다.

### Expo WebView 또는 단일 browsing context

SharedWorker를 사용할 수 없으면 `DirectStompTransport`를 사용할 수 있다. 앱이 하나의 WebView만
운영한다는 전제에서는 해당 앱 안의 WebSocket도 하나다.

### SharedWorker 미지원 데스크톱 브라우저

탭별 Direct fallback만 사용하면 여러 WebSocket이 만들어지므로 엄격한 단일 연결을 보장할 수
없다. 지원 범위를 넓혀야 한다면 `BroadcastChannel`과 leader election을 사용하는 별도 transport
정책이 필요하다.

SharedWorker 실행 중 오류를 단순 feature 미지원과 동일하게 취급하지 않는다.

## 보안 정책

- JWT를 JavaScript로 읽지 않는다.
- JWT를 MessagePort payload에 넣지 않는다.
- JWT를 localStorage, sessionStorage 또는 IndexedDB에 복제하지 않는다.
- STOMP `CONNECT`에 `Authorization`을 추가하지 않는다.
- WebSocket handshake의 HttpOnly 쿠키 인증을 사용한다.
- Worker command는 신뢰하지 않고 port, owner, room 및 message 식별자를 검증한다.
- 개발 로그에 JWT, Cookie 헤더 또는 메시지 전체 payload를 기록하지 않는다.

## 관측성과 디버깅

개발 로그에는 최소한 다음 correlation 값을 포함한다.

```text
portId
roomId
generation
requestId
clientMessageId
connection status
room subscription status
```

로그 예:

```text
[chat:worker] port attached portId=tab-a
[chat:worker] room claimed roomId=room-01 owner=tab-a generation=1
[chat:worker] room replaced previous=room-01 next=room-02 generation=2
[chat:worker] stale event ignored roomId=room-01 generation=1 current=2
```

민감 정보와 메시지 content는 기본 로그에서 제외한다.

## 구현 단계

### 1. Worker 번들링 spike

진행 상태: 완료 (2026-07-29)

- module SharedWorker를 작은 probe protocol로 생성했다.
- `/chat?chatWorkerProbe=1`에서만 probe port를 연결하며 WebSocket이나 STOMP는 생성하지 않는다.
- `pnpm dev:web`와 production `next build`에서 Worker chunk 생성과 로드를 확인했다.
- 같은 origin의 두 탭에서 동일한 Worker instance와 서로 다른 port 연결을 확인했다.
- 한 탭이 채팅 route를 벗어나면 연결 수가 `2 → 1`로 감소하는 것을 확인했다.

probe 코드와 query parameter는 2단계 구현으로 대체되어 현재 코드에는 남아 있지 않다.

### 2. 연결 소유권 이동

진행 상태: 완료 (2026-07-29)

- `SharedWorkerTransport`가 탭별 MessagePort와 외부 store snapshot을 관리한다.
- `ChatSharedWorkerRuntime`이 Worker 안에서 기존 `createChatStompClient()`를 한 번만 생성한다.
- `ATTACH`, `DETACH`, `RECONNECT`, `CONNECTION_SNAPSHOT` 계약을 구현했다.
- 첫 port에서 STOMP를 활성화하고 마지막 port가 떨어질 때만 비활성화한다.
- 비활성화 도중 새 port가 연결되면 완료 후 STOMP를 다시 활성화한다.
- Worker 실행 오류에서는 Direct 연결을 추가하지 않으며 명시적인 reconnect만 허용한다.
- `4001 / CONNECTION_REPLACED`에서는 STOMP를 비활성화하고 모든 port에 terminal
  `replaced` 상태를 전달한다.
- SharedWorker 자체가 지원되지 않는 환경에서만 Direct fallback을 사용한다.
- 실제 두 탭에서 SharedWorker target 1개와 page 소유 채팅 WebSocket 0개를 확인했다.

### 3. 단일 활성 방 lease

진행 상태: 완료 (2026-07-29)

- `CLAIM_ROOM`, `RELEASE_ROOM`, `ROOM_ACTIVATED`, `ROOM_REPLACED`,
  `ROOM_RELEASED`, `ROOM_ACTIVATION_FAILED` 계약을 구현했다.
- Worker가 `roomId`, `ownerPortId`, `generation`으로 구성된 단일 lease를 관리한다.
- 같은 owner의 같은 방 claim은 generation을 유지하는 멱등 동작이다.
- 같은 방의 다른 owner claim은 lease 소유권만 교체하는 것으로 모델링했다.
- 다른 방 claim은 이전 owner에 `ROOM_REPLACED`를 보내고 새 lease를 선점한다.
- owner의 release 또는 detach는 lease를 해제하며, 오래된 owner의 release는 현재 lease에 영향을
  주지 않는다.
- `requestId`와 `generation`으로 탭 transport가 늦게 도착한 응답을 무시한다.
- SharedWorker 미지원 환경의 `DirectStompTransport`도 같은 방 세션 API를 제공한다.
- 연결 직후 `/user/queue/system-events`, `/user/queue/command-results`를 한 번씩 구독한다.
- 다른 방 전환은 기존 `/messages`, 기존 `/room-events`, 새 `/messages`, 새 `/room-events`
  순서로 각각 `UNSUBSCRIBE`, `UNSUBSCRIBE`, `SUBSCRIBE`, `SUBSCRIBE` frame을 보낸다.
- 같은 방 owner 교체에서는 기존 topic subscription을 재사용한다.
- WebSocket 재연결 후 공통 queue와 현재 lease의 방 topic만 복구한다.
- 서버의 구독 거절 system event를 감지하면 방 topic을 정리하고 owner 탭에
  `ROOM_SUBSCRIPTION_FAILED`를 전달한다.
- 확정된 구독 순서는 `ChatStompSubscriptionManager`에 한 번만 정의하며 SharedWorker와 Expo
  WebView의 Direct fallback이 동일하게 사용한다.
- STOMP message와 room-event payload 전달은 수정 API 명세 반영 단계에서 연결한다.

### 4. UX 연결

진행 상태: 완료 (2026-07-29)

- `다른 탭에서 채팅방을 사용 중입니다.` 안내를 추가한다.
- `이 탭에서 다시 활성화` 동작을 연결한다.
- 비활성 탭의 입력과 전송을 차단한다.
- `/chat/[roomId]` 진입과 이탈을 `CLAIM_ROOM`, `RELEASE_ROOM`에 연결한다.
- bfcache `pageshow`에서는 transport 재연결 이후 현재 방을 다시 claim한다.
- 메시지 전송 버튼은 5단계 payload 연동 전까지 별도로 비활성화한다.

### 5. 수정 API 명세 반영

- Worker event payload 런타임 스키마를 작성한다.
- message 및 room event를 active owner에게 전달한다.
- command result와 system event correlation을 구현한다.
- 메시지 이력과 `roomSequence` 기반 재동기화를 구현한다.
- TanStack Query cache 반영 정책을 구현한다.

## 테스트 전략

### 단위 테스트

- Worker command/event runtime validation
- 첫 port attach에서 STOMP 연결 한 번 생성
- 추가 port attach에서 연결을 추가하지 않음
- 마지막 port detach에서 연결 종료
- 다른 방 claim 시 이전 subscription 해제
- 같은 방 owner 교체 시 subscription 유지
- 이전 owner에게 `ROOM_REPLACED` 전달
- stale generation event 무시
- 이전 owner의 `SEND_MESSAGE` 로컬 거절
- 재연결 후 user queue 및 active room 재구독
- `AUTH_CHANGED` 후 handshake 재생성

### 브라우저 통합 테스트

```text
탭 A room-01 진입
  → WebSocket 1개
  → room-01 active

탭 B room-02 진입
  → 여전히 WebSocket 1개
  → room-01 unsubscribe
  → room-02 subscribe
  → 탭 A ROOM_REPLACED UI

탭 A "이 탭에서 다시 활성화"
  → 여전히 WebSocket 1개
  → room-02 unsubscribe
  → room-01 subscribe
  → 탭 B ROOM_REPLACED UI
```

추가 확인:

- 탭 하나를 닫아도 다른 탭의 WebSocket 유지
- 마지막 탭을 닫으면 연결 종료
- Worker 재시작 후 snapshot 복구
- 서버 재시작 후 자동 재연결
- 인증 쿠키 만료 및 갱신
- Expo WebView Direct fallback

## 백엔드와 추가로 확정할 계약

다음 항목은 프론트 정책만으로 확정할 수 없다.

2026-07-29에 백엔드는 프론트의 선점 전환 및 같은 방 owner 교체 정책이 서버 제한과
호환됨을 확인했다. 실제 다른 방 전환 순서는 아래 계약을 사용한다.

```text
1. 기존 방 /messages UNSUBSCRIBE
2. 기존 방 /room-events UNSUBSCRIBE
3. 새 방 /messages SUBSCRIBE
4. 새 방 /room-events SUBSCRIBE
```

사용자 공통 `/user/queue/command-results`, `/user/queue/system-events` 구독은 이 전환 중에도
유지한다. 백엔드는 같은 WebSocket session의 STOMP frame을 수신 순서대로 처리하며, 위 순서에는
별도 receipt 대기가 필요하지 않음을 최종 확인했다.

구독 준비는 Native STOMP receipt가 아니라 애플리케이션 수준 barrier로 확인한다.

```text
방 topic SUBSCRIBE
  → SEND /app/rooms/{roomId}/subscriptions/sync (sync requestId)
  → /user/queue/system-events의 ROOM_SUBSCRIPTIONS_READY
  → room session active
```

- Worker가 sync 요청별 UUID를 생성하고 현재 `roomId`, lease `generation`, owner port와 함께
  보관한다.
- READY의 `requestId`와 `roomId`가 현재 sync와 모두 일치할 때만 `ROOM_ACTIVATED`를 owner
  탭으로 전달한다.
- `watermarkSequence`는 room session snapshot에 보관해 다음 이력 복구 단계가 사용한다.
- 늦게 도착한 이전 READY 및 sync 거절은 현재 lease를 변경하지 않는다.
- sync 거절은 topic과 lease를 유지한 채 재시도 가능 여부를 오류 상태에 보존한다. 사용자가
  다시 활성화하면 새 sync UUID로 sync 요청만 다시 보낸다.
- WebSocket 재연결 후에도 공통 queue와 방 topic을 다시 구독한 다음 같은 barrier를 반복한다.
- SharedWorker를 사용할 수 없는 Direct fallback도 동일한 상태 전이와 correlation을 사용한다.

### 실시간 이벤트 버퍼

Worker는 방 topic의 `SUBSCRIBE` frame을 보내기 전에 현재 `roomId`와 lease `generation` 전용
버퍼를 시작한다. `ROOM_SUBSCRIPTIONS_READY`를 받더라도 REST snapshot 적용이 아직 끝나지
않았으므로 버퍼를 유지한다.

```text
buffer begin
  → /messages SUBSCRIBE
  → /room-events SUBSCRIBE
  → sync SEND
  → READY
  → REST snapshot 적용 완료 전까지 계속 buffer
  → ROOM_SNAPSHOT_APPLIED
  → ROOM_EVENTS_DELIVERED
  → 탭 cache 적용
  → ROOM_EVENTS_APPLIED
```

- `/topic/rooms/{roomId}/messages`의 `CHAT_MESSAGE_CREATED`와 방 topic의 Room Event를 런타임
  스키마로 검증한 뒤 하나의 도착 순서로 보관한다.
- 사용자 대상 Room Event가 `/user/queue/system-events`로 전달되는 경우에도 같은 버퍼에
  합친다.
- 각 항목에는 Worker 내부 `bufferSequence`를 부여해 서로 다른 destination에서 도착한 순서를
  잃지 않는다.
- 현재 방 또는 generation과 다른 callback은 stale event로 보고 버퍼에 넣지 않는다.
- 방 전환과 owner 교체에서는 새 generation 버퍼를 만들고 이전 버퍼를 폐기한다.
- WebSocket 재연결에서는 room topic 재구독 전에 버퍼링 상태를 다시 확인한다. 같은 방과
  generation이면 연결이 끊기기 전에 받아둔 이벤트를 유지하고, REST `afterSequence` 결과와
  함께 중복 제거할 수 있게 한다.
- release, owner port detach, 구독 설정 실패, 구독 거절 및 `CONNECTION_REPLACED`에서는 버퍼를
  폐기한다. sync 거절에서는 topic과 lease를 유지하므로 버퍼도 유지한다.
- 기본 최대 500개를 보관한다. 용량을 넘으면 가장 오래된 항목을 제거하고 `overflowed=true`를
  남겨 다음 REST 병합 단계가 누락 복구를 수행할 수 있게 한다.
- 스키마가 잘못된 방 topic payload는 정상 이벤트로 보관하지 않고 `invalidEventCount`에
  기록한다.
- SharedWorker 미지원 환경의 Direct fallback도 같은 버퍼 구현을 사용한다.

### Worker–탭 REST 적용 handshake

`ROOM_ACTIVATED`는 구독 준비 완료를 뜻하지만 REST snapshot이 TanStack Query cache에 반영된
상태까지 뜻하지는 않는다. 탭은 REST snapshot 적용을 마친 뒤 현재 `roomId`와 `generation`으로
`markRoomSnapshotApplied`를 호출한다.

SharedWorker transport에서는 다음 protocol로 변환한다.

```text
탭 → Worker  ROOM_SNAPSHOT_APPLIED
Worker → 탭  ROOM_EVENTS_DELIVERED
탭 → Worker  ROOM_EVENTS_APPLIED
```

- Worker는 현재 owner port, 활성 room lease, generation과 READY 상태가 모두 일치할 때만
  `ROOM_SNAPSHOT_APPLIED`를 받는다.
- 동시에 하나의 delivery만 전송한다. 탭의 확인을 기다리는 동안 들어온 이벤트는 같은 버퍼에
  계속 쌓고 다음 delivery로 보낸다.
- delivery에는 `deliveryId`, `throughBufferSequence`, `overflowed`, `invalidEventCount`가
  포함된다.
- `ROOM_EVENTS_APPLIED`는 해당 delivery의 `throughBufferSequence`까지만 제거한다. delivery
  이후 도착한 더 큰 sequence의 이벤트는 제거하지 않는다.
- stale `deliveryId`, 다른 owner port, room 또는 generation의 확인은 무시한다.
- 최초 delivery는 이벤트가 없어도 전송한다. 이 왕복이 끝나면 탭과 Worker가 같은
  generation에서 snapshot 이후 실시간 전달 단계로 전환했음을 확인할 수 있다.
- 첫 delivery 확인 뒤에는 새 이벤트가 생길 때마다 같은 단일 in-flight 규칙으로 후속 delivery를
  전송한다.
- reconnect의 `ROOM_SYNCING`, 방 전환, release, owner 교체와 terminal 오류에서는 진행 중
  delivery를 폐기한다. 버퍼 자체의 유지·폐기는 앞 절의 생명주기 정책을 따른다.
- Direct fallback도 transport API 수준에서 동일한 snapshot-applied → delivery → acknowledge
  흐름을 제공한다.

다음 계약은 여전히 백엔드 또는 후속 프론트 단계의 확인이 필요하다.

- `4001 / CONNECTION_REPLACED` 외 WebSocket handshake 인증 실패의 close code와 reason
- 비재시도 인증 오류와 일시적 인프라 오류 구분
- reconnect 복구 API의 최종 endpoint와 pagination
- `roomSequence` 누락 범위 처리
- 구독 거절 event와 `CLAIM_ROOM requestId` correlation 가능 여부
- message 및 room event 최종 payload

현재 Worker 생성, 단일 연결, 포트 관리, 단일 활성 방 lease, UX 소유권 전환, 구독 준비
barrier, 실시간 이벤트 버퍼, Worker–탭 REST snapshot 적용 handshake와 TanStack Query
coordinator까지 구현되어 있다. coordinator는 메시지 cache와 Room Event journal을 모두
갱신한 뒤에만 delivery를 ACK한다. 다음 단계에서는 이 coordinator를 채팅방 임시 화면의 실제
REST query에 연결하고, 이후 `afterSequence` 복구와 Room Event cache 반영을 확장한다.

## 관련 코드와 문서

- `apps/web/lib/chat/chat-stomp-client.ts`
- `apps/web/lib/chat/realtime/chat-realtime-event-buffer.ts`
- `apps/web/lib/chat/realtime/chat-realtime-transport.ts`
- `apps/web/lib/chat/realtime/direct-stomp-transport.ts`
- `apps/web/lib/chat/realtime/create-chat-realtime-transport.ts`
- `apps/web/components/chat-realtime-provider.tsx`
- `apps/web/components/chat-connection-status.tsx`
- `docs/contracts/platform-auth.md`
- `docs/architecture/react-component-tree.md`
