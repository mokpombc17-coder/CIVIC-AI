# Opinion Map 관리자 검수 API Handoff

## 변경 사항

과업의 전체 선택지별 Opinion Map 결과와 생성 상태를 조회하는 관리자 API가
추가됐다. 기존 사용자 결과 API, LLM 생성 파이프라인 및 저장 스키마는 변경하지
않는다.

```http
GET /api/v1/admin/tasks/{taskId}/opinion-map-generation
```

기존 관리자 인증과 `vote:tasks:admin` 권한을 사용한다.

## AVAILABLE 응답

```json
{
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "resultVersion": 1,
  "status": "AVAILABLE",
  "attemptCount": 1,
  "lastErrorCode": null,
  "nextAttemptAt": null,
  "processingStartedAt": "2026-09-14T11:59:00Z",
  "completedAt": "2026-09-14T12:00:00Z",
  "updatedAt": "2026-09-14T12:00:00Z",
  "canGenerate": false,
  "canRetry": false,
  "options": [
    {
      "optionId": "e17695c2-afc7-4b14-9b04-95bf87103d0e",
      "displayOrder": 1,
      "content": "선택지 A",
      "responseCount": 12,
      "sameChoice": {
        "status": "AVAILABLE",
        "body": "같은 선택을 한 참여자들의 이유 요약입니다."
      },
      "otherChoices": {
        "status": "AVAILABLE",
        "body": "다른 선택을 한 참여자들의 이유 요약입니다."
      }
    }
  ]
}
```

선택지는 `displayOrder` 순서로 반환한다. LLM 입력에서 사용하는 `O1`, `O2` 키는
노출하지 않고 실제 `optionId`와 선택지 내용으로 변환한다. 원문 이유와
`sourceOptions`는 포함하지 않는다.

## 상태

| status | 의미 | canGenerate | canRetry |
| --- | --- | --- | --- |
| `NOT_ELIGIBLE` | 아직 결과 대상이 아니거나 결과 비대상으로 종료됨 | `false` | `false` |
| `NOT_CREATED` | 생성 이력이 없음 | 기능 활성화 여부 | `false` |
| `PENDING` | 생성 대기 중 | `false` | `false` |
| `PROCESSING` | 생성 중 | `false` | `false` |
| `RETRY_WAIT` | 자동 재시도 대기 중 | `false` | `false` |
| `AVAILABLE` | 검수 가능한 결과가 준비됨 | `false` | `false` |
| `UNAVAILABLE` | 최종 생성 실패 | `false` | 기능 활성화 여부 |

결과 manifest가 없는 과거 과업의 `NOT_CREATED` 응답은 `resultVersion=null`이고
선택지의 `responseCount=null`이다. 수동 생성 이후에는 확정된 응답 수가 제공된다.

`AVAILABLE`이 아닌 상태에서는 각 선택지의 `sameChoice`와 `otherChoices`가 `null`이다.

## 영역 상태

```typescript
type OpinionMapArea = {
  status: "AVAILABLE" | "NO_RESPONSES" | "INSUFFICIENT_REASON";
  body: string | null;
};
```

- `AVAILABLE`: `body` 표시
- `NO_RESPONSES`: `body=null`, 프론트의 응답 없음 문구 표시
- `INSUFFICIENT_REASON`: `body=null`, 프론트의 요약 불가 문구 표시

표시 문구는 프론트에서 결정한다. 0표 선택지의 `sameChoice`는
`NO_RESPONSES`, `body=null`로 반환된다.

## 오류

- `404 TASK_NOT_FOUND`: 과업이 존재하지 않음
- `500 TASK_RESULT_VIEW_INTEGRITY_FAILURE`: 확정 결과와 저장된 Opinion Map 간의
  무결성 불일치
