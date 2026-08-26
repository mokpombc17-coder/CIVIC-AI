# Deep linking checklist

이 템플릿은 HTTPS URL을 웹과 앱의 공통 콘텐츠 식별자로 사용한다.

```text
https://app.example.com/resources/123

앱 설치됨     → 앱 실행 → WebView에서 /resources/123
앱 설치 안 됨 → 브라우저에서 /resources/123
```

## iOS Universal Links

1. 모바일의 `EXPO_PUBLIC_APP_HOST`에 검증할 host를 설정한다.
2. 웹의 `APPLE_TEAM_ID`, `IOS_BUNDLE_IDENTIFIER`를 설정한다.
3. Next.js가 `/.well-known/apple-app-site-association`을 JSON content type으로 제공하는지 확인한다.
4. redirect 없이 HTTPS로 직접 응답하는지 확인한다.

## Android App Links

1. 모바일의 `EXPO_PUBLIC_APP_HOST`에 검증할 host를 설정한다.
2. 웹의 `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_CERT_FINGERPRINTS`를 설정한다.
3. Next.js가 `/.well-known/assetlinks.json`을 제공하는지 확인한다.
4. debug와 production signing key의 fingerprint를 구분한다.

## App already running

React Native `Linking`이 URL을 수신한 뒤 `DEEP_LINK` bridge message를 보낸다.
Next.js는 origin을 검증하고 `router.push()`로 이동한다. WebView를 새로 생성하지 않으므로 공유 layout의 Client state를 유지한다.

푸시 payload의 `data.url`도 같은 처리 경로를 사용한다. `/resources/123` 같은 상대 경로와 설정된
웹 origin의 절대 URL만 허용한다.

## Disabled by default

`EXPO_PUBLIC_APP_HOST`가 비어 있으면 Expo config에 Associated Domains와 Android Intent Filter를
생성하지 않는다. 도메인이 준비된 후 값을 채우고 앱을 다시 빌드한다.

웹 검증 route도 필요한 식별자 또는 인증서 fingerprint가 없으면 `404`를 반환한다.

커스텀 scheme은 개발과 OAuth callback의 보조 수단이다. 앱 미설치 시 웹 fallback이 필요한 공개
링크에는 HTTPS Universal Link/App Link를 사용한다.
