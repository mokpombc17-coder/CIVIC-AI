# Task 전처리 및 관리자 발행 시나리오

## 문서 상태

- 대상: Vote Resource Server(8082), Persona Runtime(9000), 관리자 프론트엔드
- 상태: 8082 구현 완료, 9000·관리자 프론트엔드 연동 대기
- 범위: Task 작성부터 AI 전처리, 즉시·예약 발행까지
- 제외: 사용자별 AI 예상 답변 생성, 투표 제출, Task 결과 수집

아래 흐름은 8082 구현에 반영되었다. 9000과 관리자 프론트엔드는 이 시나리오와 관련 API
명세를 기준으로 연동한다.

## 1. 시스템별 책임

### 관리자 프론트엔드

- 관리자는 8082의 관리자 API만 호출한다.
- 9000을 직접 호출하거나 9000의 상태를 직접 판단하지 않는다.
- 8082가 반환한 Task 상태, 전처리 상태, 허용 동작을 화면에 표시한다.
- `READY`가 아닌 Task의 즉시 발행·예약 발행 동작을 비활성화한다.

### Vote Resource Server(8082)

- Task 원문과 Task lifecycle의 Source of Truth다.
- 전처리에 전달할 Task snapshot과 `contentFingerprint`를 생성한다.
- Task별 현재 전처리 요청과 상태를 저장한다.
- 관리자 명령에 따라 9000에 전처리를 요청한다.
- 9000 callback을 수신하고, 발행 직전에 9000 상태를 최종 확인한다.
- 현재 Task 내용과 일치하는 `READY` 전처리가 있을 때만 발행을 허용한다.

### Persona Runtime(9000)

- 전달받은 불변 Task snapshot을 전처리한다.
- `(requestId, contentFingerprint)`를 멱등 키로 취급한다.
- 전처리 완료 시 8082 callback을 우선 전송한다.
- 8082가 최종 확인할 수 있는 전처리 상태 조회 API를 제공한다.
- 한 번 `READY`가 된 요청을 이후 `FAILED` 또는 `REJECTED`로 되돌리지 않는다.

## 2. 상태 모델

Task lifecycle과 전처리 상태는 서로 다른 상태다.

### Task lifecycle

```text
DRAFT -> SCHEDULED -> OPEN -> CLOSED
   \----------------> OPEN
```

- `DRAFT`: 작성 중이거나 전처리 중인 상태
- `SCHEDULED`: 관리자가 예약 발행을 확정한 상태
- `OPEN`: 사용자에게 노출되고 투표할 수 있는 상태
- `CLOSED`: 종료된 상태

`PROCESSING`이나 `READY`를 Task lifecycle 상태에 추가하지 않는다.

### 전처리 상태

```text
NOT_REQUESTED -> PROCESSING -> READY
                         \--> FAILED
                         \--> REJECTED
                 FAILED -> PROCESSING
                 FAILED -> READY
```

- `NOT_REQUESTED`: 전처리를 요청한 적이 없음
- `PROCESSING`: 9000이 요청을 수락했고 처리 중
- `READY`: 현재 fingerprint의 전처리가 완료됨
- `FAILED`: 일시적 또는 재시도 가능한 실패
- `REJECTED`: 현재 내용으로 처리할 수 없는 비재시도 실패

DB에는 전처리 row가 없으면 `NOT_REQUESTED`로 해석한다.
8082의 outbound 요청이 timeout으로 `FAILED`가 되었더라도 9000이 실제 처리를 완료했을 수
있다. 같은 요청의 유효한 callback 또는 상태 조회 결과가 도착하면 `FAILED -> READY` 복구를
허용한다. `READY`는 다른 상태로 되돌리지 않는다.

## 3. 관리자 화면 허용 동작

| Task 상태 | 전처리 상태 | 내용 수정 | 전처리 시작/재시도 | 예약·즉시 발행 |
|---|---|---:|---:|---:|
| DRAFT | NOT_REQUESTED | 가능 | 가능 | 불가 |
| DRAFT | PROCESSING | 불가 | lease 유효 시 현재 요청 재사용, 만료 후 재전송 | 불가 |
| DRAFT | READY | 불가 | 현재 결과 재사용 | 가능 |
| DRAFT | FAILED | 가능 | 가능 | 불가 |
| DRAFT | REJECTED | 가능 | 내용 변경 후 가능 | 불가 |
| SCHEDULED | READY | 불가 | 불필요 | 예약 시각에 자동 발행 |
| OPEN/CLOSED | 모든 상태 | 불가 | 불가 | lifecycle 규칙 적용 |

`FAILED`와 `REJECTED`에서 수정까지 영구 차단하면 잘못된 Task를 고칠 수 없는 dead-end가
생긴다. 따라서 실패한 전처리는 수정할 수 있다. 수정 시 이전 전처리 결과를 삭제할 필요는
없지만, 새 fingerprint에는 사용할 수 없는 과거 이력으로 취급한다.

## 4. 정상 시나리오

### 4.1 Task 작성과 전처리 시작

1. 관리자가 Task를 생성하거나 수정한다.
2. Task는 `DRAFT`, 전처리는 `NOT_REQUESTED`다.
3. 관리자가 `답변 생성 시작`을 누른다.
4. 관리자 프론트엔드는 8082의 전처리 시작 API를 호출한다.
5. 8082는 같은 Task row를 잠그고 다음을 검증한다.
   - Task가 `DRAFT`인가
   - 질문과 선택지가 발행 가능한가
   - 현재 내용의 전처리가 이미 존재하는가
6. 8082는 Task snapshot의 SHA-256 fingerprint와 `requestId`를 만들고 `PROCESSING`을
   먼저 저장한다.
7. DB transaction이 끝난 뒤 8082가 9000의 기존 `POST /v1/tasks/prepare`를 호출한다.
8. 9000은 요청을 저장하고 `202 PROCESSING`을 반환한다.
9. 관리자 화면은 Task 상세를 다시 조회하여 `AI 답변 준비 중` 상태를 표시한다.

외부 HTTP 호출 중에는 Task DB transaction이나 row lock을 유지하지 않는다.

### 4.2 전처리 완료 callback

1. 9000이 전처리를 완료한다.
2. 9000은 8082 callback API에 `READY`, `FAILED`, `REJECTED` 중 하나를 전송한다.
3. 8082는 path와 body의 `requestId`, `taskId`, `contentFingerprint`를 현재 요청과
   비교한다.
4. 모두 일치할 때만 상태를 반영한다.
5. 동일한 callback 재전송은 성공으로 처리하되 상태를 중복 변경하지 않는다.
6. 현재 요청보다 오래된 callback은 현재 상태를 변경하지 않는다.

callback은 주 전달 방식이지만 유일한 확인 수단은 아니다.

### 4.3 즉시 발행

1. 관리자 화면은 로컬 전처리가 `READY`일 때 `즉시 발행`을 활성화한다.
2. 관리자가 기존 `POST /api/v1/admin/tasks/{taskId}/open-now`를 호출한다.
3. 8082는 9000의 상태 조회 API로 해당 `requestId`를 최종 확인한다.
4. 응답의 `taskId`, `contentFingerprint`, `status=READY`가 현재 Task와 일치하면 Task를
   `OPEN`으로 전환한다.
5. 9000이 `PROCESSING/FAILED/REJECTED`를 반환하거나 확인할 수 없으면 발행하지 않는다.

실패 시 Task는 기존 상태를 유지하므로 관리자가 다시 시도할 수 있다.

### 4.4 예약 발행

1. 관리자 화면은 로컬 전처리가 `READY`일 때 예약 등록을 활성화한다.
2. 관리자가 기존 `POST /api/v1/admin/tasks/{taskId}/schedule`을 호출한다.
3. 8082는 현재 Task fingerprint와 로컬 `READY` 결과가 일치하는지 확인하고 Task를
   `SCHEDULED`로 전환한다.
4. 예약 시각이 되면 8082 lifecycle scheduler가 9000 상태를 최종 확인한다.
5. `READY`가 확인되면 Task를 `OPEN`으로 전환한다.
6. 9000이 일시적으로 응답하지 않으면 Task를 열지 않고 재확인 시각을 뒤로 미룬다.
7. callback 또는 다음 재확인에서 `READY`가 확인되면 마감 시각 전까지 발행한다.
8. 발행되지 못한 채 마감 시각이 지나면 기존 `MISSED_SCHEDULE` 정책으로 종료한다.

사용자 Task 목록에는 `OPEN`만 노출한다. `READY`나 `SCHEDULED`만으로 사용자에게
노출하지 않는다.

## 5. 실패와 복구

### 관리자 요청 응답을 받지 못함

- 같은 Task와 같은 내용에 대한 재호출은 현재 `requestId`를 재사용한다.
- 이미 `PROCESSING`이면 새 9000 작업을 만들지 않는다.
- 이미 `READY`이면 저장된 결과를 반환한다.
- `PROCESSING` lease가 만료되었다면 같은 requestId로 9000 요청을 다시 전달한다.

### callback 유실

- 즉시 발행 요청 또는 예약 발행 시각의 최종 GET으로 상태를 복구한다.
- GET에서 `READY`가 확인되면 8082 로컬 상태도 같은 결과로 조정한다.
- DRAFT의 PROCESSING callback이 계속 도착하지 않으면 lease 만료 후
  `canStartPreparation=true`를 반환해 관리자가 같은 requestId를 재전송할 수 있게 한다.

### 9000 일시 장애

- 준비 요청 실패는 `FAILED`와 `retryable=true`로 기록한다.
- 관리자는 같은 내용으로 재시도할 수 있다.
- 즉시 발행은 실패하고 Task를 열지 않는다.
- 예약 발행은 같은 due Task만 반복 선택해 다른 Task를 막지 않도록 retry 시각을 저장한다.

### 9000 처리 거절

- `REJECTED`와 오류 코드를 기록한다.
- 관리자가 내용을 수정하면 이전 fingerprint는 자동으로 무효가 된다.
- 새 내용은 새 `requestId`와 fingerprint로 전처리한다.

### 늦거나 충돌하는 callback

- 다른 `requestId` 또는 fingerprint의 callback은 현재 상태에 반영하지 않는다.
- `READY` 이후 다른 terminal 상태로의 회귀는 거절한다.
- callback HTTP 재시도로 동일 결과가 여러 번 도착해도 멱등 처리한다.

## 6. 동시성 원칙

- Task 수정과 전처리 시작은 동일한 Task row lock을 사용한다.
- 발행과 전처리 결과 반영도 현재 fingerprint를 다시 확인한다.
- 9000 호출 전에 8082가 `PROCESSING`을 먼저 commit한다.
- 외부 호출 결과를 반영할 때 현재 요청인지 다시 확인한다.
- Task가 수정되어 현재 fingerprint가 달라졌다면 과거 요청의 callback을 반영하지 않는다.
- 관리자 이중 클릭이나 네트워크 재전송으로 9000 작업이 중복 생성되지 않아야 한다.

## 7. 구현 완료 조건

- 관리자 화면에서 전처리 상태와 오류를 조회할 수 있다.
- `PROCESSING/READY` Task 내용을 수정할 수 없다.
- 현재 fingerprint의 `READY`가 없으면 예약·즉시 발행할 수 없다.
- 예약 발행 scheduler도 발행 직전에 9000을 확인한다.
- callback 유실 시 GET으로 복구된다.
- 9000 장애 시 준비되지 않은 Task가 사용자에게 열리지 않는다.
- 실패 후 수정 또는 재시도할 수 있어 영구 dead-end가 없다.
- 과거 callback과 중복 callback이 현재 Task 상태를 훼손하지 않는다.

세부 HTTP 계약은 [Task 전처리 및 발행 API 명세 v1](./task-preparation-api-contract-v1.md)을
따른다.
