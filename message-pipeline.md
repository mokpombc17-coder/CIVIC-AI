# 메시지 저장·전파 파이프라인 1단계 구현 설계

## 1. 문서 목적

본 단계는 외부 브로커와 MongoDB를 사용하지 않고, 단일 WebSocket 서버 내부에서 다음 메시지 사이클을 실제로 연결하는 것을 목적으로 한다.

```text
메시지 수신
→ 내부 queue 접수
→ worker 처리
→ 메시지 저장
→ 메시지 전파
→ 최종 처리 결과 전송
```

메시지 처리 순서는 다음과 같이 고정한다.

```text
메시지 저장 완료
→ 메시지 전파 시도
```

저장되지 않은 메시지는 전파하지 않는다.

본 단계에서 메시지는 `InMemoryChatMessageStore`에 저장한다. 이후 MongoDB를 도입할 때 내부 queue와 worker는 유지하고, 저장소 구현체만 `MongoChatMessageStore`로 교체한다.

---

## 2. 설계 전제

| 항목 | 결정 |
|---|---|
| WebSocket 서버 | 단일 인스턴스 |
| 외부 메시지 브로커 | 사용하지 않음 |
| 실시간 전파 | Spring Simple Broker |
| 메시지 처리 queue | JVM 내부 bounded queue |
| queue 용량 | 100건 |
| worker 수 | 1개 |
| worker lifecycle | `SmartLifecycle` |
| 메시지 저장소 | `InMemoryChatMessageStore` |
| 메시지 처리 순서 | 수신 → 저장 → 전파 |
| 미처리 queue 내구성 | 보장하지 않음 |
| 서버 재시작 시 미처리 명령 | 유실 허용 |
| 유실 복구 | 클라이언트가 동일 `clientMessageId`로 재시도 |
| idempotency key | `roomId + senderUserId + clientMessageId` |
| 동일 key와 동일 정규화 본문 | `DUPLICATE`로 처리 |
| 동일 key와 다른 정규화 본문 | `IDEMPOTENCY_CONFLICT`로 처리 |
| 중복 메시지 재전파 | 하지 않음 |
| worker 병렬 처리 | 본 단계에서 사용하지 않음 |
| pipeline 실행 모드 | `limit-test` 프로필에서 `recording`, `in-memory` 선택 |
| 외부 메시지 계약 | versioned event envelope |
| MongoDB | 본 단계 범위에서 제외 |

---

## 3. Queue와 Store의 구분

`InMemoryChatMessagePipeline`과 `InMemoryChatMessageStore`는 서로 다른 책임을 가진다.

### 3.1 InMemoryChatMessagePipeline

아직 저장되지 않은 메시지 명령을 worker가 처리할 때까지 queue에 보관한다.

```text
보관 대상:
AdmittedChatCommand

보관 기간:
queue 등록 시점부터 worker가 꺼내는 시점까지
```

worker가 queue에서 명령을 꺼내면 해당 명령은 queue에서 제거된다.

### 3.2 InMemoryChatMessageStore

worker가 처리하여 `messageId`, `roomSequence`, `createdAt`이 확정된 메시지를 보관한다.

```text
보관 대상:
ChatMessage

보관 기간:
애플리케이션 종료 시점까지
```

### 3.3 처리 시점별 상태

```text
1. 클라이언트 메시지 수신 직후

queue:
- AdmittedChatCommand

store:
- 없음


2. worker가 queue에서 명령을 꺼낸 직후

queue:
- 없음

store:
- 없음


3. InMemoryChatMessageStore 저장 완료 후

queue:
- 없음

store:
- ChatMessage


4. 저장된 ChatMessage를 room topic으로 전파
```

MongoDB를 도입한 후에도 queue와 worker는 유지된다.

```diff
메시지 수신
→ InMemoryChatMessagePipeline
→ worker
- → InMemoryChatMessageStore
+ → MongoChatMessageStore
→ 메시지 전파
```

---

## 4. 전체 처리 구조

```text
STOMP SEND
/app/rooms/{roomId}/messages
        │
        ▼
ChatCommandController
        │
        ▼
ChatCommandService
        │
        ├─ 활성 connection 확인
        ├─ clientMessageId 검증
        ├─ content 검증 및 정규화
        ├─ 방 메시지 전송 권한 확인
        ├─ pipeline availability 확인
        ├─ rate limit reservation 획득
        └─ ChatMessagePipeline.tryAccept()
                │
                ├─ queue 등록 성공
                │    ├─ ACCEPTED_FOR_PROCESSING 반환
                │    └─ rate limit reservation commit
                │
                ├─ queue full
                │    ├─ BUSY 반환
                │    ├─ rate limit reservation rollback
                │    └─ SERVER_BUSY 결과 전송
                │
                └─ worker 미실행 또는 종료 중
                     ├─ UNAVAILABLE 반환
                     ├─ rate limit reservation rollback
                     └─ CHAT_PIPELINE_UNAVAILABLE 결과 전송
                             │
                             ▼
ArrayBlockingQueue<QueuedChatCommand>
                             │
                             ▼
ChatMessageWorker
                             │
                             ▼
ChatMessageProcessor
        │
        └─ ChatMessageStore.append()
                │
                ├─ STORED
                │    ├─ room topic 전파 시도
                │    └─ ACCEPTED 결과 전송
                │
                ├─ DUPLICATE
                │    ├─ room topic 재전파 안 함
                │    └─ DUPLICATE 결과 전송
                │
                └─ 저장 실패
                     ├─ room topic 전파 안 함
                     └─ PERSISTENCE_FAILED 결과 전송
```

---

## 5. 구성요소 책임

### 5.1 ChatCommandService

기존 WebSocket 명령 수신 경계를 유지한다.

책임:

- 활성 WebSocket connection 확인
- `clientMessageId` 검증
- 메시지 본문 검증 및 정규화
- 방 전송 권한 확인
- pipeline 가용성 확인
- rate limit reservation 관리
- `AdmittedChatCommand` 생성
- pipeline 접수 결과에 따른 즉시 거절 또는 실패 응답

`ChatCommandService`는 다음 작업을 수행하지 않는다.

- `messageId` 생성
- `roomSequence` 생성
- 메시지 저장
- 방 메시지 전파
- 최종 `ACCEPTED` 또는 `DUPLICATE` 전송

`ACCEPTED_FOR_PROCESSING`은 queue 접수 성공을 의미하며 최종 메시지 저장 성공을 의미하지 않는다.

---

### 5.2 InMemoryChatMessagePipeline

`ChatMessagePipeline`의 실제 인메모리 구현체다.

책임:

- 용량 100의 bounded queue 소유
- `AdmittedChatCommand`를 `QueuedChatCommand`로 변환
- non-blocking `queue.offer()` 수행
- worker 실행 상태 관리
- pipeline availability 제공
- `SmartLifecycle`을 통한 worker 시작 및 종료
- 종료 시 신규 명령 접수 차단
- 종료 시 queue best-effort drain

내부 queue는 다음과 같이 생성한다.

```java
new ArrayBlockingQueue<QueuedChatCommand>(100);
```

명령 등록에는 blocking `put()`을 사용하지 않는다.

```java
boolean accepted = queue.offer(queuedCommand);
```

반환 규칙:

| 조건 | `PipelineAcceptance` |
|---|---|
| worker 실행 중이며 queue 등록 성공 | `ACCEPTED_FOR_PROCESSING` |
| worker 실행 중이지만 queue full | `BUSY` |
| worker 시작 전 | `UNAVAILABLE` |
| worker 종료 중 | `UNAVAILABLE` |
| worker 종료 후 | `UNAVAILABLE` |
| worker 비정상 종료 | `UNAVAILABLE` |

queue가 가득 찬 상태는 pipeline 장애가 아니므로 `UNAVAILABLE`이 아니라 `BUSY`로 반환한다.

---

### 5.3 QueuedChatCommand

queue 대기 시간을 측정하기 위한 내부 envelope다.

```java
public record QueuedChatCommand(
        AdmittedChatCommand command,
        long enqueuedAtNanos
) {
}
```

`enqueuedAtNanos`는 queue 대기 시간 측정에만 사용한다.

영속 메시지 모델에는 포함하지 않는다.

---

### 5.4 ChatMessageWorker

내부 queue를 소비하는 단일 worker다.

책임:

- queue에서 `QueuedChatCommand` 소비
- `ChatMessageProcessor.process()` 호출
- 개별 명령 처리 예외 격리
- worker 종료 상태 전달
- shutdown 중 queue drain

worker 수는 1개로 고정한다.

본 단계에서는 worker 수를 설정값으로 노출하지 않는다.

```text
queue 1개
worker 1개
```

단일 worker는 queue 접수 순서에 따라 다음 호출 순서를 유지한다.

```text
명령 A 저장 → 명령 A 전파 시도
명령 B 저장 → 명령 B 전파 시도
명령 C 저장 → 명령 C 전파 시도
```

클라이언트의 최종 정렬 기준은 `roomSequence`로 한다.

worker loop의 개념적 구조는 다음과 같다.

```java
while (acceptingCommands || !queue.isEmpty()) {
    QueuedChatCommand queued =
            queue.poll(POLL_TIMEOUT, TimeUnit.MILLISECONDS);

    if (queued == null) {
        continue;
    }

    try {
        processor.process(queued);
    } catch (RuntimeException exception) {
        // 로그와 메트릭을 기록한다.
        // 개별 메시지 실패로 worker loop를 종료하지 않는다.
    }
}
```

하나의 명령 처리 중 예외가 발생해도 다음 명령을 계속 처리해야 한다.

worker loop 자체가 예상하지 못하게 종료된 경우 pipeline 상태를 `FAILED`로 변경하고 `availability()`는 `UNAVAILABLE`을 반환한다.

---

### 5.5 ChatMessageProcessor

메시지 저장 결과에 따라 전파와 command result를 결정하는 orchestration 구성요소다.

책임:

- `AdmittedChatCommand`를 저장 입력 모델로 변환
- `ChatMessageStore.append()` 호출
- 신규 저장 메시지 전파
- 중복 메시지 재전파 방지
- 최종 command result 전송
- 저장 실패와 전파 실패의 의미 분리

처리 의사 코드는 다음과 같다.

```java
public void process(QueuedChatCommand queued) {
    AdmittedChatCommand command = queued.command();

    try {
        StoreChatMessageResult result =
                messageStore.append(NewChatMessage.from(command));

        switch (result) {
            case StoredChatMessage stored -> {
                broadcastBestEffort(stored.message());

                resultSender.send(
                        command.userId(),
                        command.connectionId(),
                        new ChatCommandOutcome(
                                command.clientMessageId(),
                                ChatCommandOutcomeCode.ACCEPTED,
                                stored.message().messageId(),
                                stored.message().roomSequence()));
            }

            case DuplicateChatMessage duplicate -> {
                resultSender.send(
                        command.userId(),
                        command.connectionId(),
                        new ChatCommandOutcome(
                                command.clientMessageId(),
                                ChatCommandOutcomeCode.DUPLICATE,
                                duplicate.message().messageId(),
                                duplicate.message().roomSequence()));
            }

            case ConflictingChatMessage conflict -> {
                resultSender.send(
                        command.userId(),
                        command.connectionId(),
                        new ChatCommandRejected(
                                command.clientMessageId(),
                                ChatCommandRejectedCode.IDEMPOTENCY_CONFLICT,
                                false,
                                null));
            }
        }
    } catch (ChatMessageStoreException exception) {
        resultSender.send(
                command.userId(),
                command.connectionId(),
                new ChatCommandFailed(
                        command.clientMessageId(),
                        ChatCommandFailedCode.PERSISTENCE_FAILED,
                        true,
                        null));
    }
}
```

실제 구현에서는 `resultSender.send()`와 broadcast 예외도 worker loop 밖으로 전파되지 않도록 격리한다.

---

### 5.6 ChatMessageStore

처리 완료 메시지 저장을 추상화한다.

```java
public interface ChatMessageStore {

    StoreChatMessageResult append(NewChatMessage message);
}
```

`append()`는 다음 작업을 하나의 저장 연산으로 취급한다.

```text
idempotency key 확인
→ roomSequence 할당
→ messageId 생성
→ createdAt 생성
→ ChatMessage 저장
→ 저장 결과 반환
```

`ChatMessageProcessor`가 다음 작업을 개별 호출로 분리하지 않는다.

```text
중복 조회
roomSequence 할당
메시지 저장
```

해당 책임은 `ChatMessageStore.append()` 내부에 둔다.

이를 통해 MongoDB 도입 시 processor와 worker를 변경하지 않고 저장소 구현체만 교체한다.

---

### 5.7 InMemoryChatMessageStore

`ChatMessageStore`의 1단계 구현체다.

책임:

- 저장된 메시지 보관
- idempotency key 기반 중복 확인
- 방별 `roomSequence` 할당
- 서버 `messageId` 생성
- 서버 `createdAt` 생성
- 기존 메시지 반환

내부 상태 예시는 다음과 같다.

```java
Map<IdempotencyKey, ChatMessage> messagesByIdempotencyKey;
Map<String, Long> lastSequenceByRoom;
Map<String, NavigableMap<Long, ChatMessage>> messagesByRoom;
```

저장 연산은 `ReentrantLock` 등 하나의 임계 구역에서 수행한다.

```text
lock 획득
→ idempotency key 조회
→ 기존 메시지가 있으면 DUPLICATE 반환
→ 해당 방의 다음 roomSequence 계산
→ messageId 생성
→ createdAt 생성
→ ChatMessage 저장
→ 마지막 roomSequence 갱신
→ STORED 반환
→ lock 해제
```

본 단계는 worker가 1개이지만 저장 계약의 원자성을 명확히 하기 위해 store 내부에서도 `append()` 연산을 동기화한다.

---

### 5.8 ChatMessagePublisher

저장된 메시지를 room topic으로 전파한다.

전파 destination:

```text
/topic/rooms/{roomId}/messages
```

책임:

- `ChatMessage`를 versioned 외부 이벤트 계약으로 변환
- `SimpMessagingTemplate`을 통한 room topic 전파
- 전파 실패 로그 및 메트릭 기록

저장되지 않은 명령을 전파해서는 안 된다.

애플리케이션은 `SimpMessagingTemplate`에 직접 의존하지 않고 다음 port에 의존한다.

```java
public interface ChatMessagePublisher {
    void publish(ChatMessageEventEnvelope event);
}
```

현재 adapter는 `SimpleBrokerChatMessagePublisher`다. 후속 Outbox Pattern 도입 시 processor의 port는 유지하고 저장 구현과 relay를 교체한다.

외부 이벤트 계약은 내부 저장 모델과 분리한다.

```java
public record ChatMessageEventEnvelope(
        int eventVersion,
        String eventType,
        ChatMessagePayload payload
) {
}
```

```java
public record ChatMessagePayload(
        String messageId,
        String roomId,
        long roomSequence,
        String senderUserId,
        String clientMessageId,
        String content,
        Instant createdAt
) {
}
```

최초 계약은 `eventVersion = 1`, `eventType = CHAT_MESSAGE_CREATED`를 사용한다.

---

### 5.9 ChatCommandResultSender

명령을 보낸 연결에 최종 처리 결과를 보낸다.

destination:

```text
/user/queue/command-results
```

결과 종류:

```text
ACCEPTED
DUPLICATE
PERSISTENCE_FAILED
INTERNAL_ERROR
```

원래 명령의 `connectionId`를 응답 라우팅에 사용한다.

`connectionId`는 `ChatMessage`에 저장하지 않는다.

---

## 6. 메시지 모델

### 6.1 NewChatMessage

저장소에 전달하는 신규 메시지 입력 모델이다.

```java
public record NewChatMessage(
        String roomId,
        String senderUserId,
        String clientMessageId,
        String content
) {
    public static NewChatMessage from(AdmittedChatCommand command) {
        return new NewChatMessage(
                command.roomId(),
                command.userId(),
                command.clientMessageId(),
                command.content());
    }
}
```

`connectionId`는 저장 모델에 포함하지 않는다.

---

### 6.2 ChatMessage

저장 완료 메시지 모델이다.

```java
public record ChatMessage(
        String messageId,
        String roomId,
        long roomSequence,
        String senderUserId,
        String clientMessageId,
        String content,
        Instant createdAt
) {
}
```

필드 의미:

| 필드 | 생성 주체 | 설명 |
|---|---|---|
| `messageId` | 서버 | 메시지 식별자 |
| `roomId` | 클라이언트 요청 경로 | 메시지 소속 방 |
| `roomSequence` | 서버 저장소 | 방 안에서 증가하는 순번 |
| `senderUserId` | JWT principal | 작성자 식별자 |
| `clientMessageId` | 클라이언트 | 재시도 및 중복 판별 식별자 |
| `content` | 서버 검증 결과 | 정규화된 메시지 본문 |
| `createdAt` | 서버 저장소 | 저장이 확정된 시각 |

`messageId`는 UUID 문자열로 생성한다.

`createdAt`은 테스트 가능한 `Clock`을 주입하여 생성한다.

`roomSequence`는 방별로 1부터 시작한다.

---

## 7. 저장 결과 모델

```java
public sealed interface StoreChatMessageResult
        permits StoredChatMessage, DuplicateChatMessage {
}
```

### 7.1 StoredChatMessage

신규 메시지가 저장된 결과다.

```java
public record StoredChatMessage(
        ChatMessage message
) implements StoreChatMessageResult {
}
```

후속 처리:

```text
room topic 전파 시도
→ ACCEPTED 결과 전송
```

### 7.2 DuplicateChatMessage

동일한 idempotency key가 이미 저장된 결과다.

```java
public record DuplicateChatMessage(
        ChatMessage message
) implements StoreChatMessageResult {
}
```

후속 처리:

```text
room topic 재전파 안 함
→ 기존 messageId와 roomSequence로 DUPLICATE 결과 전송
```

### 7.3 ConflictingChatMessage

동일한 idempotency key가 이미 존재하지만 정규화된 본문이 다른 결과다.

```java
public record ConflictingChatMessage(
        ChatMessage existingMessage
) implements StoreChatMessageResult {
}
```

후속 처리:

```text
새 메시지 저장 안 함
→ 기존 메시지 변경 안 함
→ room topic 전파 안 함
→ retryable=false인 IDEMPOTENCY_CONFLICT 결과 전송
```

---

## 8. Idempotency 정책

idempotency key는 다음 세 필드로 구성한다.

```text
roomId
senderUserId
clientMessageId
```

개념적 타입:

```java
public record IdempotencyKey(
        String roomId,
        String senderUserId,
        String clientMessageId
) {
}
```

### 8.1 동일 key 재요청

다음 요청은 중복으로 처리한다.

```text
첫 번째 요청:
roomId = room-1
senderUserId = user-1
clientMessageId = client-1
content = "첫 번째 본문"

두 번째 요청:
roomId = room-1
senderUserId = user-1
clientMessageId = client-1
content = "첫 번째 본문"
```

결과:

```text
첫 번째 요청:
ACCEPTED

두 번째 요청:
DUPLICATE
```

### 8.2 동일 key와 다른 본문

동일한 idempotency key를 다른 정규화 본문에 사용하면 `IDEMPOTENCY_CONFLICT`로 처리한다.

```text
첫 번째 요청:
clientMessageId = client-1
content = "첫 번째 본문"

두 번째 요청:
clientMessageId = client-1
content = "변경된 본문"
```

결과:

```text
IDEMPOTENCY_CONFLICT 반환
```

두 번째 본문은 저장하지 않는다.

두 번째 본문은 전파하지 않는다.

본문 비교는 클라이언트 원문이 아니라 `ChatCommandValidator`가 검증하고 `strip()`을 적용한 정규화 본문을 기준으로 한다.

```text
동일 idempotency key + 동일 정규화 본문
→ DUPLICATE

동일 idempotency key + 다른 정규화 본문
→ IDEMPOTENCY_CONFLICT
```

---

## 9. 메시지 전파 규칙

### 9.1 신규 저장 성공

```text
메시지 저장 성공
→ room topic 전파 1회 시도
→ ACCEPTED 결과 전송
```

### 9.2 중복 요청

```text
기존 메시지 확인
→ room topic 전파하지 않음
→ DUPLICATE 결과 전송
```

중복 요청마다 메시지를 다시 전파하면 다른 참여자가 같은 메시지를 여러 번 받을 수 있으므로 재전파하지 않는다.

### 9.3 Idempotency 충돌

```text
기존 메시지 확인
→ 정규화 본문 불일치
→ 새 메시지 저장하지 않음
→ room topic 전파하지 않음
→ IDEMPOTENCY_CONFLICT 결과 전송
```

### 9.4 저장 실패

```text
메시지 저장 실패
→ room topic 전파하지 않음
→ PERSISTENCE_FAILED 결과 전송
```

### 9.5 전파 실패

```text
메시지 저장 성공
→ room topic 전파 실패
→ 저장된 메시지 유지
→ ACCEPTED 결과 전송 시도
→ 전파 실패 로그와 메트릭 기록
```

전파 실패는 저장 실패로 변환하지 않는다.

저장 성공 후 전파 실패가 발생하더라도 저장된 메시지를 제거하지 않는다.

---

## 10. Command result와 room message의 관계

신규 메시지가 저장되면 다음 두 출력이 발생한다.

```text
1. /topic/rooms/{roomId}/messages
2. /user/queue/command-results
```

processor의 호출 순서는 다음과 같이 고정한다.

```text
저장
→ room broadcast 시도
→ command result 전송
```

다만 클라이언트는 두 메시지의 실제 수신 순서에 의존하지 않는다.

두 payload에는 다음 식별자를 포함한다.

```text
messageId
roomSequence
clientMessageId
```

클라이언트는 해당 값을 기준으로 optimistic message, room message, command result를 결합한다.

---

## 11. Rate limit 처리 시점

rate limit reservation은 내부 queue 등록 성공 시 commit한다.

```text
queue.offer 성공
→ rate limit reservation commit

queue.offer 실패
→ rate limit reservation rollback

pipeline unavailable
→ rate limit reservation rollback
```

queue에 등록된 이후 저장 실패가 발생해도 이미 commit한 rate limit 사용량을 반환하지 않는다.

```text
queue 접수 성공
→ 서버가 처리 대상으로 받아들인 명령

저장 실패
→ 처리 결과 실패
→ 사용량 환불 없음
```

클라이언트가 재시도하면 새로운 요청으로 rate limit을 다시 적용한다.

---

## 12. Pipeline 상태

내부 상태는 다음과 같이 구분한다.

```java
public enum PipelineState {
    NEW,
    STARTING,
    RUNNING,
    STOPPING,
    STOPPED,
    FAILED
}
```

`availability()` 변환 규칙:

| `PipelineState` | `PipelineAvailability` |
|---|---|
| `RUNNING` | `AVAILABLE` |
| `NEW` | `UNAVAILABLE` |
| `STARTING` | `UNAVAILABLE` |
| `STOPPING` | `UNAVAILABLE` |
| `STOPPED` | `UNAVAILABLE` |
| `FAILED` | `UNAVAILABLE` |

queue full은 pipeline state를 변경하지 않는다.

```text
state = RUNNING
queue = full

→ availability = AVAILABLE
→ tryAccept = BUSY
```

---

## 13. SmartLifecycle

`InMemoryChatMessagePipeline`은 `SmartLifecycle`을 구현한다.

### 13.1 start()

시작 순서:

```text
1. 상태를 STARTING으로 변경
2. worker 전용 thread 시작
3. worker loop 시작 확인
4. 상태를 RUNNING으로 변경
```

worker가 시작되지 못하면 상태를 `FAILED`로 변경하고 애플리케이션 시작 실패로 처리한다.

`isAutoStartup()`은 `true`를 반환한다.

`isRunning()`은 상태가 `RUNNING`일 때만 `true`를 반환한다.

---

### 13.2 stop(Runnable callback)

종료 순서:

```text
1. 상태를 STOPPING으로 변경
2. 신규 명령 접수 차단
3. 현재 처리 중인 명령 완료 시도
4. queue에 남은 명령 best-effort drain
5. drain 제한 시간이 지나면 남은 명령 수 기록
6. worker thread 종료
7. 상태를 STOPPED로 변경
8. callback.run() 호출
```

초기 shutdown drain 제한 시간:

```text
10초
```

10초 안에 처리되지 않은 queue 명령은 유실을 허용한다.

종료 중 새로운 `tryAccept()` 호출에는 `UNAVAILABLE`을 반환한다.

강제 프로세스 종료, JVM 오류, 전원 종료에서는 graceful drain을 보장하지 않는다.

---

## 14. 서버 재시작과 queue 유실

외부 durable broker를 사용하지 않으므로 다음 구간의 명령은 서버 재시작 시 유실될 수 있다.

```text
queue 등록 완료
→ InMemoryChatMessageStore 저장 전
```

본 단계에서는 `InMemoryChatMessageStore`에 저장된 메시지도 서버 재시작 시 유실된다.

| 종료 시점 | 서버 내부 상태 | 재시도 처리 |
|---|---|---|
| queue 등록 전 | 저장되지 않음 | 신규 요청 |
| queue 등록 후, worker 처리 전 | 저장되지 않음 | 신규 요청 |
| worker 처리 중, 저장 전 | 저장되지 않음 | 신규 요청 |
| 인메모리 저장 후 | 저장 상태도 재시작 시 유실 | 신규 요청 |

1단계는 서버 재시작 내구성을 제공하는 단계가 아니라 메시지 처리 파이프라인의 경계와 순서를 검증하는 단계다.

MongoDB 도입 후에는 다음처럼 변경된다.

```text
queue에만 있던 명령:
재시작 시 유실 가능

MongoDB 저장 완료 메시지:
재시작 후 유지

클라이언트 동일 clientMessageId 재시도:
기존 메시지를 조회하여 DUPLICATE 반환
```

---

## 15. InMemoryChatMessageStore의 사용 범위

`InMemoryChatMessageStore`는 개발 및 파이프라인 검증용 구현체다.

자동 eviction은 구현하지 않는다.

자동 eviction을 적용하면 이전 `clientMessageId`에 대한 중복 판별 결과가 달라질 수 있기 때문이다.

따라서 메시지 수는 서버 실행 시간에 따라 증가한다.

이 구현체는 `limit-test` 프로필에서 `chat.message-pipeline.mode=in-memory`일 때만 활성화하고 운영 프로필에서는 활성화하지 않는다.

---

## 16. 설정

```yaml
chat:
  message-pipeline:
    mode: recording
    queue-capacity: 100
    shutdown-drain-timeout-ms: 10000
```

worker 수는 설정으로 노출하지 않고 1개로 고정한다.

`mode` 값:

```text
recording:
  기존 제한 테스트용 RecordingChatMessagePipeline

in-memory:
  실제 queue → worker → store → publish 파이프라인
```

기존 테스트는 `recording`을 기본값으로 사용하고 실제 로컬 통합 실행은 환경변수로 `in-memory`를 선택한다.

```shell
CHAT_MESSAGE_PIPELINE_MODE=in-memory \
SPRING_PROFILES_ACTIVE=limit-test \
./gradlew bootRun
```

설정 클래스 예시:

```java
@Validated
@ConfigurationProperties("chat.message-pipeline")
public class ChatMessagePipelineProperties {

    private Mode mode = Mode.RECORDING;

    @Min(1)
    private int queueCapacity = 100;

    @Min(1)
    private long shutdownDrainTimeoutMs = 10_000;

    public int getQueueCapacity() {
        return queueCapacity;
    }

    public void setQueueCapacity(int queueCapacity) {
        this.queueCapacity = queueCapacity;
    }

    public long getShutdownDrainTimeoutMs() {
        return shutdownDrainTimeoutMs;
    }

    public void setShutdownDrainTimeoutMs(long shutdownDrainTimeoutMs) {
        this.shutdownDrainTimeoutMs = shutdownDrainTimeoutMs;
    }
}
```

---

## 17. 프로필 구성

### 17.1 skeleton

```text
UnavailableRoomAuthorizationService
UnavailableChatMessagePipeline
```

목적:

- 실제 인가와 pipeline이 없는 상태 확인
- readiness 실패 확인

### 17.2 limit-test

`AllowListRoomAuthorizationService`와 임시 HS256 JWT 검증기를 공통으로 사용한다.

pipeline은 `chat.message-pipeline.mode`로 선택한다.

```text
mode=recording:
  RecordingChatMessagePipeline
  기존 connection, subscription, rate limit 테스트 유지

mode=in-memory:
  InMemoryChatMessagePipeline
  ChatMessageWorker
  ChatMessageProcessor
  InMemoryChatMessageStore
  SimpleBrokerChatMessagePublisher
  실제 queue → worker → 저장 → 전파 사이클 검증
```

두 pipeline 구현은 `@ConditionalOnProperty`로 상호 배타적으로 등록한다.

임시 JWT는 외부 웹사이트가 아니라 저장소의 로컬 생성기를 사용한다.

```shell
./scripts/generate-local-jwt.py local-user-1
```

JWT는 `HS256`으로 서명하고 `sub`, `iss`, `aud`, `iat`, `exp`를 포함한다. 서버는 서명, 만료, issuer, audience를 모두 검증한다.

### 17.3 prod

본 단계에서는 실제 운영 저장소가 없으므로 기존 fail-closed 상태를 유지한다.

`limit-test`의 임시 JWT, allow-list authorization, 인메모리 pipeline은 운영 프로필에서 활성화하지 않는다.

---

## 18. 권장 패키지 구조

```text
com.hamcheeze.chat
├─ application
│  ├─ ChatCommandService
│  ├─ ChatCommandResultSender
│  └─ ChatMessageProcessor
│
├─ pipeline
│  ├─ ChatMessagePipeline
│  ├─ InMemoryChatMessagePipeline
│  ├─ ChatMessageWorker
│  ├─ QueuedChatCommand
│  ├─ PipelineAcceptance
│  ├─ PipelineAvailability
│  └─ PipelineState
│
├─ message
│  ├─ ChatMessage
│  ├─ NewChatMessage
│  ├─ IdempotencyKey
│  ├─ ChatMessageStore
│  ├─ StoreChatMessageResult
│  ├─ StoredChatMessage
│  ├─ DuplicateChatMessage
│  ├─ ConflictingChatMessage
│  └─ ChatMessageStoreException
│
├─ message.inmemory
│  └─ InMemoryChatMessageStore
│
└─ delivery
   ├─ ChatMessagePublisher
   ├─ SimpleBrokerChatMessagePublisher
   ├─ ChatMessageEventEnvelope
   └─ ChatMessagePayload
```

---

## 19. 메트릭

최소 메트릭은 다음과 같이 구성한다.

### 19.1 Queue

```text
chat.pipeline.queue.size
chat.pipeline.queue.capacity
chat.pipeline.queue.wait
```

### 19.2 Pipeline 접수

```text
chat.pipeline.accepted
chat.pipeline.busy
chat.pipeline.unavailable
```

### 19.3 Worker

```text
chat.pipeline.worker.running
chat.pipeline.processing
chat.pipeline.processing.failures
```

### 19.4 Store

```text
chat.message.store.stored
chat.message.store.duplicate
chat.message.store.conflicts
chat.message.store.failures
chat.message.store.current_size
```

### 19.5 Broadcast

```text
chat.message.broadcast.success
chat.message.broadcast.failures
```

메트릭에는 `roomId`, `userId`, `connectionId`, `clientMessageId`를 tag로 사용하지 않는다.

해당 값들은 cardinality가 지속적으로 증가할 수 있으므로 메트릭 tag가 아니라 필요한 경우 로그 필드로 사용한다.

---

## 20. 로그

### 20.1 Queue full

```text
level: WARN

fields:
- connectionId
- roomId
- clientMessageId
- queueSize
- queueCapacity
```

### 20.2 저장 실패

```text
level: ERROR

fields:
- userId
- connectionId
- roomId
- clientMessageId
- exception
```

### 20.3 전파 실패

```text
level: ERROR

fields:
- messageId
- roomId
- roomSequence
- clientMessageId
- exception
```

### 20.4 Worker 비정상 종료

```text
level: ERROR

fields:
- pipelineState
- queueSize
- currentlyProcessing
- exception
```

메시지 본문 전체는 기본 로그에 기록하지 않는다.

---

## 21. 실패 처리 표

| 실패 지점 | 저장 여부 | 전파 여부 | 클라이언트 결과 | rate limit 반환 |
|---|---:|---:|---|---:|
| 유효성 검증 실패 | 아니오 | 아니오 | 해당 `REJECTED` | reservation 전 |
| 방 전송 권한 거절 | 아니오 | 아니오 | `ROOM_SEND_FORBIDDEN` | reservation 전 |
| pipeline unavailable | 아니오 | 아니오 | `CHAT_PIPELINE_UNAVAILABLE` | 예 |
| queue full | 아니오 | 아니오 | `SERVER_BUSY` | 예 |
| queue 접수 성공 | 아직 아님 | 아직 아님 | 즉시 결과 없음 | 아니오 |
| 인메모리 저장 실패 | 아니오 | 아니오 | `PERSISTENCE_FAILED` | 아니오 |
| 중복 요청 | 기존 저장 있음 | 재전파 안 함 | `DUPLICATE` | 아니오 |
| idempotency 충돌 | 기존 저장 있음 | 재전파 안 함 | `IDEMPOTENCY_CONFLICT` | 아니오 |
| 신규 저장 성공 | 예 | 1회 시도 | `ACCEPTED` | 아니오 |
| 저장 후 전파 실패 | 예 | 실패 | `ACCEPTED` 전송 시도 | 아니오 |
| command result 전송 실패 | 저장 결과에 따름 | 기존 규칙 적용 | 결과 유실 가능 | 아니오 |
| 서버 강제 종료 | 미확정 | 미확정 | 결과 유실 가능 | 해당 없음 |

---

## 22. 테스트 범위

### 22.1 InMemoryChatMessageStore 단위 테스트

#### 신규 메시지 저장

```text
동일 방의 첫 메시지
→ roomSequence = 1
→ STORED
```

#### 방별 순번 증가

```text
room-1 메시지 A
room-1 메시지 B
room-2 메시지 C

결과:
room-1/A = 1
room-1/B = 2
room-2/C = 1
```

#### 동일 본문 중복

```text
동일 roomId
동일 senderUserId
동일 clientMessageId
동일 content

→ 두 번째 append는 DUPLICATE
→ 저장 메시지 수 증가 없음
```

#### 다른 본문 중복

```text
동일 roomId
동일 senderUserId
동일 clientMessageId
다른 content

→ 두 번째 append는 DUPLICATE
→ 첫 번째 메시지 반환
→ 저장 메시지 수 증가 없음
```

---

### 22.2 ChatMessageProcessor 단위 테스트

#### 신규 저장 성공

```text
store = STORED

검증:
- broadcast 1회
- ACCEPTED 1회
- messageId와 roomSequence 전달
```

#### 중복

```text
store = DUPLICATE

검증:
- broadcast 없음
- DUPLICATE 1회
- 기존 messageId와 roomSequence 전달
```

#### 저장 실패

```text
store throws ChatMessageStoreException

검증:
- broadcast 없음
- PERSISTENCE_FAILED 1회
```

#### 전파 실패

```text
store = STORED
broadcaster throws exception

검증:
- 저장 결과 유지
- worker 종료 안 됨
- ACCEPTED 전송 시도
- broadcast failure metric 증가
```

#### command result 전송 실패

```text
resultSender throws exception

검증:
- worker 종료 안 됨
- 다음 queue 메시지 처리 계속
```

---

### 22.3 InMemoryChatMessagePipeline 단위 테스트

#### queue 접수 성공

```text
state = RUNNING
queue has capacity

→ ACCEPTED_FOR_PROCESSING
```

#### queue full

```text
queue size = 100

→ 추가 offer는 BUSY
```

worker가 하나의 메시지를 처리 중인 경우 전체 미완료 메시지 수는 다음처럼 보일 수 있다.

```text
처리 중 1건
queue 대기 100건
```

`queue-capacity`는 대기 가능한 queue 항목 수를 의미하며 처리 중인 항목은 포함하지 않는다.

#### 시작 전

```text
state = NEW

→ UNAVAILABLE
```

#### 종료 중

```text
state = STOPPING

→ UNAVAILABLE
```

#### worker 실패

```text
state = FAILED

→ UNAVAILABLE
```

---

### 22.4 Worker 테스트

#### queue 소비

```text
queue에 명령 추가
→ worker가 processor 호출
```

#### 순서 보존

```text
A, B, C 순서로 queue 등록
→ processor 호출 순서 A, B, C
```

#### 개별 처리 실패 격리

```text
A 처리 중 RuntimeException
B 처리 정상

→ worker가 B까지 처리
```

#### 종료 drain

```text
queue에 처리 가능한 명령 존재
→ stop 호출
→ 신규 접수 차단
→ 제한 시간 내 queue 처리
→ callback 호출
```

#### drain timeout

```text
processor가 제한 시간보다 오래 block
→ 남은 queue 수 기록
→ worker 종료 시도
→ callback 호출
```

---

### 22.5 통합 테스트

#### 신규 메시지 전체 사이클

```text
STOMP SEND
→ queue 접수
→ worker 처리
→ InMemoryChatMessageStore 저장
→ room topic 메시지 수신
→ ACCEPTED command result 수신
```

검증:

```text
messageId 존재
roomSequence 존재
clientMessageId 일치
본문 정규화 결과 일치
store 저장 메시지 수 = 1
```

#### 중복 재시도

```text
동일 clientMessageId로 두 번 SEND
```

검증:

```text
첫 번째 결과 = ACCEPTED
두 번째 결과 = DUPLICATE
store 저장 메시지 수 = 1
room broadcast 횟수 = 1
두 결과의 messageId 동일
두 결과의 roomSequence 동일
```

#### 다른 본문으로 동일 clientMessageId 재시도

```text
첫 요청 content = A
두 번째 요청 content = B
clientMessageId 동일
```

검증:

```text
첫 번째 결과 = ACCEPTED
두 번째 결과 = IDEMPOTENCY_CONFLICT
저장된 content = A
content B는 저장되지 않음
room broadcast 횟수 = 1
```

#### Queue full

processor를 의도적으로 block한 상태에서 queue를 채운다.

검증:

```text
queue capacity 초과 명령
→ SERVER_BUSY
→ rate limit reservation rollback
```

---

## 23. 완료 조건

다음 조건을 모두 충족하면 1단계 구현을 완료한 것으로 본다.

- `InMemoryChatMessagePipeline`이 용량 100의 bounded queue를 사용한다.
- queue 등록은 non-blocking `offer()`를 사용한다.
- worker는 1개만 실행된다.
- worker는 `SmartLifecycle`을 통해 시작·종료된다.
- worker가 queue에서 실제로 명령을 소비한다.
- 저장 전에는 메시지를 전파하지 않는다.
- 신규 메시지는 저장 후 1회 전파한다.
- 신규 메시지에 `messageId`와 `roomSequence`를 할당한다.
- 최종 `ACCEPTED`에 `messageId`와 `roomSequence`를 포함한다.
- 동일 idempotency key와 동일 정규화 본문은 `DUPLICATE`로 처리한다.
- 동일 idempotency key와 다른 정규화 본문은 `IDEMPOTENCY_CONFLICT`로 처리한다.
- 중복 메시지는 다시 전파하지 않는다.
- idempotency 충돌 메시지는 저장하거나 전파하지 않는다.
- 저장 실패 시 메시지를 전파하지 않는다.
- 전파 실패 시 저장 결과를 취소하지 않는다.
- 개별 명령 예외로 worker가 종료되지 않는다.
- 종료 중 신규 명령을 접수하지 않는다.
- 종료 시 queue를 제한 시간 동안 best-effort drain한다.
- queue 및 저장 데이터의 서버 재시작 유실을 허용한다.
- MongoDB 관련 의존성과 구현을 추가하지 않는다.

---

## 24. 본 단계 제외 범위

다음 항목은 후속 단계로 분리한다.

- MongoDB 의존성 추가
- MongoDB document 정의
- MongoDB repository 구현
- MongoDB unique index
- MongoDB roomSequence counter
- MongoDB transaction
- 서버 재시작 후 메시지 유지
- 메시지 이력 조회 API
- `roomSequence` 기반 reconnect catch-up
- 다중 worker
- room 기반 striped worker
- 다중 WebSocket 서버
- 외부 메시지 브로커
- Outbox 저장소와 relay
- durable queue
- 저장 메시지 수정 및 삭제
- 이미지 및 파일 메시지
- read receipt

---

## 25. 후속 MongoDB 도입 시 유지·교체 범위

MongoDB 도입 시 유지하는 구성요소:

```text
ChatCommandService
InMemoryChatMessagePipeline
bounded queue
ChatMessageWorker
ChatMessageProcessor
ChatMessageStore interface
ChatMessagePublisher
ChatMessageEventEnvelope
ChatCommandResultSender
```

교체하는 구성요소:

```diff
- InMemoryChatMessageStore
+ MongoChatMessageStore
```

MongoDB 도입 후에도 전체 메시지 사이클은 변경하지 않는다.

```text
메시지 수신
→ 내부 queue 접수
→ worker 처리
→ MongoDB 저장
→ 메시지 전파
→ 최종 처리 결과 전송
```

Outbox Pattern 도입 시에는 메시지와 Outbox event를 하나의 트랜잭션으로 저장하고 `ACCEPTED`를 반환한다.

```text
메시지 + Outbox event 원자적 저장
→ ACCEPTED
→ Outbox relay가 비동기로 외부 계약 payload 전파
```

`ChatMessagePublisher` port와 versioned `ChatMessageEventEnvelope`는 유지하고 Simple Broker 직접 adapter를 Outbox 기반 adapter 또는 relay 경계로 교체한다.
