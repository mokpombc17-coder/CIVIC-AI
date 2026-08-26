# Mobile capabilities

React Native는 별도 화면을 소유하지 않고 Next.js WebView와 운영체제 기능 사이의 얇은 셸로 유지한다.

## Environment switches

```dotenv
EXPO_PUBLIC_OAUTH_ENABLED=true
EXPO_PUBLIC_DOWNLOADS_ENABLED=true
EXPO_PUBLIC_PUSH_ENABLED=false
```

기능이 활성화되어도 권한을 앱 시작 시 자동 요청하지 않는다. 푸시 권한은 사용자가 알림 기능을
선택했을 때 `REQUEST_PUSH_PERMISSION`으로 요청한다.

## OAuth

Google 등 OAuth provider 화면은 WebView가 아닌 시스템 인증 브라우저에서 연다.

```text
WebView → START_OAUTH
Native → system auth browser
Provider → Next.js BFF callback
BFF → nextwebview://auth/callback?handoff=...
Native → AUTH_RESULT
WebView → BFF에 handoff code 교환
BFF → HttpOnly session cookie
```

웹 인증 adapter는 Platform Shell 템플릿에 포함하지 않는다. OAuth를 사용하는 서비스가 운영 인증
흐름과 일회용 handoff 교환 endpoint를 별도로 연결한다. provider access token과 서비스 session
token은 bridge payload 또는 Redux에 저장하지 않는다.

## Downloads

`DOWNLOAD_FILE`은 설정된 origin의 HTTP(S) URL만 받는다. 운영 빌드는 HTTPS만 허용한다.
파일은 앱 cache에 내려받고 OS 공유/저장 창을 연 뒤 임시 파일을 삭제한다.

추가 CDN은 `EXPO_PUBLIC_DOWNLOAD_ORIGINS`에 쉼표로 구분해 설정한다. 인증 파일은 BFF에서
짧게 만료되는 일회용 다운로드 URL을 발급하는 방식을 권장한다.

## Push notifications

클라이언트는 Android notification channel을 만들고, 명시적인 요청이 있을 때 권한과
ExpoPushToken을 획득한다. EAS `projectId`가 없으면 fail-closed 결과를 반환한다.

```text
WebView → REQUEST_PUSH_PERMISSION
Native → PUSH_REGISTRATION_RESULT
WebView → POST /api/mobile/push-tokens
BFF → configured upstream token repository
```

Push를 사용하는 서비스는 실제 사용자/DB 모델에 맞는 token 저장 endpoint 또는 upstream adapter를
별도로 연결한다. Platform Shell 템플릿의 웹 앱에는 이 endpoint가 포함되지 않는다.

알림 클릭 데이터의 `url`은 기존 딥링크 정규화와 same-origin 검사를 통과한 뒤 Next.js
`router.push()`로 전달된다.

## Store install banner

```dotenv
IOS_APP_STORE_URL=
ANDROID_PLAY_STORE_URL=
```

둘 다 비어 있으면 설치 배너가 렌더링되지 않는다. 주소가 있으면 일반 모바일 브라우저에서 해당
플랫폼의 설치 링크를 표시하고 WebView 안에서는 숨긴다.
