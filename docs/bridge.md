# WebView bridge contract

## Direction

```text
Web → Native
WEB_READY
GET_NATIVE_CONTEXT
SHARE
START_OAUTH
DOWNLOAD_FILE
REQUEST_PUSH_PERMISSION

Native → Web
NATIVE_READY
NATIVE_CONTEXT
SHARE_RESULT
AUTH_RESULT
AUTH_CANCELLED
DOWNLOAD_RESULT
PUSH_REGISTRATION_RESULT
DEEP_LINK
APP_STATE_CHANGED
BRIDGE_ERROR
```

## Envelope

```json
{
  "version": 2,
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
- OAuth 결과는 짧게 만료되는 일회용 handoff code를 담은 callback URL만 전달한다.
- OAuth 시작 URL은 설정된 Next.js BFF origin만 허용한다.
- 다운로드 URL은 설정된 HTTPS origin allowlist만 허용한다.
- 딥링크는 Next.js origin과 등록한 native scheme만 허용한다.
- 외부 URL은 WebView 안에서 탐색하지 않고 검토한 scheme(`https`, `mailto`, `tel`, `sms`)만 OS에 위임한다.
- bridge capability는 명시적인 allowlist로 관리한다.
- WebView ref, OAuth session, notification subscription, 다운로드 작업은 Redux에 저장하지 않는다.

## Optional capabilities

`oauth`, `download`, `push`는 앱 바이너리에 구현되어 있어도 런타임 설정에 따라 capability 목록에서
빠질 수 있다. 웹은 `NATIVE_CONTEXT.capabilities`를 확인한 뒤 관련 UI를 노출해야 한다.

- OAuth는 `EXPO_PUBLIC_OAUTH_ENABLED`
- 다운로드는 `EXPO_PUBLIC_DOWNLOADS_ENABLED`
- 푸시는 `EXPO_PUBLIC_PUSH_ENABLED`

푸시 알림을 눌러 이동할 때는 별도 메시지를 만들지 않고 기존 `DEEP_LINK`를 재사용한다.

## Adding a capability

1. `packages/bridge/src/index.ts`에 request/response schema를 추가한다.
2. bridge version을 올려야 하는 breaking change인지 판단한다.
3. `apps/mobile`에서 native handler를 구현한다.
4. `apps/web`에서 capability 존재 여부를 확인한 뒤 UI를 노출한다.
5. 이전 앱 버전에서 사용할 fallback을 정의한다.
