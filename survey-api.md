# Survey HTTP API 계약

## 1. 공통 규칙

- base path는 `/api/v1`이다.
- 사용자 식별자는 request body, query parameter, path variable로 받지 않고 검증된 JWT의 `sub`에서만 가져온다.
- 사용자 조회 API는 `vote:surveys:read`, 최종 제출 API는 `vote:survey-responses:write` scope를 사용한다.
- 관리자 API는 처음부터 `/api/v1/admin/**` 경계에 둔다. `local`에서는 일반 인증 사용자에게 임시 허용하며, 기본값과 `prod`에서는 관리자 권한 계약이 확정될 때까지 거부한다.
- 오류는 `application/problem+json`이며 `type`, `title`, `status`, `detail`, `instance`, `code`, `replayed`, `retryable`을 공통 필드로 사용한다. 도메인 검증 오류는 `violations[]`를 추가한다.
- UUID path와 body 값은 문자열 UUID다. 시각은 UTC 기준 ISO-8601 문자열이다.

## 2. 사용자 API

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/v1/me/surveys/current` | 활성 회차, 불변 내용 버전, 제출 여부, Eligibility를 함께 조회한다. |
| `POST` | `/api/v1/me/survey-responses` | 현재 회차의 응답을 한 번 최종 제출한다. |
| `GET` | `/api/v1/me/survey-responses/latest` | 자신의 가장 최근 최종 응답 원문을 조회한다. |
| `GET` | `/api/v1/me/survey-responses` | 자신의 과거 응답 목록을 최신순으로 조회한다. |
| `GET` | `/api/v1/me/survey-responses/{responseId}` | 자신의 특정 응답 원문을 조회한다. 다른 사용자의 응답도 `404`로 숨긴다. |
| `GET` | `/api/v1/me/service-eligibility` | 현재 서비스 이용 가능 여부와 capability를 조회한다. |

현재 Survey 응답은 `round`, `content`, `submitted`, `eligibility`로 구성한다.
`content.sections[].groups[].questions[]`는 7개 Section, 29개 화면 Group과
42개 저장 Question을 반환한다. Section은 `sectionKey`, `title`, `description`,
`displayOrder`를 포함한다. Group은 `groupKey`, `sourceNumber`, `displayOrder`,
문구를 포함하고, Question은 제출 식별자인 `questionId`와 `itemKey`,
`itemLabel`, `itemDisplayOrder`, 유형·문구·규칙·선택지를 포함한다. 선택지는
제출 식별자인 `optionId`와 Question 종속 `optionLocalKey=A|B|C...`를 가진다.
사용자 API에는 `sectionId`, `groupId`와 모든 lineage ID를 노출하지 않는다.
해당 값은 버전 추적을 위해 DB와 서버 도메인 내부에서만 유지한다. 모든
Question의 `required`는 `true`다. 사용자용 `content`에는 관리자 actor와
내부 변경 audit 정보가 포함되지 않는다.
Figma의 필수 동의·확인 페이지는 Survey Section과 제출 payload에 포함하지
않으며 운영 서버 협의 범위로 둔다.

활성 회차가 정확히 하나 존재하지 않는 경우는 사용자 미완료 상태가 아니라 운영 오류다. 현재 Survey와 Eligibility API는 `503 SURVEY_ACTIVE_ROUND_UNAVAILABLE`을 반환한다. 정상 활성 회차 안에서 `eligibility.eligible=false`인 경우만 사용자의 Survey 미완료 상태다.

### 최종 제출

`Idempotency-Key` 헤더에 클라이언트가 생성한 UUID를 필수로 전달한다. 같은 사용자·동작·key와 같은 canonical request는 최초 결과를 그대로 재생하고, 응답의 `replayed=true`로 표시한다. 같은 key를 다른 요청에 재사용하면 `409 IDEMPOTENCY_CONFLICT`다.

```json
{
  "roundId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "answers": [
    {
      "questionId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "type": "SINGLE_CHOICE",
      "selection": {
        "optionId": "cccccccc-cccc-cccc-cccc-cccccccccccc",
        "inputText": null
      }
    },
    {
      "questionId": "dddddddd-dddd-dddd-dddd-dddddddddddd",
      "type": "SHORT_TEXT",
      "text": "응답"
    }
  ]
}
```

답변 유형별 값은 다음 필드를 사용한다.

| type | 값 필드 |
|---|---|
| `SINGLE_CHOICE` | `selection` |
| `MULTIPLE_CHOICE` | `selections[]` |
| `SHORT_TEXT`, `LONG_TEXT` | `text` |
| `NUMBER` | `number` |
| `SCALE` | `scale` |

성공은 `201 SURVEY_RESPONSE_SUBMITTED`이며 `replayed`, `responseId`, `roundId`, `contentVersionId`, `submittedAt`을 반환한다. 저장된 거절 결과도 동일한 key 재시도 시 같은 HTTP 상태·오류 code와 `replayed=true`를 반환한다.

### 로컬 preview 사용자

`local` 프로필은 `vote.survey.preview.user-ids`에 설정된 사용자에 한해 사용자
HTTP API를 반복 확인 모드로 제공한다. 기본 대상은 `local-user-1`이며 환경 변수
`VOTE_SURVEY_PREVIEW_USER_IDS`로 쉼표 구분 목록을 재정의할 수 있다.

- 현재 설문 조회와 Eligibility는 해당 사용자의 기존 응답을 무시하고 미제출로 평가한다.
- 제출 payload는 일반 제출과 같은 규칙으로 검증한다.
- 검증 성공은 기존 성공 body와 `code=SURVEY_RESPONSE_SUBMITTED`를 유지하면서 `200`을 반환한다.
- `responseId`에는 요청 `Idempotency-Key` UUID를 사용한다.
- 응답, 답변, 멱등성 receipt와 Outbox event는 저장하지 않는다.
- 반환된 임시 `responseId`의 상세 조회는 지원하지 않고 preview 제출은 최신·이력 조회에 나타나지 않는다.
- 내부 local Task/Persona bootstrap과 비로컬 프로필은 이 예외를 적용하지 않는다.

최신·과거 응답 상세에는 `answers[]`와 함께 그 응답이 참조한 불변 `content`를 반환한다. 따라서 현재 회차가 바뀐 뒤에도 당시 질문 문구와 선택지를 기준으로 원문을 표시할 수 있다.
사용자 응답은 JWT `sub`에서 해석한 사용자 식별자로만 저장·조회하며, 이메일은
Survey API의 요청·응답 및 저장 모델에 포함하지 않는다.

## 3. 관리자 API

> **후순위 메모:** 현재 관리자 endpoint는 기존 평면 Question 관리 기능의
> 호환을 위해 유지한다. 2회차부터 필요한 Group 기반 전체 콘텐츠 등록·검증·발행
> 계약은 별도 후속 작업으로 정의한다. 이번 1회차 사용자 기능의 완료 조건에는
> 관리자 작성 API 확장이 포함되지 않는다.

### 내용 버전

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/v1/admin/survey-content-versions` | 초안 생성 |
| `PUT` | `/api/v1/admin/survey-content-versions/{id}` | 초안 전체 교체 |
| `POST` | `/api/v1/admin/survey-content-versions/{id}/clone` | 발행본을 새 초안으로 복제 |
| `POST` | `/api/v1/admin/survey-content-versions/{id}/publish` | 초안 발행 |
| `GET` | `/api/v1/admin/survey-content-versions` | 내용 버전 목록 |
| `GET` | `/api/v1/admin/survey-content-versions/{id}` | 내용 버전 상세 |

생성·교체 body는 `name`, `description`, `questions[]`를 가진다. 모든 질문은 필수이므로 question의 `required`는 생략하면 `true`로 처리하며, 호환 입력으로 명시할 때도 `true`만 허용한다. question/option의 `id`와 `lineageKey`는 생략하면 서버가 UUID를 만든다. 수정 시 같은 질문·선택지 계보를 유지하려면 기존 `lineageKey`를 보낸다. 선택 질문의 `allowOther=true`는 작성 편의 입력이며 Aggregate가 실제 `kind=OTHER`, `label=기타` 선택지로 물질화한다. 플래그 자체는 저장하지 않고 조회 DTO에서 물질화된 선택지를 기준으로 다시 계산한다. 규칙 필드는 질문 유형에 따라 `minimumSelections`, `maximumSelections`, `maxLength`, `minimum`, `maximum`, `decimalAllowed`, `decimalScale`, `minimumLabel`, `maximumLabel`을 사용한다.

### 회차

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/v1/admin/survey-rounds/schedules` | 발행 내용 버전의 회차 예약 |
| `PUT` | `/api/v1/admin/survey-rounds/{id}/schedule` | 예약 시각 변경 |
| `POST` | `/api/v1/admin/survey-rounds/{id}/cancel` | 예약 취소 |
| `POST` | `/api/v1/admin/survey-rounds/start-now` | 발행 내용 버전으로 즉시 새 회차 시작 |
| `POST` | `/api/v1/admin/survey-rounds/{id}/start-now` | 예약 회차 즉시 시작 |
| `PUT` | `/api/v1/admin/survey-rounds/{id}/enforcement` | 활성 회차 강제 수준 변경 |
| `GET` | `/api/v1/admin/survey-rounds` | 전체 회차 조회 |
| `GET` | `/api/v1/admin/survey-rounds/{id}` | 회차 상세 조회 |
| `GET` | `/api/v1/admin/survey-rounds/{id}/transitions` | 회차 전환 이력 조회 |

관리자의 개별 사용자 응답 원문 조회 endpoint는 제공하지 않는다.

## 4. 주요 오류 코드

| HTTP | code | 의미 |
|---|---|---|
| `400` | `INVALID_REQUEST` | JSON, path, DTO 형식 오류 |
| `400` | `INVALID_IDEMPOTENCY_KEY` | 멱등성 key가 UUID가 아님 |
| `404` | `SURVEY_CONTENT_NOT_FOUND`, `SURVEY_ROUND_NOT_FOUND`, `SURVEY_RESPONSE_NOT_FOUND` | 소유권 범위를 포함해 리소스를 찾을 수 없음 |
| `409` | `IDEMPOTENCY_CONFLICT` | 같은 key를 다른 요청에 재사용 |
| `409` | `CURRENT_SURVEY_ALREADY_SUBMITTED`, `SURVEY_SUBMISSION_ROUND_CHANGED` | 제출 상태 충돌 |
| `422` | `SURVEY_RESPONSE_VALIDATION_FAILED` | 질문 규칙에 맞지 않는 답변 |
| `503` | `SURVEY_ACTIVE_ROUND_UNAVAILABLE` | 활성 회차 불변식이 깨진 운영 오류 |
