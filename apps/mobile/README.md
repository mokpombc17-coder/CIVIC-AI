# Mobile application

`apps/mobile`은 Next.js 애플리케이션을 iOS와 Android에서 실행하기 위한 Expo WebView 셸이다.
React Native로 두 번째 프론트엔드를 만들지 않고, Next.js가 화면과 라우팅을 소유하며 네이티브
코드는 운영체제 기능만 연결한다.

## 설계 원칙

- 제품 UI와 비즈니스 라우팅은 Next.js에 구현한다.
- 일반 HTTP, WebSocket과 서버 상태는 WebView의 웹 애플리케이션이 처리한다.
- 뒤로가기, OAuth 시스템 브라우저, 딥링크, 다운로드, 공유와 푸시만 네이티브 브리지를 사용한다.
- 앱 시작 시 카메라, 마이크, 위치 또는 알림 권한을 자동으로 요청하지 않는다.
- provider token이나 session token을 브리지 메시지 또는 Redux state에 저장하지 않는다.

## 지원 기능

| 기능                | 기본 상태 | 동작                                                         |
| ------------------- | --------- | ------------------------------------------------------------ |
| Android 뒤로가기    | 활성      | WebView에 이동 기록이 있으면 `goBack()`, 없으면 앱 기본 동작 |
| iOS 뒤로가기 제스처 | 활성      | WebView의 back/forward navigation gesture 사용               |
| 딥링크 수신         | 활성      | 허용된 웹 origin 또는 앱 scheme을 Next.js 경로로 전달        |
| 네이티브 공유       | 활성      | 운영체제 공유 창 사용                                        |
| OAuth               | 활성      | WebView 대신 시스템 인증 브라우저 사용                       |
| 파일 다운로드       | 활성      | 임시 다운로드 후 운영체제 저장/공유 창 사용                  |
| 푸시 알림           | 비활성    | 사용자가 요청했을 때만 권한과 Expo push token 요청           |
| Universal/App Link  | 미설정    | 운영 도메인을 설정하고 앱을 다시 빌드하면 활성               |
| 앱 설치 배너        | 미설정    | 웹 서버에 스토어 URL을 설정하면 활성                         |

## 사전 준비

- 루트 README의 Node.js와 pnpm 설정을 완료한다.
- iOS 개발은 macOS, Xcode와 CocoaPods가 필요하다.
- Android 개발은 Android Studio, Android SDK와 실행 가능한 emulator 또는 기기가 필요하다.
- WebView가 불러올 Next.js 개발 서버를 먼저 실행한다.

푸시, OAuth callback과 기타 native module까지 검증하려면 Expo Go가 아니라 Development Build를
사용한다.

## 환경 변수

먼저 모바일 환경 파일을 만든다.

```bash
cp apps/mobile/.env.example apps/mobile/.env.local
```

| 환경 변수                       | 용도                                  | 기본값/상태             | 네이티브 재빌드                                 |
| ------------------------------- | ------------------------------------- | ----------------------- | ----------------------------------------------- |
| `EXPO_PUBLIC_WEB_APP_URL`       | WebView가 불러올 Next.js 주소         | `http://localhost:3000` | 개발 중에는 reload, 운영 반영 시 새 bundle 필요 |
| `EXPO_PUBLIC_APP_HOST`          | Universal Link/App Link host          | 비어 있음, 기능 OFF     | 필요                                            |
| `EXPO_PUBLIC_APP_SCHEME`        | OAuth callback과 개발용 custom scheme | `nextwebview`           | 필요                                            |
| `IOS_BUNDLE_IDENTIFIER`         | iOS 앱 식별자                         | 예제 식별자             | 필요                                            |
| `ANDROID_PACKAGE_NAME`          | Android 앱 식별자                     | 예제 식별자             | 필요                                            |
| `EAS_PROJECT_ID`                | Expo push token을 발급할 프로젝트     | 비어 있음               | 운영 build 전에 설정                            |
| `EXPO_PUBLIC_OAUTH_ENABLED`     | 네이티브 OAuth bridge                 | `true`                  | 개발 중에는 reload, 운영 반영 시 새 bundle 필요 |
| `EXPO_PUBLIC_DOWNLOADS_ENABLED` | 네이티브 파일 다운로드                | `true`                  | 개발 중에는 reload, 운영 반영 시 새 bundle 필요 |
| `EXPO_PUBLIC_PUSH_ENABLED`      | 푸시 등록과 알림 링크 처리            | `false`                 | 개발 중에는 reload, 운영 반영 시 새 bundle 필요 |
| `EXPO_PUBLIC_DOWNLOAD_ORIGINS`  | 다운로드를 허용할 추가 CDN origin     | 비어 있음               | 개발 중에는 reload, 운영 반영 시 새 bundle 필요 |

`EXPO_PUBLIC_APP_HOST`에는 protocol, port와 path를 제외한 hostname만 입력한다. 운영 WebView URL과
추가 다운로드 origin은 HTTPS를 사용해야 한다.

앱 표시 이름과 Expo slug를 바꾸려면 build 환경에서 `APP_DISPLAY_NAME`, `APP_SLUG`도 설정할 수
있다.

## 로컬 실행

먼저 Next.js를 실행한다.

```bash
pnpm dev:web
```

최초 한 번 또는 native config/plugin이 바뀐 뒤에는 네이티브 앱을 다시 빌드한다.

```bash
# Android
pnpm --filter @app/mobile run android

# iOS (macOS)
pnpm --filter @app/mobile run ios
```

네이티브 설정을 바꾸지 않고 TypeScript만 수정할 때는 Development Build와 Metro를 연결한다.

```bash
pnpm dev:mobile
```

### iOS Simulator

Simulator에서는 호스트의 localhost를 그대로 사용할 수 있다.

```dotenv
EXPO_PUBLIC_WEB_APP_URL=http://localhost:3000
```

### Android Emulator

Android Development Build는 두 개의 로컬 개발 서버를 사용한다.

| 포트   | 서버    | 역할                                         |
| ------ | ------- | -------------------------------------------- |
| `8081` | Metro   | Expo 네이티브 셸의 JavaScript bundle 제공    |
| `3000` | Next.js | WebView에서 표시할 웹 애플리케이션 화면 제공 |

호스트의 두 포트를 emulator localhost로 전달한다.

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
```

Emulator 또는 ADB 서버를 다시 시작했다면 두 명령을 다시 실행한다. 앱이 이미 설치된 상태에서는
`pnpm dev:mobile`로 Metro를 실행하고 Metro 터미널에서 `a`를 눌러 Development Build를 열 수
있다.

그 뒤 WebView 주소는 localhost로 유지한다.

```dotenv
EXPO_PUBLIC_WEB_APP_URL=http://localhost:3000
```

### 실제 기기

개발 PC와 기기를 같은 네트워크에 연결한 뒤 LAN 주소를 사용하거나 HTTPS 개발 tunnel을 사용한다.

```dotenv
EXPO_PUBLIC_WEB_APP_URL=http://192.168.0.10:3000
```

기기에서 개발 PC의 방화벽과 해당 port에 접근할 수 있어야 한다. 운영 빌드는 반드시 HTTPS
origin을 사용한다.

## WebView 탐색

- 설정된 Next.js origin은 WebView 안에서 이동한다.
- 외부 HTTP(S), `mailto:`, `tel:`과 `sms:` 링크는 운영체제에 전달한다.
- 알 수 없거나 위험한 scheme은 열지 않는다.
- Android 하드웨어 뒤로가기는 WebView 이동 기록이 있을 때만 소비한다.
- iOS는 WebView의 back/forward swipe gesture를 사용한다.
- WebView 로딩 실패 시 오류 화면과 다시 시도 버튼을 표시한다.

## Native bridge

웹과 네이티브 메시지는 `packages/bridge`의 versioned Zod schema를 함께 사용한다. 현재 bridge가
제공하는 capability는 다음과 같다.

- `share`
- `deep-link`
- `app-state`
- `oauth`
- `download`
- `push`

메시지 종류, payload와 버전 변경 규칙은 [브리지 문서](../../docs/bridge.md)를 참고한다.

## OAuth와 소셜 로그인

OAuth provider 화면은 WebView 안에서 열지 않고 시스템 인증 브라우저를 사용한다.

```text
WebView
→ Next.js BFF의 authorization URL 요청
→ START_OAUTH
→ 시스템 인증 브라우저
→ provider 로그인
→ nextwebview://auth/callback?handoff=...
→ WebView가 handoff code를 BFF session으로 교환
```

템플릿은 native auth session과 안전한 callback 전달 경계까지 제공한다. 실제 provider 설정,
Auth.js 또는 다른 session 구현과 일회용 handoff code 발급은 서비스에서
`apps/web/lib/server/auth/mobile-auth-adapter.ts`에 연결해야 한다.

provider access token은 네이티브 앱이나 bridge payload에 전달하지 않고 서버에 유지한다.

## Universal Links와 App Links

공개 콘텐츠 링크는 custom scheme보다 HTTPS URL을 사용한다.

```text
https://app.example.com/orders/123

앱 설치됨     → 앱 실행 → WebView의 /orders/123
앱 설치 안 됨 → 브라우저의 /orders/123
```

활성화 순서는 다음과 같다.

1. 모바일 `EXPO_PUBLIC_APP_HOST`를 운영 host로 설정한다.
2. `IOS_BUNDLE_IDENTIFIER`와 `ANDROID_PACKAGE_NAME`을 확정한다.
3. 웹 서버에 `APPLE_TEAM_ID`, `IOS_BUNDLE_IDENTIFIER`, `ANDROID_PACKAGE_NAME`,
   `ANDROID_SHA256_CERT_FINGERPRINTS`를 설정한다.
4. 운영 도메인에 Next.js를 배포한다.
5. iOS/Android 앱을 다시 빌드한다.
6. 실제 기기에서 HTTPS 링크를 검증한다.

Next.js는 다음 검증 파일을 제공한다. 필수 환경 변수가 없으면 안전하게 `404`를 반환한다.

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

자세한 검증 절차는 [딥링크 문서](../../docs/deep-linking.md)를 참고한다.

Custom scheme은 OAuth callback과 개발 보조 수단이다. 앱 미설치 시 웹 fallback이 필요한 링크에는
사용하지 않는다.

## 파일 다운로드

`DOWNLOAD_FILE`은 WebView origin과 `EXPO_PUBLIC_DOWNLOAD_ORIGINS`에 등록된 HTTP(S) origin만
허용한다. 운영 빌드에서는 HTTPS만 허용한다.

파일은 앱 cache에 임시로 내려받고 운영체제 저장/공유 창을 연 뒤 삭제한다. 따라서 앱 시작 시
광범위한 저장소 권한을 요청하지 않는다. 인증 파일은 BFF가 짧게 만료되는 일회용 URL을 발급하는
방식을 권장한다.

## 푸시 알림

푸시는 기본적으로 꺼져 있다. 다음 준비가 끝난 뒤 활성화한다.

1. EAS 프로젝트를 생성하고 `EAS_PROJECT_ID`를 설정한다.
2. iOS APNs와 Android FCM credentials를 구성한다.
3. 웹의 `PUSH_TOKEN_UPSTREAM_URL` 또는 `PushTokenRepository`를 실제 저장소에 연결한다.
4. `EXPO_PUBLIC_PUSH_ENABLED=true`로 변경한다.
5. 앱을 다시 build하고 실제 기기에서 테스트한다.

앱은 시작할 때 알림 권한을 요청하지 않는다. 사용자가 웹의 알림 활성화 UI를 선택해
`REQUEST_PUSH_PERMISSION`을 전송했을 때만 권한을 요청한다.

알림 payload의 `data.url`은 일반 딥링크와 동일하게 same-origin 검증을 통과해야 한다.

## 권한 정책

| 권한/기능 | 요청 시점                                        |
| --------- | ------------------------------------------------ |
| 알림      | 사용자가 알림 활성화를 명시적으로 선택했을 때    |
| 파일 저장 | 별도 광범위 권한 없이 운영체제 저장/공유 창 사용 |
| 카메라    | 기본 미사용                                      |
| 마이크    | 기본 미사용                                      |
| 위치      | 기본 미사용                                      |

새 권한을 추가할 때는 실제 기능 진입 시점에 요청하고, 거부 상태에서도 웹의 핵심 기능을 사용할 수
있어야 한다.

## 필수 앱 업데이트

네이티브 권한, SDK 또는 bridge 기능이 추가되어 이전 앱 binary와 호환되지 않을 때는 웹 서버의
최소 build version 정책을 사용한다. 두 값이 비어 있으면 필수 업데이트 기능은 비활성화된다.

```dotenv
IOS_MINIMUM_BUILD_VERSION=
ANDROID_MINIMUM_BUILD_VERSION=
```

모바일 셸은 앱의 `buildNumber` 또는 `versionCode`를 WebView에 전달한다. 웹은 최초 연결과 앱이
foreground로 돌아올 때 `/api/mobile/config`를 다시 조회하고, 현재 build가 최소값보다 낮으면
플랫폼별 스토어 링크로 이동하는 필수 업데이트 화면을 표시한다.

새 앱을 스토어에 제출한 뒤에는 다음 순서를 지킨다.

1. 새 build가 실제로 설치 가능한 상태인지 확인한다.
2. `IOS_APP_STORE_URL` 또는 `ANDROID_PLAY_STORE_URL`이 올바른지 확인한다.
3. 해당 플랫폼의 최소 build version을 새 값으로 변경한다.
4. Next.js를 다시 배포한다.

스토어에서 새 build를 받을 수 있기 전에 최소값을 올리면 사용자가 앱에 진입할 수 없으므로,
단계적 배포 중에는 최소값을 올리지 않는다. Production EAS build는 `eas.json`의
`autoIncrement` 설정으로 build version을 증가시킨다.

## 프로덕션 체크리스트

- 앱 표시 이름과 slug를 서비스 값으로 교체한다.
- Bundle ID, Package Name과 custom scheme을 확정한다.
- `EXPO_PUBLIC_WEB_APP_URL`을 HTTPS 운영 주소로 설정한다.
- Apple Team ID, Android signing certificate와 도메인 검증 파일을 확인한다.
- EAS project와 APNs/FCM credentials를 구성한다.
- OAuth provider callback URL과 BFF session adapter를 연결한다.
- 푸시 token 저장소와 사용자 해제 처리를 연결한다.
- 웹의 `IOS_APP_STORE_URL`, `ANDROID_PLAY_STORE_URL`은 스토어 등록 후 입력한다.
- 네이티브 호환성이 깨지는 release는 스토어 배포 완료 후 최소 build version을 갱신한다.
- 실제 기기에서 뒤로가기, OAuth, 딥링크, 다운로드, 알림 클릭을 검증한다.

스토어 URL이 비어 있으면 웹 설치 배너는 렌더링되지 않는다. Universal/App Link와 스토어 URL
변수는 서로 독립적으로 활성화할 수 있다.

## 검증 명령

```bash
pnpm --filter @app/mobile typecheck
pnpm --filter @app/mobile lint
pnpm test
pnpm --filter @app/mobile exec expo export --platform all
```

`expo export`는 JavaScript bundle 생성을 검증한다. 실제 서명된 앱과 Universal/App Link,
APNs/FCM 동작은 development/preview/production build를 실제 기기에 설치해 별도로 검증한다.

## 문제 해결

### Development Build가 JavaScript를 불러오지 못함

- `Starting Metro Bundler`가 표시된 터미널이 실행 중인지 확인하거나 `pnpm dev:mobile`을 실행한다.
- `curl http://localhost:8081/status`가 `packager-status:running`을 반환하는지 확인한다.
- Android emulator에서는 `adb reverse tcp:8081 tcp:8081`을 다시 실행한다.
- Metro 터미널에서 `r`을 누르거나 emulator의 Development Build를 Reload한다.

### WebView가 Next.js에 연결되지 않음

- Next.js가 실행 중인지 확인한다.
- Android emulator에서는 `adb reverse tcp:3000 tcp:3000`을 다시 실행한다.
- 실제 기기에서는 localhost 대신 개발 PC LAN 주소 또는 HTTPS tunnel을 사용한다.
- 운영 build에서 HTTP 주소를 사용하지 않았는지 확인한다.

### OAuth가 WebView에서 열리거나 callback이 돌아오지 않음

- 웹에서 native bridge의 `START_OAUTH`를 사용했는지 확인한다.
- provider에 등록한 callback과 `EXPO_PUBLIC_APP_SCHEME`이 일치하는지 확인한다.
- authorization URL이 설정된 Next.js BFF origin에서 시작하는지 확인한다.

### 푸시가 `unavailable`을 반환함

- `EXPO_PUBLIC_PUSH_ENABLED`와 `EAS_PROJECT_ID`를 확인한다.
- Expo Go가 아니라 Development Build와 실제 기기를 사용한다.
- APNs/FCM credentials가 현재 application identifier와 일치하는지 확인한다.

### HTTPS 링크가 앱 대신 브라우저에서 열림

- `EXPO_PUBLIC_APP_HOST`를 설정한 뒤 앱을 다시 빌드했는지 확인한다.
- AASA 또는 `assetlinks.json`이 redirect 없이 `200`으로 응답하는지 확인한다.
- Android fingerprint가 실제 설치된 build의 signing certificate와 일치하는지 확인한다.

## 관련 문서

- [Bridge protocol](../../docs/bridge.md)
- [Deep linking checklist](../../docs/deep-linking.md)
- [Mobile capabilities](../../docs/mobile-capabilities.md)
- [모바일 환경 변수 예제](./.env.example)
