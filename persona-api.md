# Persona HTTP API 계약

## 1. 공통 규칙

- base path는 `/api/v1`이다.
- 기존 클라이언트 호환을 위해 URI `/api/v1/me/persona-status`를 유지한다.
- 사용자 식별자는 검증된 JWT의 `sub`에서만 가져온다.
- 조회에는 `vote:personas:read` scope가 필요하다.
- Persona Provider가 반환한 외부 `personaId`는 사용자 API에 노출하지 않는다.

## 2. 현재 Persona 상태 조회

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/v1/me/persona-status` | 가장 최근 Survey 응답에 대응하는 Persona 생성 상태와 사용 가능 capability를 조회한다. |

응답은 다음 필드를 사용한다.

```json
{
  "personaReady": false,
  "status": "PENDING",
  "sourceResponseId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "generationId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "lastErrorCode": null,
  "capabilities": []
}
```

`status`는 다음 값 중 하나다.

- `NOT_SUBMITTED`: 제출된 Survey 응답이 없다.
- `GENERATION_MISSING`: 응답은 제출됐지만 Outbox 이벤트가 아직 소비되지 않았다.
- `PENDING`, `PROCESSING`: Persona 생성 대기 또는 처리 중이다.
- `SUCCEEDED`: 생성에 성공했다.
- `FAILED`: 현재 생성 시도가 실패했다.

`GENERATION_MISSING`은 최종 일관성 구간의 정상 상태이며 `404`나 서버 오류로
처리하지 않는다. `personaReady=true`와 `USE_PERSONALIZED_SERVICE` capability는 최신
응답의 생성 상태가 `SUCCEEDED`이고 내부 Persona 식별자가 존재할 때만 반환한다.

## 3. 소유 경계

Controller와 응답 DTO는 `persona.api`가 소유한다. URI가 `/api/v1/me` 아래에 남아
있더라도 Survey API는 Persona 조회 서비스나 응답 타입을 참조하지 않는다.
