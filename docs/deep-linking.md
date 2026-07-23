# Deep linking checklist

이 템플릿은 HTTPS URL을 웹과 앱의 공통 콘텐츠 식별자로 사용한다.

```text
https://app.example.com/rooms/123

앱 설치됨     → 앱 실행 → WebView에서 /rooms/123
앱 설치 안 됨 → 브라우저에서 /rooms/123
```

## iOS Universal Links

1. `apps/mobile/app.config.ts`의 `ios.associatedDomains`에 `applinks:app.example.com`을 설정한다.
2. Next.js origin에서 `/.well-known/apple-app-site-association`을 JSON content type으로 제공한다.
3. 파일에 실제 Apple Team ID와 bundle identifier를 기록한다.
4. redirect 없이 HTTPS로 직접 응답하는지 확인한다.

## Android App Links

1. `android.intentFilters`에 HTTPS host와 `autoVerify: true`를 설정한다.
2. Next.js origin에서 `/.well-known/assetlinks.json`을 제공한다.
3. 실제 Android package name과 signing certificate SHA-256 fingerprint를 기록한다.
4. debug와 production signing key의 fingerprint를 구분한다.

## App already running

React Native `Linking`이 URL을 수신한 뒤 `DEEP_LINK` bridge message를 보낸다.
Next.js는 origin을 검증하고 `router.push()`로 이동한다. WebView를 새로 생성하지 않으므로 공유 layout의 Client state를 유지한다.
