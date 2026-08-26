# WebView Bridge

## 책임

- `apps/web`: 서비스가 필요할 때 bridge message 생성 및 native response 수신 adapter를 추가
- `packages/bridge`: 버전된 message schema와 validation
- `apps/mobile`: WebView message 수신 및 native capability 실행

## 처리 흐름

1. 웹이 `WebToNativeMessage`를 생성한다.
2. 메시지를 `window.ReactNativeWebView.postMessage`로 전송한다.
3. `WebAppView.onMessage`가 문자열을 수신한다.
4. `parseWebToNativeMessage`가 message contract를 검증한다.
5. `handleBridgeRequest`가 message type에 해당하는 native capability를 실행한다.
6. 처리 결과를 `NativeToWebMessage`로 웹에 반환한다.

## 변경 시 확인 대상

- 서비스 저장소에서 추가한 web bridge adapter
- `packages/bridge/src/index.ts`
- `packages/bridge/src/index.test.ts`
- `apps/mobile/src/webview/WebAppView.tsx`
