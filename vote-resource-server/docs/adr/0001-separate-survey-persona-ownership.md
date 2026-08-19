# ADR 0001: Survey와 Persona의 소유 경계 분리

- 상태: Accepted
- 결정일: 2026-08-18
- 적용 대상: `vote-resource-server`
- 후속 구현: Persona 패키지 독립, Transactional Outbox, Persona Inbox, Persona 버전, Task 결합 제거

## 배경

현재 Survey 응답 제출 유스케이스는 Survey 응답과 답변을 저장하는 트랜잭션 안에서
`PersonaGeneration(PENDING)`도 함께 생성한다. Persona 생성 상태, 재시도 정책, 외부
Persona API 호출, 현재 Persona 조회 역시 `com.hamcheeze.vote.survey` 아래에 있다.

이 구조는 모든 Persona가 Survey의 단순 부속 결과일 때는 유효하다. 그러나 Persona는
사용자별 예상 응답 채택률과 모델 버전을 보유하고 Task 예측의 입력으로도 사용된다.
따라서 Persona 생성 생명주기와 결과는 Survey와 독립적으로 발전해야 한다.

현재 Task 영속성은 `task_predictions`에서 `persona_generations`로 직접 외래 키를
가지므로, 코드 패키지만 이동해서는 경계가 완성되지 않는다. 이벤트 전달 보장,
중복 소비, 기존 데이터 이전, Task 참조 방식까지 함께 정의해야 한다.

## 결정

### 1. 배포 및 데이터베이스 형태

당장은 별도 서비스나 Gradle 멀티모듈로 분리하지 않는다. 하나의 Spring Boot
애플리케이션과 하나의 PostgreSQL을 사용하는 모듈러 모놀리스로 유지한다.

목표 패키지 경계는 다음과 같다.

```text
com.hamcheeze.vote
├── survey
│   ├── domain
│   ├── application
│   └── infra
├── persona
│   ├── domain
│   ├── application
│   └── infra
├── task
└── shared
    └── integration
        └── outbox
```

각 도메인은 다른 도메인의 JPA Entity 또는 Repository를 직접 참조하지 않는다.
같은 프로세스 안의 조회 연계는 명시적인 Application Port와 DTO를 사용한다.

### 2. 데이터 소유권

| 데이터/정책 | 소유 도메인 | 비고 |
|---|---|---|
| 설문 콘텐츠와 질문 규칙 | Survey | 게시된 콘텐츠는 불변 |
| 설문 회차와 활성화 정책 | Survey | 전역 활성/예약 회차 제약 유지 |
| 사용자 설문 응답과 답변 | Survey | 최종 제출 후 불변 |
| Survey 응답 제출 이벤트 | Survey | Outbox까지 Survey 트랜잭션이 책임짐 |
| Persona 생성 요청과 상태 | Persona | `PENDING/PROCESSING/SUCCEEDED/FAILED` |
| Persona 재시도와 외부 Provider 호출 | Persona | 최대 시도, backoff, 오류 분류 포함 |
| Persona 생성 결과와 버전 | Persona | 사용자별 최신 성공 버전 제공 |
| 사용자별 예상 응답 채택률 | Persona | Persona 버전 생성 시점의 모델 추정치 |
| 실제 응답 채택 이력 | Task | `AI_ACCEPTED/USER_ANSWERED` 원천 기록 |
| 실제 응답 채택률 집계 | Result Read Model | Persona 원본을 직접 수정하지 않음 |

Survey는 Persona 자체나 Persona 생성 상태를 소유하지 않는다. Persona는 Survey
Aggregate를 직접 참조하지 않고, 제출된 응답을 나타내는 외부 식별자와 불변 입력
스냅샷만 사용한다.

### 3. Survey 제출 트랜잭션

Survey 응답 제출 트랜잭션은 다음 항목만 원자적으로 저장한다.

```text
survey_responses
survey_answers
integration_outbox(SurveyResponseSubmittedV1)
```

Outbox 저장이 실패하면 Survey 제출도 롤백한다. Outbox가 저장된 뒤 Persona 처리에
실패하더라도 이미 완료된 Survey 제출은 롤백하지 않는다.

기존의 `SurveyResponseSubmitted`는 Survey 내부 도메인 이벤트로 유지할 수 있다.
외부 소비자는 이 타입에 직접 의존하지 않는다. Survey Application 계층이 도메인
이벤트를 아래의 Integration Event V1으로 변환한다.

### 4. Integration Event 계약

이벤트 Envelope는 다음 메타데이터를 가진다.

```text
eventId       UUID
eventType     "survey.response-submitted"
schemaVersion 1
occurredAt    Instant
aggregateType "SURVEY_RESPONSE"
aggregateId   responseId
payload       JSON
```

`SurveyResponseSubmittedV1` payload는 다음 필드로 고정한다.

```java
record SurveyResponseSubmittedV1(
        String userId,
        UUID responseId,
        UUID roundId,
        UUID contentVersionId,
        Instant submittedAt
) {
}
```

- 식별자는 null일 수 없다.
- `userId`는 앞뒤 공백이 없는 비어 있지 않은 값이어야 한다.
- `submittedAt`은 UTC `Instant`로 직렬화한다.
- 답변 본문은 Outbox payload에 넣지 않는다. 민감 데이터 중복과 큰 이벤트를 피한다.
- 이벤트 필드는 V1에서 삭제하거나 의미를 변경하지 않는다. 호환되지 않는 변경은
  새 `schemaVersion`을 사용한다.

Persona 소비자는 `responseId`를 이용해 `SurveyResponseSourceReader` 포트에서 불변
입력 스냅샷을 조회하고, 외부 Provider 호출 전에 Persona 소유 데이터로 복사한다.
향후 별도 서비스로 분리할 때 이 포트의 Adapter를 내부 HTTP 또는 스냅샷 이벤트로
교체할 수 있다.

### 5. 전달 보장과 멱등성

별도 메시지 브로커는 도입하지 않는다. PostgreSQL Outbox Poller가 미발행 이벤트를
조회하고 Persona Consumer에 전달한다.

- 전달 보장: at-least-once
- 순서 보장: 전역 순서를 요구하지 않음
- 발행 재시도: Outbox가 시도 횟수와 다음 시도 시각을 관리
- 소비 중복 방지: Persona Inbox가 `(consumerName, eventId)`를 유일하게 관리
- 업무 중복 방지: PersonaGeneration이 `(sourceType, sourceId)`를 유일하게 관리

Survey 기반 생성의 식별자는 다음과 같다.

```text
sourceType = SURVEY_RESPONSE
sourceId   = responseId
```

같은 이벤트가 여러 번 전달되거나 다른 `eventId`로 동일한 Survey 응답이 전달돼도
PersonaGeneration은 하나만 생성한다. 이벤트 처리는 재실행 가능해야 한다.

### 6. Persona 모델

Persona는 생성 작업과 생성 결과를 분리한다.

#### PersonaGeneration

생성 작업의 생명주기와 재시도를 소유한다.

```text
generationId
userId
sourceType
sourceId
status
attemptCount
nextAttemptAt
lastErrorCode
createdAt
processingStartedAt
completedAt
updatedAt
```

한 Survey 응답은 하나의 PersonaGeneration만 만들 수 있다.

#### PersonaVersion

성공한 생성 결과의 불변 스냅샷이다.

```text
personaVersionId
generationId
userId
providerPersonaId
predictedAdoptionRate
modelVersion
generatedAt
sourceType
sourceId
```

- `predictedAdoptionRate`는 사용자 수준의 예상 응답 채택률이다.
- Java에서는 `BigDecimal`, PostgreSQL에서는 `numeric`을 사용한다.
- 허용 범위는 `0 <= predictedAdoptionRate <= 1`이다.
- `modelVersion`은 비어 있지 않아야 한다.
- 과거 버전을 덮어쓰지 않는다.
- 사용자의 현재 Persona는 가장 최근에 성공한 `PersonaVersion`이다.
- 동일 사용자에게 새 버전을 생성해도 이전 버전을 Task/Result 감사 목적으로 보존한다.

외부 Persona Provider의 다음 계약 버전은 성공 결과에 `providerPersonaId`,
`predictedAdoptionRate`, `modelVersion`을 반환해야 한다. 이 값이 없거나 범위를
벗어나면 생성 성공으로 기록하지 않는다.

예상 채택률은 PersonaVersion의 모델 추정치다. 실제 채택률은 Task 제출 이벤트에서
계산되는 별도 Result Projection이며, PersonaVersion을 소급 수정하지 않는다.

### 7. Persona 조회 API와 보안

기존 URI `/api/v1/me/persona-status`는 클라이언트 호환성을 위해 유지한다. 구현
Controller와 Query Service의 소유권만 Persona로 이동한다.

목표 권한은 `vote:personas:read`다. 인증 시스템과 클라이언트가 새 Scope를 발급하기
전까지 전환 기간을 두고 기존 권한을 함께 허용할 수 있지만, 최종 상태에서는 단순
인증만으로 Persona 상태를 조회하게 두지 않는다.

설정 Prefix도 최종적으로 다음과 같이 분리한다.

```text
기존: vote.survey.persona.*
목표: vote.persona.*
```

설정 변경 시 한 릴리스 동안 기존 Prefix를 호환 별칭으로 지원한다.

### 8. Task와 Persona의 관계

Task는 예측에 사용한 `personaVersionId` 또는 과도기 동안의 `generationId`와
`providerPersonaId`를 값으로 보관할 수 있다. 그러나 Persona 테이블에 대한 JPA 연관,
Repository 직접 호출, 장기적인 데이터베이스 외래 키를 가지지 않는다.

V4에서 생성된 `task_predictions`의 `persona_generations` 외래 키는 전환 기간의
기술 부채로 분류했으며, Persona 조회 포트 전환 후 V8 Flyway migration에서 제거했다.
추적용 `generationId`와 `providerPersonaId` 값은 유지하고 기존 V3/V4 migration은
수정하지 않는다.

Task의 `TaskPredictionCandidate`는 현재 답변 값, 순서, 설명을 소유한다. 후보별
채택 확률이 추후 필요하면 Task Prediction의 별도 필드로 추가하며, 사용자 수준의
`predictedAdoptionRate`와 혼합하지 않는다.

### 9. 실제 채택률

실제 채택의 원천 데이터는 Task의 `TaskAnswerSource`와 채택된 Candidate ID다.
Result Read Model은 향후 `TaskSubmissionCompleted` Integration Event를 소비해 실제
채택률을 계산한다.

분모 정의는 Result 기능을 구현할 때 별도 정책으로 결정한다. 후보 예측이 제공된
질문 수, 실제 제출 질문 수, 전체 Task 질문 수를 서로 혼용하지 않는다. 이 결정은
Persona 분리 작업의 완료 조건에는 포함하지 않는다.

### 10. 마이그레이션 원칙

- 이미 존재하는 V1~V4 Flyway migration은 변경하지 않는다.
- 새 테이블, 컬럼, backfill, 제약 변경은 새 migration으로만 수행한다.
- 패키지 이동과 이벤트 전환은 한 번에 하지 않고 동작 보존 단계를 둔다.
- 이벤트 Consumer와 멱등성 제약을 Producer 전환보다 먼저 배포한다.
- Outbox 전환 후 Survey가 `PersonaGenerationRepository`에 의존하지 않는 것을
  Architecture Test로 검증한다.
- Persona가 Survey JPA 타입에 의존하지 않는 것을 Architecture Test로 검증한다.
- 외부 API URI는 가능한 한 유지하고 소유 구현만 이동한다.

## 단계별 완료 조건

### 1단계: 경계와 계약 확정

- 이 ADR이 Accepted 상태다.
- 데이터 소유권, 이벤트 V1, 전달 보장, 멱등성 키가 정의돼 있다.
- 예상 채택률과 실제 채택률의 소유권이 분리돼 있다.
- 기존 런타임 동작과 데이터베이스는 변경하지 않는다.

### 2단계: Persona 패키지 독립

- 최상위 `persona` 패키지가 존재한다.
- Persona 생성과 조회 코드가 동작 변경 없이 이동한다.
- Survey 도메인 코드가 Persona 도메인 타입을 참조하지 않는다.
- 전체 기존 테스트가 통과한다.

### 3단계 이후

Outbox/Inbox와 PersonaVersion schema, 이벤트 소비자, Survey Producer 전환, API 소유권
이동, Task 외래 키 제거를 순차적으로 진행한다. 각 단계는 이전 단계의 테스트를
깨뜨리지 않는 독립 변경이어야 한다.

## 결과와 트레이드오프

### 장점

- Survey 제출 가용성이 Persona Provider 장애와 분리된다.
- Persona 재시도와 모델 버전을 Survey 변경 없이 확장할 수 있다.
- 사용자별 예상 채택률의 버전과 출처를 추적할 수 있다.
- 향후 Persona를 별도 서비스로 옮길 수 있는 경계가 생긴다.
- Task와 Result가 Persona의 내부 테이블 대신 안정적인 식별자를 사용한다.

### 비용

- 즉시 일관성 대신 최종 일관성을 다뤄야 한다.
- Outbox/Inbox 운영과 재처리 도구가 필요하다.
- Survey 제출 직후 Persona 상태가 아직 생성되지 않은 짧은 구간이 생긴다.
- 기존 Task 외래 키와 설정 Prefix의 호환 전환이 필요하다.

Persona 상태 API는 이 짧은 구간을 정상 상태로 취급하고 `PENDING` 또는 이에 준하는
응답을 제공해야 하며, 이를 오류나 404로 표현하지 않는다.

## 제외 범위

이 ADR은 다음 항목을 구현하지 않는다.

- Kafka 등 외부 메시지 브로커 도입
- Persona 별도 배포 서비스 구축
- 실제 응답 채택률의 분모 정책
- Result Projection 구현
- Survey 질문 `required` API 변경

이 항목들은 각 후속 단계의 별도 스펙과 테스트에서 다룬다.
