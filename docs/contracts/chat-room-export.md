# Room 채팅 감사 Export 프론트 계약

## 범위

Super Admin용 Room 채팅 감사 Export의 BFF, API client와 향후 hook이 공유하는
프론트 계약을 기록한다. Admin 화면과 Export 이력 UI는 현재 범위가 아니다.

요구 scope `chat:audit:exports`는 일반 사용자의 기본 scope에 포함하지 않는다.
로컬 개발에서는 `local-super-admin`과 `e2e-chat-export-admin-{uuid}` 형태의 allowlist된
Super Admin fixture에만 별도로 발급한다.

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

프론트가 호출하는 same-origin endpoint는 다음과 같다.

```text
POST /api/chat/admin/rooms/{roomId}/exports
```

BFF는 요청 `Origin`을 검사하고, 고정된 Chat Resource Server URL에만 요청한다. Backend의
성공 ZIP과 오류 body는 buffering하지 않고 stream으로 전달한다. 응답에서는 다음 헤더만
allowlist로 전달한다.

```text
Content-Type
Content-Disposition
Content-Length
Cache-Control
Pragma
X-Content-Type-Options
X-Export-Id
X-Export-SHA256
```

BFF는 별도의 짧은 timeout을 설정하지 않는다. 배포 플랫폼에서도 요청을 최대 300초까지
허용하도록 Route Handler 실행 한도를 선언한다.

## 브라우저 client와 파일 저장

브라우저 client는 access token을 인자로 받지 않고 same-origin BFF만 호출한다. 성공 응답의
`Content-Type`이 `application/zip`인지 확인한 뒤 Blob으로 읽는다. `X-Export-Id`와
`X-Export-SHA256`은 존재할 때 계약을 검증하고, 헤더가 없으면 각각 `null`로 취급한다.

파일명은 `Content-Disposition`의 quoted `filename`을 우선 사용한다. 헤더가 없으면
`chat-export-{exportId}.zip`, Export ID도 없으면 `chat-export-download.zip`을 사용한다.
파일 저장 후에는 임시 anchor와 Object URL을 성공·실패 여부와 관계없이 정리한다.

## Hook 계약

`useRoomChatExport(roomId)`는 Admin UI가 사용할 다음 상태와 동작만 제공한다.

```text
downloadFull
downloadIncremental
activeMode
isDownloading
errorTitle
errorMessage
canRetry
retry
recommendedMode
resetError
```

hook은 동시에 하나의 Export만 실행한다. 실패 시 자동 재시도하지 않고 실패한 모드만 수동으로
재시도한다. `CHAT_EXPORT_BASE_NOT_FOUND`는 `recommendedMode=FULL`로 표현한다. Room이
바뀐 뒤 완료된 이전 요청은 현재 hook 상태에 반영하지 않는다. 성공한 Blob은 파일 저장 함수에
즉시 전달하고 React state나 Query cache에 보관하지 않는다.
