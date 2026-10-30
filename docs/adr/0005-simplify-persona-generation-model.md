# ADR 0005: Persona 생성 결과 모델 단순화

- 상태: Accepted
- 결정일: 2026-09-01
- 적용 대상: `vote-resource-server` Persona·Task 경계
- 대체 결정: `0001-separate-survey-persona-ownership.md`와
  `0003-single-question-vote-policy.md`의 PersonaVersion 관련 부분

## 배경

기존 모델은 외부 런타임의 Persona 생성 한 건을 `PersonaGeneration`과
`PersonaVersion`에 중복 저장했다. Task 예측과 제출도 같은 결과를 가리키기 위해
`personaGenerationId`와 `personaVersionId`를 함께 보관했다.

현재 정책에서는 설문 응답 한 건마다 Persona 생성 한 건만 존재한다. 설문 응답 자체가
입력 버전을 고정하고, 생성 이력과 재시도 상태는 `PersonaGeneration`이 이미 보유한다.
별도 Version 계층과 현재 포인터는 추가 식별자만 만들 뿐 독립적인 생명주기를 제공하지
않는다.

## 결정

`PersonaGeneration`을 Persona 생성 요청과 성공 결과를 함께 소유하는 단일 Aggregate로
사용한다.

- `sourceType`과 `sourceId`는 입력의 출처를 고정한다. 1회차 설문에서는 `sourceId`가
  `surveyResponseId`다.
- `generationId`는 생성 이력과 Task provenance의 식별자다.
- `personaId`는 외부 AI 런타임이 반환한 Persona 식별자다.
- 상태, 시도 횟수, lease, 재시도 정보, 입력 snapshot은 기존대로 유지한다.
- 하나의 설문 응답에는 하나의 Generation만 허용한다.
- 현재 Persona는 사용자의 최신 설문 응답을 찾은 뒤 그 응답을 source로 갖는 성공한
  Generation에서 계산한다.

`PersonaVersion`, `personaVersionId`, `predictedAdoptionRate`, `modelVersion`은 제거한다.
외부 Persona 생성 성공 응답도 `generationId`와 `personaId`만 요구한다.

Task 예측 입력과 예측·제출 snapshot은 `personaGenerationId`를 보관한다. 예측에는 외부
호출 재현을 위해 당시 `personaId`도 함께 보관하지만 별도 Version 식별자는 사용하지
않는다. 제출 시 현재 Persona와의 일치 여부는 `personaGenerationId`로 검증한다.

## 결과

- 설문 응답 → PersonaGeneration → Task 예측·제출의 역추적 경로가 하나의 식별자로
  단순해진다.
- 입력 snapshot, Inbox/Outbox, lease, 재시도, 멱등성 등 운영 안정성 기능은 유지된다.
- `persona_versions` 테이블과 Task의 `persona_version_id` 컬럼은 V34에서 제거한다.
- 향후 런타임 모델 메타데이터가 실제 소비 요건이 되면 Generation 결과의 명시적
  metadata 계약으로 별도 확장한다.
