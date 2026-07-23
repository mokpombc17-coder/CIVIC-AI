# WebView bridge contract

## Direction

```text
Web → Native
WEB_READY
GET_NATIVE_CONTEXT
SHARE

Native → Web
NATIVE_READY
NATIVE_CONTEXT
SHARE_RESULT
DEEP_LINK
APP_STATE_CHANGED
BRIDGE_ERROR
```

## Envelope

```json
{
  "version": 1,
  "id": "web-01J...",
  "sentAt": 1784775600000,
  "type": "SHARE",
  "payload": {
    "title": "토론방",
    "url": "https://app.example.com/rooms/123"
  }
}
```

`id`는 요청과 응답을 연결한다. `version`은 오래된 앱 바이너리와 최신 웹 배포 간 호환성을 판단한다.

## Security rules

- 모든 수신 메시지를 schema로 검증한다.
- 지원하지 않는 `type`은 실행하지 않는다.
- JavaScript 문자열이나 함수 이름을 payload로 받아 실행하지 않는다.
- access token, refresh token, API key를 bridge로 전달하지 않는다.
- 딥링크는 Next.js origin과 등록한 native scheme만 허용한다.
- 외부 URL은 WebView 안에서 탐색하지 않고 검토한 scheme(`https`, `mailto`, `tel`, `sms`)만 OS에 위임한다.
- bridge capability는 명시적인 allowlist로 관리한다.

## Adding a capability

1. `packages/bridge/src/index.ts`에 request/response schema를 추가한다.
2. bridge version을 올려야 하는 breaking change인지 판단한다.
3. `apps/mobile`에서 native handler를 구현한다.
4. `apps/web`에서 capability 존재 여부를 확인한 뒤 UI를 노출한다.
5. 이전 앱 버전에서 사용할 fallback을 정의한다.
