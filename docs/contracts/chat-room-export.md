# Room 채팅 감사 Export 프론트 계약

## 범위

Super Admin용 Room 채팅 감사 Export의 BFF, API client와 향후 hook이 공유하는
프론트 계약을 기록한다. Admin 화면과 Export 이력 UI는 현재 범위가 아니다.

요구 scope `chat:audit:exports`는 일반 사용자의 기본 scope에 포함하지 않는다.
로컬 개발에서는 allowlist된 Super Admin fixture에만 별도로 발급한다.

## 요청

지원 모드는 다음 두 값뿐이다.

```text
FULL
INCREMENTAL
```

프론트는 `baseExportId`, sequence, watermark 또는 Export 형식을 요청에 포함하지
않는다. 성공 응답은 JSON이 아니라 `application/zip` binary다.

## 오류 정책

프론트는 모든 재시도를 사용자 동작으로만 실행하고 자동 재시도하지 않는다.

| 오류                              | 처리                               |
| --------------------------------- | ---------------------------------- |
| `CHAT_EXPORT_ALREADY_RUNNING`     | 현재 작업 종료 후 수동 재시도 허용 |
| `CHAT_EXPORT_BASE_NOT_FOUND`      | 재시도 대신 `FULL` Export 권장     |
| `CHAT_EXPORT_UNAVAILABLE`         | 잠시 후 수동 재시도 허용           |
| network/blob read failure         | 네트워크 확인 후 수동 재시도 허용  |
| `CHAT_EXPORT_TOO_LARGE`           | 재시도하지 않음                    |
| `CHAT_EXPORT_LEDGER_INCONSISTENT` | 재시도하지 않고 서버 관리자 문의   |
| `INTERNAL_ERROR`                  | 같은 요청을 자동 반복하지 않음     |

ZIP binary, base Export ID, watermark와 감사 데이터는 프론트 cache 또는
`localStorage`에 저장하지 않는다.

## 인증 경계

브라우저는 access token을 읽지 않는다. 향후 Next.js BFF Route Handler가
`civic_ai_access_token` HttpOnly 쿠키를 서버에서 읽고 Backend 요청의
`Authorization: Bearer` 헤더로 전달한다.
