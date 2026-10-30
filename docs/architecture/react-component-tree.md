# apps/web React component responsibility tree

## 문서 목적

주요 React 컴포넌트가 어떤 책임으로 나뉘고 조립되는지 보여주어, 새로운 화면 로직·상태·데이터 처리를 어느 계층에 배치할지 판단하는 데 참고한다.

이 문서는 전체 JSX 또는 DOM 구조를 열거하지 않는다. 상태를 개별적으로 나열하지는 않지만,
컴포넌트의 책임 구분을 통해 상태와 데이터 처리의 적절한 위치를 판단할 수 있도록 한다.
`apps/web/app/layout.tsx`의 `RootLayout`을 시작점으로 route, provider, runtime, container,
view와 독립 feature control 사이의 논리적 조립 관계를 정리한다.

## 표기 규칙과 범위

각 노드는 `이름 [실행 환경] [역할] [조건·관계] [속성] (파일 경로)` 순서로 표기한다. 아래에 정의한
태그만 대괄호로 쓰고, 그 밖의 보충 설명은 노드 뒤에 `— 설명` 형식으로 적는다.

### 실행 환경

컴포넌트가 정의된 파일의 `"use client"` 선언과, 그 컴포넌트를 JSX로 렌더링하는 위치로 정한다.

- `[Server]`: `"use client"`가 없고 Server Component에서만 렌더링되는 컴포넌트
- `[Client]`: 정의된 파일이 `"use client"`를 선언해 Client module graph를 시작하는 컴포넌트
- `[Client graph]`: `"use client"`가 없지만 Client 컴포넌트 안에서만 렌더링되어 Client module graph에
  포함되는 컴포넌트
- `[Server-compatible]`: `"use client"`가 없고 Server와 Client 양쪽에서 렌더링되는 컴포넌트

### 역할

- `[Route]`: App Router의 layout, page 또는 special UI 경계
- `[Provider]`: Context나 외부 store의 생명주기와 하위 사용 범위를 정의하는 경계
- `[Runtime]`: 화면과 독립적으로 bridge, realtime event 또는 진단 생명주기를 연결하는 경계
- `[Boundary]`: 인증, 이용 자격, 로그아웃 같은 조건을 확인해 children을 그대로 렌더링하거나 대기·차단
  화면으로 바꾸는 경계
- `[Container]`: Query, mutation, local state, effect와 ViewModel을 조립하는 화면 경계
- `[View]`: 상위 container가 만든 props를 배치하는 대표 화면 경계
- `[Feature]`: 독립된 사용자 동작, 정책, 외부 상태 구독 또는 접근성 생명주기를 담당하는 경계
- `[Control]`: 열림 상태와 keyboard 탐색처럼 자체 상호작용 상태를 가진 재사용 입력 컴포넌트
- `[Adapter]`: 자체 UI 없이 브라우저 입력이나 플랫폼 이벤트를 앱 동작으로 연결하는 컴포넌트

### 조건과 관계

- `[conditional]`: 컴포넌트가 조건에 따라 출력 분기를 선택하거나 `null`을 반환하고, 또는 App Router가 런타임 상태에 따라 선택하는 UI
- `[conditional: 조건]`: 렌더링 조건을 함께 적은 `[conditional]`
- `[dynamic]`: `next/dynamic`, `React.lazy`, `lazy()` 또는 동적 `import()`로 로드되는 컴포넌트
- `[slot: ...]`: `children`, slot, provider처럼 소스만으로 실제 자식을 하나로 확정할 수 없는 관계
- `[slot: prop 이름]`: 상위 컴포넌트가 만든 ReactNode를 하위 View의 해당 prop으로 전달해 배치하는 관계
- `[redirect: 경로]`: 화면을 렌더링하지 않고 해당 경로로 이동하는 route

### 속성

- `[scroll: self]`, `[scroll: child]`: `PlatformShell`의 스크롤 주체. `self`는 shell content가 직접
  스크롤하고, `child`는 내부 viewport가 스크롤한다.
- `[bottom navigation: omitted]`: `PlatformShell`에 하단 내비게이션을 조립하지 않는다.
- `[active: 경로]`: 해당 경로에서만 동작한다.
- 트리 줄 앞의 `route /경로:`는 page 또는 layout을, `route segment loading:`은 해당 segment의
  `loading.tsx`를 뜻한다. `segment /경로`는 같은 segment의 loading과 page·하위 route를 묶는 줄이며,
  segment loading은 page가 렌더링하는 자식이 아니다.

### 범위

- `div`, `section`, `main`, `header` 등의 intrinsic HTML element는 제외했다.
- `next/link`의 `Link`처럼 프로젝트 외부에서 정의된 컴포넌트도 제외했다. 단, 전역 runtime을 담당하는
  `@next/third-parties/google`의 `GoogleAnalytics`는 포함한다.
- 대표 `[View]` 경계는 props 중심이어도 container와 화면 책임의 분리를 보여주기 위해 포함한다.
- badge, avatar, item, notice, trigger, layout wrapper처럼 받은 값을 표시하거나 전달하기만 하는
  순수 표현용 내부 컴포넌트는 생략한다.
- 중간의 순수 표현용 컴포넌트를 생략한 관계는 실제 React parent-child 관계가 아니라 책임상
  상위 컴포넌트가 하위 기능을 조립하는 논리적 관계를 뜻한다.
- 조사 범위에서 `[dynamic]`에 해당하는 컴포넌트는 확인되지 않았다.
- 조건부로 렌더링되는 intrinsic element는 트리에 나타내지 않는다. 포함 대상인 프로젝트 컴포넌트
  호출이 조건식 안에 있으면 `[conditional]`로 표시한다.

## Route `/`와 `/home`

`RootLayout`의 `children`은 App Router가 현재 route segment에 맞게 제공한다. `/`의
`IndexPage`는 표준 홈 경로인 `/home`으로 redirect하고, `/home`의 `HomePage`가 일반 플랫폼
화면용 `PlatformPageShell`을 조립한다. `AppShell`은 route UI를 감싸는 `main`이나 site header를
소유하지 않고 bridge·update·analytics identity·인증 생명주기 같은 전역 runtime만 조립한다.
`AuthenticationLifecycleBoundary`는 `civic-ai:auth:v1` BroadcastChannel의 `LOGOUT`에서 route
children을 내린 뒤 Chat·Vote query cache와 투표 pending 제출을 제거하고 `/login`으로 document
navigation한다. `LOGIN`과 BFCache 복원에서는 투표 pending 제출을 제거하고 hard reload한다. GA4
User-ID와 사용자별 Survey draft는 제거하지 않는다. Production의
`GoogleAnalyticsUserIdentity`는 3000 앱이 `civic.analytics-user-id.v1` session storage key에 저장한
사용자 UUID를 GA data layer에 설정하며, route 이동이나 일반 unmount에서는 값을 초기화하지 않는다.
`useFeatureFailureAnalytics`(`apps/web/components/use-feature-failure-analytics.ts`)는 `/home` 트리에는
속하지 않는 공통 hook으로, Chat·Survey·Vote의 screen과 controller hook이 사용자에게 실제로 표시한 최종 실패를
`feature_failure`로 한 번만 보내고, 같은 방문에서 해당 기능이 정상화되면 `feature_recovered`를 한 번만
보내는 공통 client 경계다. 자동 재시도 중간 오류와 반복 render는 제외하고, 사용자 재시도가 다시
실패한 경우에만 attempt를 증가시킨다. 원본 오류 메시지·응답 본문·사용자 입력은 전송하지 않는다.

```text
RootLayout [Server] [Route] (apps/web/app/layout.tsx)
├── AppShell [Server] [Runtime] (apps/web/components/app-shell.tsx) — 전역 runtime과 update gate 배치
│   ├── GoogleAnalyticsUserIdentity [Client] [Runtime] [conditional: production] (apps/web/components/google-analytics-user-identity.tsx)
│   ├── NativeBridgeRuntime [Client] [Runtime] (apps/web/components/native-bridge-runtime.tsx)
│   └── AppUpdateGate [Client] [Feature] [conditional] (apps/web/components/app-update-gate.tsx)
│       ├── 조건: 필수 업데이트이면 안내 UI를 렌더링하고 전달받은 children은 렌더링하지 않음
│       └── AuthenticationLifecycleBoundary [Client] [Boundary] (apps/web/components/authentication-lifecycle-boundary.tsx)
│           ├── 조건: `LOGOUT`을 받으면 route child를 렌더링하지 않고 `/login`으로 document navigation
│           └── children [slot: App Router가 route child를 제공] — 인증 여부는 확인하지 않음
│               ├── route /: IndexPage [Server] [Route] [redirect: /home] (apps/web/app/page.tsx)
│               └── route /home: HomePage [Server] [Route] (apps/web/app/home/page.tsx)
│                   ├── PlatformPageShell [Server-compatible] [View] (apps/web/components/platform-page-shell.tsx)
│                   │   └── PlatformShell [Server-compatible] [View] [scroll: self] (apps/web/components/platform-shell/platform-shell.tsx)
│                   │       ├── PlatformHeader [Server-compatible] [View] (apps/web/components/platform-shell/platform-header.tsx)
│                   │       └── PlatformNavigationClient [Client] [View] (apps/web/components/platform-navigation-client.tsx)
│                   │           ├── ParticipantSwipeNavigationController [Client] [Adapter] [active: /chat/**, /vote/**] (apps/web/components/participant-swipe-navigation-controller.tsx)
│                   │           └── PlatformNavigation [Client] [View] (apps/web/components/platform-shell/platform-navigation.tsx)
│                   │               └── PlatformBottomNavigation [Client graph] [View] (apps/web/components/platform-shell/platform-bottom-navigation.tsx)
│                   ├── ParticipantHome [Server] [View] (apps/web/components/participant-home.tsx)
│                   └── LocalE2ELoginControl [Client] [Feature] [conditional: non-production] (apps/web/components/local-e2e-login-control.tsx)
└── GoogleAnalytics [Client] [Runtime] [conditional: production] (@next/third-parties/google)
```

`PlatformPageShell`은 일반 화면의 기본 header, `scroll="self"` content와 pathname 기반 하단
내비게이션을 조립한다. `PlatformNavigationClient`는 실제 하단 내비게이션과
`ParticipantSwipeNavigationController`를 함께 조립한다. Controller는 pathname과 React effect 수명을
`attachParticipantSwipeNavigation` browser runtime에 연결한다. Runtime은 `/chat`·`/vote`와 각 하위
route에서만 content surface의 좌우 pointer gesture를 관찰하고, 성공한 gesture를 인접한 실제 하단
내비게이션 link click으로 위임한다. header와 하단 내비게이션은 transform 대상에서 제외하며 세로
gesture는 content의 기존 scroll에 맡긴다. Platform overlay 또는 `inert` 상태가 열려 있으면 새 gesture를
받지 않고 진행 중 gesture와 예약된 이동도 취소한다. 홈의 뒤로가기 control은 목적지가 없으므로 비활성
상태다. 모든 `PlatformShell`은 내부 `PlatformShellVisualViewportBoundary`를 조립하며, 이 Client
runtime은 편집 가능한 요소에 포커스가 있는 동안 모바일 visual viewport가 충분히 줄면 shell 높이와
상단 offset을 가시 영역에 맞추고 bottom navigation을 숨긴다.
`ParticipantHome`은 홈 안내와 AI·토론방·투표 도메인 진입 action을 표현하고, 같은 파일의
`ParticipantHomeBrand`는 `PlatformPageShell.title`로 전달되어 header 제목 자리에 표시된다.
`LocalE2ELoginControl`은 `NODE_ENV`가 `production`이 아닐 때만 `PlatformPageShell.headerActions`를
통해 홈 header 오른쪽에 조립되며, production에서는 렌더링하지 않는다. 내부의 조건부 UI는 intrinsic HTML element이므로 이
컴포넌트 트리에는 별도 자식으로 표시하지 않는다.

## Route `/survey`

`SurveyLayout`은 설문 조회·제출이 공유하는 `VoteQueryProvider`를 조립한다. Survey route는
`ServiceEligibilityGuard`를 거치지 않는다.
`SurveyLoading`은 `/survey` route segment가 준비되는 동안 실제 설문 화면과 동일한
`PlatformShell`을 유지하고, `SurveyScreenLoading`의 전용 로딩 안내를 표시한다. 동일한
`SurveyLoadingStatus`는 `SurveyScreen`의 Current Survey API pending 상태에서도 재사용한다.
`SurveyPage`는 검증한 `returnTo`를 `SurveyScreen`의 제출 후 복귀 목적지로 전달한다. 취소는 `returnTo`와
관계없이 서비스 관문이 없는 `/home`(`SURVEY_EXIT_PATH`)으로 보낸다. 채팅·투표로 돌아가면 관문이 다시
설문으로 보내기 때문이다. 절대 URL,
프로토콜 상대 URL, `/survey` 및 인증 재귀 경로는 `/home`으로 대체한다. `SurveyScreen`은 Current
Survey API의 `PENDING | SUBMITTED` 상태를 분기하고, `PENDING`이면 API가 제공한 Section을 순서대로
단계로 조립한 뒤 마지막 확인 단계를 항상 추가한다. 전체 단계 수는
`sections.length + 1`이며 Section·Question 개수는 코드에 고정되어 있지 않다. 동의 문서 코드와 버전은
`survey-screen.tsx`의 `SENSITIVE_INFORMATION_CONSENT` 상수로 고정되어 있고, 동의 문서를 조회하는 API는
없다. 서버 문서가 바뀌어 `CONSENT_DOCUMENT_CHANGED`가 나면 선택 문항 답을 지우면 동의 없이 제출할 수 있다고
안내한다. 설문 조회가 실패하면 401·403·진행 중 회차 없음(`SURVEY_ACTIVE_ROUND_UNAVAILABLE`)을 구분한
안내를 표시한다. 401은 설문으로 돌아오는 로그인 링크를, 그 밖에는 다시 시도와 `/home`으로 나가는 action을
함께 두며, 진행 중 회차 없음은 failure analytics에 기록하지 않는다. Section이 없는 설문도 다시 시도와
`/home` action을 두고 운영 데이터 오류로 failure analytics에 기록한다. Section 이동
전에 일반 Question과 행렬 Item을 검증하며, `required=false`인 선택 문항은 제목 오른쪽에
`선택 문항` 라벨을 표시하고 비워 둘 수 있다. 복수 선택 선택 문항도 비우면 통과하고, 답하면 최소 선택
개수를 검증한다. 단일 선택·척도·행렬 문항은 이미 고른 항목을 다시 고르면
선택을 해제해, 선택 문항에 한 번 답한 뒤에도 비울 수 있다. 선택 문항에
하나라도 답하면 마지막 단계는 민감정보 수집·이용 동의 checkbox를 표시하고, 최종 제출은 운영 서버에 동의
증적을 먼저 저장해 받은 `consentReceiptId`를 answer payload와 함께 Survey API mutation에 전달한다. 선택
문항에 모두 답하지 않으면 마지막 단계는 동의가 필요하지 않다는 안내만 표시하고, 동의 절차 없이
`consentReceiptId`를 뺀 payload를 제출한다. 답하지 않은 선택 문항은 payload의 answers에서 생략한다. 영구 저장
제출 후에는 Survey 제출 mutation이 eligibility 캐시를 무효화하고, 완료 화면이 강제로 재조회해 서비스 관문과
같은 기준으로 더 이상 설문을 요구하지 않을 때 검증된 `returnTo`로
전체 문서 replace 이동한다. 아직 미완료이거나 조회가 실패하면 완료 화면에 재확인과 `/home` action을
제공한다. 로컬 preview 제출은 이동하지 않고 현재 화면에서 검증 완료 상태와 `/home` action을 유지한다. 답변과 현재 단계는 현재 인증
subject의 SHA-256 지문과 회차·content version으로 격리해 `sessionStorage`에 임시 저장하고(subject 확인이
5초 안에 끝나지 않거나 저장소를 읽을 수 없으면 임시 저장 없이 시작), 현재 API
Question·Item·Option과 대조해 복원한다. 필수 확인 상태는 저장하지 않으며, 동의 저장과 Survey 제출은
각각 독립된 idempotency key를 사용한다. Survey 재시도에는 최초 클릭 시각과 이미 발급된 consent receipt를
유지한다. `survey-submission-recovery.ts`의 `classifySubmissionFailure`는 동의·설문 제출 오류를 사용자
메시지, 필드 오류, 로그인 필요 여부, 최신 설문 재조회, 새 멱등 시도 여부와 함께 실패 단계(`consent | survey`)와 failure
analytics 기록 방식(`failure | recovered | none`)으로 분류한다. 이미 제출된 설문 오류는 복구로, 응답
검증 실패는 기록하지 않음으로 분류한다. 단, 응답 검증 실패 중 동의 receipt 불일치
(`SURVEY_CONSENT_RECEIPT_REQUIRED`, `SURVEY_CONSENT_RECEIPT_NOT_ALLOWED`)는 실패로 기록하고 동의 상태
안내와 새 시도로 분류한다. 토큰 재갱신까지 실패한 401은 로그인 필요로 분류해 `SurveyForm`이 제출 오류
옆에 설문으로 돌아오는 로그인 링크를 두되 제출하기로 다시 시도할 수 있게 둔다. `SurveyForm`은 이 결과에 따라 failure analytics 기록, 폼 상태
전이, 설문 재조회와 제출 coordinator 초기화만 수행하고, 첫 필드 오류가 속한 Section은
`findFirstInvalidSurveySectionIndex`로 찾는다. 제출 성공 또는
`SUBMITTED` 재진입 시 임시 답변을 삭제한다. Section 단계의 `SurveyStepActions`는 카드 다음에 배치하고,
마지막 필수 확인 단계에서는 `SurveyConfirmation`과 함께 `SurveyStepCard` 내부에 조립한다. 필수
절차에서는 bottom navigation을 조립하지 않는다. 재진입 시 `SUBMITTED` 상태는 완료 아이콘과 복귀
action만 제공하고 입력 폼을 조립하지 않는다. 화면이 열릴 때 서비스 관문과 같은 기준으로 eligibility를 다시
확인해, 아직 설문을 요구하면 복귀 대신 재확인과 `/home` action을 보여 관문과 설문 사이를 오가지 않게 한다. `PlatformShell`은 child scroll 모드로 조립하며,
`SurveyForm` 내부의 viewport `div`가 `SurveyProgress`와 현재 단계의 카드·action을 함께 스크롤한다.
Progress가 viewport 위로 사라져도 `PlatformHeader` 제목은 유지한다. `SurveyScreen`은 header 오른쪽의
`SurveyHeaderProgress`에 현재/전체 단계만 표시한다. 이 compact 단계 표시는 본문의 Progress가
viewport 위로 완전히 사라졌을 때 나타나고, 본문 Progress가 다시 보이면 숨는다. 작은 스크롤 경계
여유를 두어 표시 상태가 빠르게 뒤집히지 않게 한다. `SurveyForm`은 현재 단계의 header back action을
`SurveyScreen`으로 올려 1단계에서는 비활성 제어를 유지하고, 2단계부터 확인 단계까지는 이전 설문 단계로
이동하게 한다. 또한 `useSurveyParticipationAnalytics`를 통해 방문별 최초 단계 노출, 실제 foreground
체류 구간의 종료 사유·시간, 제출 시도 횟수를 GA4에 전달한다. 제출 시도는 동의 저장을 포함한 제출
흐름을 시작할 때 기록한다. 임시 답변 복원
여부는 방문의 `entry_type`으로 구분하며 답변 내용은 분석 이벤트에 포함하지 않는다. `SurveyScreen`과
`SurveyForm`, `SurveySubmissionCompletion`은 설문 조회·동의/설문 제출·eligibility 재확인의 사용자 노출
실패와 같은 방문에서의 복구를 공통 failure analytics session으로 묶는다.

```text
RootLayout [Server] [Route] (apps/web/app/layout.tsx)
└── AppShell [Server] [Runtime] (apps/web/components/app-shell.tsx) — 전역 runtime은 Route `/` 트리 참고
    └── AppUpdateGate [Client] [Feature] [conditional] (apps/web/components/app-update-gate.tsx)
        └── AuthenticationLifecycleBoundary [Client] [Boundary] (apps/web/components/authentication-lifecycle-boundary.tsx)
            └── children [slot: App Router가 route child를 제공]
                └── SurveyLayout [Server] [Route] (apps/web/app/survey/layout.tsx)
                    └── VoteQueryProvider [Client] [Provider] (apps/web/components/vote/vote-query-provider.tsx)
                        └── survey children [slot: nested page를 제공]
                            ├── route segment loading: SurveyLoading [Server] [Route] (apps/web/app/survey/loading.tsx)
                            │   └── SurveyScreenLoading [Server-compatible] [View] (apps/web/components/survey/survey-loading.tsx)
                            │       └── PlatformShell [Server-compatible] [View] [scroll: child] [bottom navigation: omitted]
                            │           └── SurveyLoadingStatus [Server-compatible] [View] (apps/web/components/survey/survey-loading.tsx)
                            └── route /survey: SurveyPage [Server] [Route] (apps/web/app/survey/page.tsx)
                                └── SurveyScreen [Client] [Container] (apps/web/components/survey/survey-screen.tsx)
                                    └── PlatformShell [Server-compatible] [View] [scroll: child] [bottom navigation: omitted]
                                        ├── PlatformHeader [Server-compatible] [View] — 단계별 back action
                                        │   └── SurveyHeaderProgress [Client graph] [View] [conditional] (apps/web/components/survey/survey-flow.tsx) — header actions
                                        ├── SurveyLoadingStatus [Server-compatible] [View] [conditional: Current Survey API pending]
                                        ├── SurveyForm [Client] [Feature] [conditional: PENDING] (apps/web/components/survey/survey-screen.tsx) — 임시 답변 복원, 참여 analytics, 제출
                                        │   ├── SurveyProgress [Client graph] [View] (apps/web/components/survey/survey-flow.tsx)
                                        │   ├── SurveyStepCard [Client graph] [View] (apps/web/components/survey/survey-flow.tsx)
                                        │   │   ├── SurveySectionFields [Client graph] [Feature] [conditional: Section 단계] (apps/web/components/survey/survey-question-fields.tsx)
                                        │   │   │   ├── SurveySelect [Client] [Control] (apps/web/components/survey/survey-select.tsx) — 단일 선택과 범위형 숫자
                                        │   │   │   │   └── SurveyDropdownSurface [Client] [View] (apps/web/components/survey/survey-dropdown.tsx) — 공유 menu surface
                                        │   │   │   ├── SurveyMultiSelect [Client] [Control] (apps/web/components/survey/survey-multi-select.tsx) — 복수 선택
                                        │   │   │   │   └── SurveyDropdownSurface [Client] [View] (apps/web/components/survey/survey-dropdown.tsx) — 공유 menu surface
                                        │   │   │   └── ResidenceAddressField [Client] [Feature] [conditional: demographics.residence] (apps/web/components/survey/residence-address-field.tsx)
                                        │   │   │       └── KakaoPostcodeDialog [Client] [Feature] [conditional] (apps/web/components/survey/kakao-postcode-dialog.tsx)
                                        │   │   └── SurveyConfirmation [Client] [View] [conditional: 확인 단계] (apps/web/components/survey/survey-screen.tsx) — 선택 문항 응답 시 동의 checkbox, 미응답 시 안내
                                        │   │       └── SurveyStepActions [Client graph] [View] (apps/web/components/survey/survey-flow.tsx) — 카드 내부
                                        │   └── SurveyStepActions [Client graph] [View] [conditional: Section 단계] (apps/web/components/survey/survey-flow.tsx) — 카드 다음
                                        └── SurveySubmissionCompletion [Client graph] [Feature] [conditional: 제출 결과 있음] (apps/web/components/survey/survey-submission-completion.tsx) — 제출 후 eligibility 재확인
```

`survey-contracts.ts`는 v4의 Section → Question 및 행렬 Item read/write union을 소유하고,
`survey-api.ts`와 `survey-queries.ts`는 transport·runtime parsing·query cache를 담당한다.
`consent-contracts.ts`, `consent-api.ts`, `consent-queries.ts`는 민감정보 동의 증적 저장 요청·응답
계약·transport·mutation을 담당한다. `consent-submission.ts`는 동의 요청 snapshot, 최초 보조 클릭 시각,
idempotency key와 발급된 receipt를 Survey 제출 재시도 동안 유지한다.
`survey-answer-state.ts`는 Question type별 draft, 행렬 Item 상태, 화면 이동용 검증, 선택 문항 응답 여부
판단과 answer 제출 payload 변환을 담당한다. payload 변환은 선택 문항 응답 여부와 동의 receipt 유무가
어긋나면 요청을 만들지 않는다. `survey-submission.ts`는 같은 payload를 다시 제출하면 이전 idempotency key를
재사용하고, payload가 바뀌면 새 key를 만든다. `survey-completion.ts`는 영구 저장된 제출이고 eligibility가
`requiresCurrentSurvey`가 아닐 때 복귀를 허용한다. `survey-navigation.ts`는 `/survey?returnTo=...` URL 생성과 내부 복귀 경로 검증을
소유한다. `survey-draft-storage.ts`는 사용자·회차·content version별 임시 답변 key, 24시간 논리 만료,
현재 설문 계약에 맞춘 안전한 복원과 저장소 장애 시 graceful degradation을 담당한다.
`useSurveyDraftSession`은 이 저장소 계약을 `SurveyForm`의 수명에 연결해 최초 복원 결과를 단일 event로
전달하고, 200ms 지연 저장과 제출 성공 시 정리를 소유한다. `survey-participation-analytics.ts`는
`survey_step_view`, `survey_step_exited`, `survey_submission_attempted` 이벤트 session을 소유하고,
`useSurveyParticipationAnalytics`가 이를 `SurveyForm`의 수명에 연결한다. `survey-form-state.ts`의 순수
reducer는 답변, 현재 단계, 검증 오류, 필수 동의와 제출 feedback·오류 focus 요청의 상태 전이를 소유한다.
`SurveySubmissionCoordinator`는 동의 receipt와 설문 제출 idempotency key를 재시도 사이에 보존하고,
`SurveyForm`은 mutation port와 사용자 노출 오류·analytics 처리를 조립한다.
`survey-presentation.ts`는 `questionKey`별 Figma 전용 제목·안내 문구와 Matrix 화면 layout을 소유하고
API `prompt`를 화면 문구의 fallback으로 사용하지 않는다. Matrix 선택지 중 Figma 표기가 다른 값은
`survey-option-label-overrides.json`에서 `questionKey`와 API label 조합으로 화면 label만 교체하며,
제출에는 원래 `optionId`를 유지한다.
`SurveyForm`은 단계 검증, 최종 검증 또는 서버 필드 오류로 검증 오류가 생기면 다음 frame에 현재 viewport
안의 첫 invalid field로 스크롤하고 그 안의 첫 입력 control로 focus를 이동해 사용자가 다음 행동을 바로
확인할 수 있게 한다.
`SurveySelect`와 `SurveyMultiSelect`는 각각 단일·복수 선택의 상태와 접근성 semantics를 소유한다.
두 control은 `SurveyDropdownSurface`와 dropdown hook을 공유해 메뉴 배치, 외부 클릭 닫기, 열림·닫힘
motion, overflow 방향 표시와 선택지 행 표현을 일관되게 유지한다. dropdown hook은 설문 viewport의
실제 가시 영역을 기준으로 위·아래 배치와 menu 최대 높이를 계산한다. 범위형 숫자와 복수 선택은 순수
값 label을, 일반 단일 선택지는 순번 label을 사용한다.
`ResidenceAddressField`는 거주지 Question(`demographics.residence`, `SHORT_TEXT`)에서 직접 입력과
우편번호 검색 모드를 전환한다. `KakaoPostcodeDialog`는 Kakao 우편번호 script의 로드·실패·재시도 상태,
portal dialog, 배경 shell의 `inert`·`aria-hidden` 처리, focus 이동과 복원, Escape 닫기를 소유한다.

## Route `/chat`와 `/chat/[roomId]`

`ChatLayout`은 채팅 route segment의 공통 Query Client를 `ChatQueryProvider`에서 생성하고,
그 안에서 `ChatAuthenticationBoundary`가 Chat API의 401 상태를 route segment 범위로 구독한다.
`ServiceEligibilityGuard`가 자격을 확인하는 동안에는 `ChatRoomListLoading`을 채팅 목록과 같은
shell fallback으로 유지한다. `/chat/loading.tsx`는 현재 pathname을 구분해 목록 route에서는
`ChatRoomListScreen`을 cache-aware fallback으로 다시 조립한다. 따라서 캐시가 있으면 기존 방 카드를
유지한 채 갱신하고, 캐시가 없는 최초 진입에서만 screen 내부 목록 skeleton이 보인다. 채팅방 상세
route에서는 `ChatRoomScreenLoading`을 선택해 상위 loading boundary가 먼저 활성화되더라도 목록
skeleton이 끼어들지 않는다. 다만 `ServiceEligibilityGuard`의 `loadingFallback`은 layout 범위에
적용되므로, 자격 확인이 content를 막는 동안에는 채팅방 상세로 직접 진입해도 `ChatRoomListLoading`이
표시된다. 자격 조회가 실패하면 Guard가 로그인 또는 다시 시도 안내를 표시하고, 필수 설문이 남아 있으면
설문 route로 document replace 이동한다. `/chat/[roomId]/loading.tsx`도 같은 상세 loading view를 사용하고,
`ChatRoomView`는 실시간 session뿐 아니라
마지막으로 읽은 위치 조회와 가상 viewport의 최초 위치 보정이 끝날 때까지 같은 버블 없는 loading content를
유지한다.
`ChatLayout`은 Boundary 안에 `ServiceEligibilityGuard`, `ChatRealtimeProvider`,
`ChatRoomReadStateProvider`와 nested page를 순서대로 조립한다. 따라서 실시간 Provider는 인증 오류가 없고
이용 자격이 확인된 뒤에만 mount된다. Boundary는 401 상태가 아니면 children을 그대로 렌더링한다. 401 상태가 남은 채 route에 재진입하면 Boundary의 session recovery가 Chat Resource Server를
기준으로 Access Token을 다시 확인하고, 유효한 세션이면 상태를 해제한 뒤 하위 트리를 새로 조립한다.
실제 refresh 인증이 거절된 경우에만 하위 트리를 unmount한 채 현재 URL을 `returnTo`로 보존한 단일
로그인 필요 화면을 제공한다. 복구를 확인하는 동안이나 일시 실패 뒤에는 `ChatAuthenticationRecoveryView`가
확인 중 spinner 또는 다시 시도 action을 표시한다. 네트워크·서버 일시 오류는 제한적으로 재시도하고 로그인
만료와 구분한다.
Read-state Provider는
방별 pending·in-flight·confirmed sequence를 route segment 수명 동안 유지하므로 방 화면이
unmount되어도 `/chat` 안의 route 이동에서는 예약된 보고가 유실되지 않는다. Provider는 짧은
bounded retry 이후 남은 pending을 focus·online·실시간 연결 복구 시 재개하고, 로그인 성공마다
transport의 인증 세대를 교체해 모든 탭에서 이전 사용자의 pending과 늦은 응답을 격리한다. 서버가
read-state PUT을 확정하면 기존 worker/leader-tab protocol을 통해 같은 인증 세대의 다른 탭에도
confirmation을 전달하고, 각 탭은 Room inbox query만 invalidate한다. 실시간 Provider는 STOMP Client를
직접 노출하지 않고 교체 가능한 transport를 제공하며, HTTP 계층의 Access Token 갱신 완료 이벤트를
구독해 갱신된 쿠키로 transport를 재연결한다. `pageshow`, `online`, visible `visibilitychange`에서는
중단된 transport 또는 인증 복구를 재개한다. STOMP가 `AUTHENTICATION_REQUIRED` 상태가 되면 Provider가
Chat Resource Server의 Access Token 복구를 요청하고, 성공 시 transport를 한 번만 재연결한다. 일시
복구 실패는 다음 foreground 복귀에서 다시 시도하고, refresh 인증 거절 또는 복구 직후 재거절만 로그인
필요 Boundary로 전환한다. Room lifecycle은 `focus`, `pageshow`, visible `visibilitychange`를 순서에
의존하지 않는 하나의 foreground 신호로 합친다. 같은 브라우저의 다른 Room에 선점된 session만 자동으로
다시 claim하며, 연결 준비 중이면 `connected` 전환 뒤 한 번만 실행한다. blur·hidden에서는 예약을 취소하고
다른 브라우저·기기로 인해 connection 자체가 `replaced`된 경우에는 자동 claim하지 않는다. transport는
SharedWorker, leader-tab, Direct 순서의 후보 중 사용 가능한 첫 후보를 선택하고, 생성이나 연결 준비에
실패하면 다음 후보로 넘어간다. SharedWorker에서는 Worker가, leader-tab에서는 BroadcastChannel과 Web
Locks로 선출된 한 탭이 STOMP Client를 소유하며, 둘 다 쓸 수 없는 환경에서는 Direct transport가 현재
탭에서 연결한다. 세 환경 모두 하위 채팅 컴포넌트의 사용 계약은 같다. 활성 Room의 message, room-event, read-receipt 세 topic은 같은
generation과 ordered delivery를 공유하고 Receipt 오류는 core message/Room event 적용과 분리한다.
목록에서는 `ChatPage`, 방 상세에서는 `ChatRoomPage`가 Provider의
`children` slot으로 전달된다.

```text
RootLayout [Server] [Route] (apps/web/app/layout.tsx)
└── AppShell [Server] [Runtime] (apps/web/components/app-shell.tsx) — 전역 runtime과 update gate 배치
    ├── GoogleAnalyticsUserIdentity [Client] [Runtime] [conditional: production] (apps/web/components/google-analytics-user-identity.tsx)
    ├── NativeBridgeRuntime [Client] [Runtime] (apps/web/components/native-bridge-runtime.tsx)
    └── AppUpdateGate [Client] [Feature] [conditional] (apps/web/components/app-update-gate.tsx)
        └── AuthenticationLifecycleBoundary [Client] [Boundary] (apps/web/components/authentication-lifecycle-boundary.tsx)
            └── children [slot: App Router가 route child를 제공]
                └── ChatLayout [Server] [Route] (apps/web/app/chat/layout.tsx)
                    └── ChatQueryProvider [Client] [Provider] (apps/web/components/chat/chat-query-provider.tsx)
                        └── ChatAuthenticationBoundary [Client] [Boundary] (apps/web/components/chat/chat-authentication-boundary.tsx)
                            ├── ChatAuthenticationRecoveryView [Client] [View] [conditional: 401 복구 확인 중 또는 일시 실패] (apps/web/components/chat/chat-authentication-boundary.tsx)
                            ├── PlatformPageShell [Server-compatible] [View] [conditional: refresh 인증 거절] (apps/web/components/platform-page-shell.tsx) — 로그인 필요 화면
                            └── ServiceEligibilityGuard [Client] [Boundary] (apps/web/components/service-eligibility-guard.tsx)
                                ├── ChatRoomListLoading [Server-compatible] [View] [conditional: 자격 확인 중] (apps/web/components/chat/chat-room-list-loading.tsx) — `loadingFallback`
                                ├── ServiceEligibilityStatus [Client] [View] [conditional: 자격 조회 실패 또는 필수 설문 이동 중] (apps/web/components/service-eligibility-guard.tsx)
                                └── ChatRealtimeProvider [Client] [Provider] (apps/web/components/chat/chat-realtime-provider.tsx)
                                    ├── ChatRoomReadStateProvider [Client] [Provider] (apps/web/components/chat/chat-room-read-state-provider.tsx)
                                    │   └── children [slot: nested page를 제공]
                                    │       ├── route segment loading: ChatLoading [Client] [Route] (apps/web/app/chat/loading.tsx) — pathname으로 fallback 선택
                                    │       │   ├── ChatRoomListScreen [Client] [Container] [conditional: 목록·비채팅방 경로] — cache-aware fallback
                                    │       │   └── ChatRoomScreenLoading [Server-compatible] [View] [conditional: 채팅방 상세 경로]
                                    │       ├── route /chat: ChatPage [Server] [Route] (apps/web/app/chat/page.tsx) — `filter` search param 정규화
                                    │       │   └── ChatRoomListScreen [Client] [Container] (apps/web/components/chat/chat-room-list-screen.tsx)
                                    │       │       └── ChatRoomListView [Client] [View] (apps/web/components/chat/chat-room-list-view.tsx)
                                    │       │           └── PlatformShell [Server-compatible] [View] [scroll: self] (apps/web/components/platform-shell/platform-shell.tsx)
                                    │       │               ├── PlatformHeader [Server-compatible] [View] (apps/web/components/platform-shell/platform-header.tsx)
                                    │       │               ├── PublicRoomSearchForm [Client] [Feature] (apps/web/components/chat/public-room-search-form.tsx)
                                    │       │               ├── CreateChatRoomForm [Client] [Feature] [conditional] (apps/web/components/chat/create-chat-room-form.tsx) — overlay slot
                                    │       │               │   └── RoomCreationRequestListContent [Client] [View] [conditional] (apps/web/components/chat/room-creation-request-list-view.tsx) — 요청 이력 view
                                    │       │               ├── ChatRoomListDetailDialog [Client] [Feature] [conditional] (apps/web/components/chat/chat-room-list-detail-dialog.tsx) — overlay slot
                                    │       │               │   └── JoinChatRoomControl [Client] [Feature] [conditional] (apps/web/components/chat/join-chat-room-control.tsx) — 참여 가능한 Room
                                    │       │               └── PlatformNavigationClient [Client] [View] (apps/web/components/platform-navigation-client.tsx)
                                    │       │                   ├── ParticipantSwipeNavigationController [Client] [Adapter] [active: /chat/**, /vote/**] (apps/web/components/participant-swipe-navigation-controller.tsx)
                                    │       │                   └── PlatformNavigation [Client] [View] (apps/web/components/platform-shell/platform-navigation.tsx)
                                    │       │                       └── PlatformBottomNavigation [Client graph] [View] (apps/web/components/platform-shell/platform-bottom-navigation.tsx)
                                    │       ├── route /chat/creation-requests: LegacyRoomCreationRequestsPage [Server] [Route] [redirect: /chat] (apps/web/app/chat/creation-requests/page.tsx)
                                    │       ├── route /chat/creation-requests/[creationRequestId]: RoomCreationRequestPage [Server] [Route] (apps/web/app/chat/creation-requests/[creationRequestId]/page.tsx)
                                    │       │   └── RoomCreationRequestScreen [Client] [Container] (apps/web/components/chat/room-creation-request-screen.tsx)
                                    │       │       └── RoomCreationRequestView [Client] [View] (apps/web/components/chat/room-creation-request-view.tsx)
                                    │       └── segment /chat/[roomId]
                                    │           ├── route segment loading: ChatRoomLoading [Server] [Route] (apps/web/app/chat/[roomId]/loading.tsx)
                                    │           │   └── ChatRoomScreenLoading [Server-compatible] [View]
                                    │           └── route /chat/[roomId]: ChatRoomPage [Server] [Route] (apps/web/app/chat/[roomId]/page.tsx)
                                    │               └── ChatRoomScreen [Client] [Container] (apps/web/components/chat/chat-room-screen.tsx)
                                    │                   ├── ChatRoomView [Client] [View] (apps/web/components/chat/chat-room-view.tsx)
                                    │                   │   └── PlatformShell [Server-compatible] [View] [scroll: child] (apps/web/components/platform-shell/platform-shell.tsx)
                                    │                   │       ├── PlatformHeader [Server-compatible] [View] (apps/web/components/platform-shell/platform-header.tsx)
                                    │                   │       ├── ChatRoomEntryError [Client graph] [View] [conditional] (apps/web/components/chat/chat-room-entry-error.tsx)
                                    │                   │       ├── ChatMessageViewport [Client] [Feature] [conditional: Room 오류 없음] (apps/web/components/chat/chat-message-viewport.tsx)
                                    │                   │       └── PlatformNavigationClient [Client] [View] (apps/web/components/platform-navigation-client.tsx)
                                    │                   │           ├── ParticipantSwipeNavigationController [Client] [Adapter] [active: /chat/**, /vote/**] (apps/web/components/participant-swipe-navigation-controller.tsx)
                                    │                   │           └── PlatformNavigation [Client] [View] (apps/web/components/platform-shell/platform-navigation.tsx)
                                    │                   │               └── PlatformBottomNavigation [Client graph] [View] (apps/web/components/platform-shell/platform-bottom-navigation.tsx)
                                    │                   ├── ChatRoomSessionNotice [Client graph] [Feature] [conditional] [slot: sessionNotice] (apps/web/components/chat/chat-room-session-status.tsx)
                                    │                   ├── ChatRealtimeSyncStatus [Client] [Feature] [conditional] [slot: syncStatus] (apps/web/components/chat/chat-realtime-sync-status.tsx)
                                    │                   ├── ChatRoomSessionControls [Client] [Feature] [slot: sessionControls] (apps/web/components/chat/chat-room-session-controls.tsx)
                                    │                   │   └── ChatMessageComposer [Client] [Feature] (apps/web/components/chat/chat-message-composer.tsx)
                                    │                   ├── ChatRoomScreenHeaderActions [Client] [View] [conditional] [slot: headerAction] (apps/web/components/chat/chat-room-screen-overlays.tsx)
                                    │                   ├── ChatRoomScreenMessageSearchPanel [Client] [View] [conditional] [slot: messageSearchPanel] (apps/web/components/chat/chat-room-screen-overlays.tsx) — content 안 검색 bar
                                    │                   │   └── ChatRoomMessageSearchPanel [Client] [Feature] (apps/web/components/chat/chat-room-message-search-dialog.tsx)
                                    │                   └── ChatRoomScreenOverlay [Client] [View] [conditional] [slot: overlay] (apps/web/components/chat/chat-room-screen-overlays.tsx) — 한 번에 하나의 blocking overlay
                                    │                       ├── ChatMessageActionsBottomSheet [Client] [Feature] [conditional] (apps/web/components/chat/chat-message-actions-bottom-sheet.tsx)
                                    │                       └── ChatRoomMembershipDialog [Client] [Feature] [conditional] (apps/web/components/chat/chat-room-membership-dialog.tsx)
                                    │                           └── ChatRoomMembershipPanel [Client] [Container] (apps/web/components/chat/chat-room-membership-panel.tsx)
                                    │                               └── ChatRoomMembershipPanelView [Client] [View] (apps/web/components/chat/chat-room-membership-panel.tsx)
                                    │                                   └── ChatRoomInformationSection [Client] [Feature] (apps/web/components/chat/chat-room-settings-control.tsx)
                                    │                                       └── ChatRoomSettingsControl [Client] [Container] [conditional: 활성 OWNER 편집 중] (apps/web/components/chat/chat-room-settings-control.tsx)
                                    │                                           └── ChatRoomSettingsControlView [Client] [View] (apps/web/components/chat/chat-room-settings-control.tsx)
                                    ├── ChatRoomInboxRuntime [Client] [Runtime] (apps/web/components/chat/chat-room-inbox-runtime.tsx)
                                    │   └── ChatRoomInboxToastList [Client] [View] [conditional] (apps/web/components/chat/chat-room-inbox-toast-list.tsx)
                                    └── ChatRealtimeDiagnosticsPanel [Client] [Feature] [conditional: development] (apps/web/components/chat/chat-realtime-diagnostics-panel.tsx)
```

`AppShell`은 route별 시각 layout을 소유하지 않는다. `/chat` 목록과 `/chat/[roomId]` 상세의
View는 공통 `PlatformShell`을 조립해 480px 이하에서는 가용 너비를 사용하고 그 외에는 최대 393px로
가운데 표시되는 mobile-first surface와 header, 하단 내비게이션을 공유한다. 목록과 채팅방 모두 실제 route로 이동하는 `PlatformNavigationClient`를 하단 slot에
제공한다. 이 Client adapter는 Next.js의 현재
pathname을 읽어 router-independent `PlatformNavigation`에 전달한다. `PlatformNavigation`은 3001이
소유하는 토론방·투표에는 Next Link client navigation을, 3000이 소유하는 홈·AI·계정에는 document
navigation anchor를 제공하며 현재 도메인에만 `aria-current="page"`를 설정한다. pathname이 정확히
`/vote`일 때 투표 항목을 다시 누르면 이동하지 않고 shell content 스크롤만 맨 위로 올려 선택한 탭과
검색어를 유지한다. 목록은
`scroll="self"`로 Shell content가
스크롤을 소유하고, 채팅방은 `scroll="child"`로 `ChatMessageViewport`에 스크롤 책임을 위임한다.
일반 플랫폼 화면은 `PlatformPageShell`을 사용하고, 채팅방처럼
scroll·overlay 제어가 필요한 화면은 `PlatformShell`을 직접 조립한다.

`PlatformShell`은 header, content, content top action, bottom navigation과 overlay slot의 배치, safe area, 공통
z-index를 책임지고 내부 `PlatformShellVisualViewportBoundary`에 모바일 키보드 viewport 보정과
content 스크롤을 맨 위로 올리는 context를 위임한다. `PlatformNavigation`과 `PlatformScrollTopButton`은
이 context로 shell element에 직접 접근하지 않고 content 스크롤을 올린다. 이 runtime은 shell 내부의 편집 가능한 요소에 포커스가 있고 visual viewport가 기준보다
80px 이상 줄었을 때만 shell을 가시 영역에 맞추고 bottom navigation slot을 숨긴다. modal overlay가
열리면 `contentInert`가 header·content·navigation surface를 함께 비활성화한다. `PlatformHeader`는
공통 back icon의 link/button/disabled 표현을 소유하지만,
뒤로 갈 수 있는지는 추론하지 않고 화면이 `backAction`으로 목적지나 동작을 제공한다. 도메인은 route,
active anchor, 동작과 overlay 상태를 계속 소유한다.

`PlatformHeader`의 href 기반 뒤로가기 control은 3000이 소유하는 `/home`으로 이동할 때만 document
anchor를 사용하고, `/chat`·`/vote`·`/survey` 하위 route에서는 Next.js `Link`로 client navigation한다.
각 screen은 목적지나 `onClick` 동작만 소유한다.

`ChatRoomMessageSearchPanel`은 route나 `PlatformShell` overlay를 추가하지 않고 채팅방 content 안에서
메시지 viewport 위에 조건부로 조립된다. 검색 입력·초기화·누적 결과 위치와 위·아래 이동을 단일
control bar에 표시하며 별도의 검색 결과 목록이나 내부 scroll 영역을 만들지 않는다. 결과 이동 중에도
검색 bar를 유지하고 `ChatMessageViewport`의 해당 메시지 위치로 이동한다. 검색 중에는 기존 채팅방
header, message viewport, composer와 bottom navigation을 유지하며 read-state를 멈추지 않는다.
검색 결과가 현재 message history에 있으면 같은 timeline에서 즉시 이동하고 read-state를 유지한다.
현재·캐시된 Context window에 있으면 해당 window를 재사용하며, 어느 캐시에도 없을 때만 새 Context를
조회한다. 최신 timeline과 분리된 Context를 표시하는 동안에만 read-state 보고를 멈추고 명시적인 최신
대화 복귀 동작을 제공한다. 멤버십과 메시지 작업처럼 배경 상호작용을 막아야 하는 기능만
`ChatRoomScreenOverlay`의 blocking overlay로 남는다.

`ChatQueryProvider`가 렌더링하는 `ReactQueryDevtools`는 프로젝트 외부 컴포넌트이므로 트리에서
제외한다. Devtools 출력은 development 환경에서만 활성화된다. `ChatRealtimeSyncStatus`는
REST snapshot과 Worker buffer의 병합이 실패해 조치가 필요할 때만 채팅방 content 상단의 session
notice 다음에 오류 UI를 렌더링하고, 정상·진행 중 상태에서는 `null`을 반환한다.

`ChatRoomInboxRuntime`은 개인 inbox 이벤트, Query 무효화, grouping과 timer를 담당하는 hook을
`ChatRoomInboxToastList`에 연결한다. Toast list는 현재 포커스된 탭에서 다른 Room의 CREATE
알림이 있을 때 만들어진 UI 전용 항목과 선택 callback만 받아 조건부로 렌더링한다. 이
Container/View 분리는 realtime event 처리와 toast 표현 책임의 경계이므로 트리에 유지한다.

`ChatRealtimeDiagnosticsPanel`은 development 환경에서만 우측 하단 trigger와 진단 패널을
렌더링한다. 패널이 열린 동안 SharedWorker 또는 direct transport의 구조화 진단 snapshot을
주기적으로 조회하며, 초기화와 전체 JSON 다운로드 기능을 제공한다.

`ChatPage`는 `filter` search param을 검증해 전체·안읽음 초기값을 정규화한다. `ChatRoomListScreen`은
목록 Query, 공개 방 검색·필터 상태, 참여 방 제외, 누적된 Room inbox의 전체·안읽음 로컬 필터와 URL
동기화, 필터 전 inbox 기준 사용자 ACTIVE Room 한도 도달 표현, 생성 요청 sheet disclosure와 Room
상세 selection·trigger focus 복원을 담당하는 hook을 `ChatRoomListView`에 연결한다.
`ChatRoomListView`는 본문의 생성 요청 action을 제공하고,
생성 요청 sheet와 Room 상세 중 하나를 `PlatformShell`의 overlay slot에 전달하여 overlay가 열린 동안 기존 surface를 inert 처리한다.
목록 surface는 참여 Room 필터·생성 action, 참여 Room 목록, 공개 Room 검색, 참여 가능한 Room 목록
순서로 조립하여 검색의 적용 범위가 공개 Room 목록임을 구조로 드러낸다.
참여 가능한 Room 목록은 목록 상자 끝에 가까워지면 다음 cursor 페이지를 자동으로 이어 받고, 다음 페이지
요청이 실패했을 때만 공개 방 더 보기 버튼을 보여 준다. 이 버튼으로 받은 경우에만 새로 받은 첫 Room으로
이동해 강조하며, 모든 페이지를 받았고 Room이 목록 상자를 넘칠 때만 목록 끝에 마무리 문구를 표시한다.
`PublicRoomSearchForm`은 검색어 draft를 전달하는 controlled 표현이며, 검색어 검증·적용 시점과 Query
조건은 container hook에 둔다.
`ChatRoomListDetailDialog`는 PlatformShell 내부의 ARIA dialog로 목록 snapshot을 Figma 기반 bottom
sheet로 표현하고, 참여 중인 Room의 입장 링크 또는 참여 가능한 Room의 `JoinChatRoomControl`을 조립한다.
브라우저 top layer를 사용하지 않아 backdrop과 sheet가 PlatformShell 경계를 벗어나지 않는다. `CreateChatRoomForm`은 Figma
기반 생성 요청·접수 완료와 요청·목록 전환 control을 가진 bottom sheet를 표현하고 `useCreateChatRoomForm`의 validation, mutation,
멱등성 key 재시도와 라우팅을 연결한다. `PENDING`은 접수 완료 sheet로 전환하고 `APPROVED`는 생성된
Room으로 이동한다. 주제 입력은 노출하지 않고 category는 관리자 승인 과정에서 부여하므로 생성
요청에도 포함하지 않는다. form model은 `LISTED`, `OPEN`을 요청 기본값으로 보완한다. 참여 control의 validation,
mutation, 멱등성 key 재시도와 라우팅 구현도 JSX 밖에 둔다. 방 card, unread badge, avatar, notice와
pagination button은 이 책임 경계를 바꾸지 않는 순수 표현 요소라 생략한다.
`CreateChatRoomForm`의 요청 이력 view는 내 요청 목록 Query와 `RoomCreationRequestListContent`를 조립해
동일한 PlatformShell bottom sheet 안에서 신청 이력을 표시한다. 기존 목록 URL은 `/chat`으로 redirect하고,
개별 상세 route는 기존 deep link 호환을 위해 유지한다.

요청 이력 view의 목록 hook은 사용자의 신청 이력 infinite Query와 opaque cursor
pagination, `INVALID_CURSOR` one-shot 복구를 조립한다. `RoomCreationRequestListContent`는 서버의
`requestedAt ASC`, `creationRequestId ASC` 순서를 변경하지 않고 상태별 신청 card, 승인된 Room 이동과
다음 page 적재를 표현한다.

`RoomCreationRequestScreen`은 `creationRequestId`별 상세 Query, 상태·오류 presentation,
명시적 새로고침과 `PENDING` 신청 취소를 조립해 `RoomCreationRequestView`에
전달한다. 취소와 관리자 결정이 경합하면 동일 취소를 재시도하지 않고 상세를
재조회해 서버 최신 상태로 수렴한다. View는 신청의
`PENDING`·`APPROVED`·`REJECTED`·`CANCELED` 상태, 시각, 반려 사유와 승인된 Room
이동 및 사용자의 명시적인 최신 상태 확인을 표현한다.

`ChatRoomScreen`은 Room detail을 먼저 조회해 화면에 필요한 controller와 ViewModel을 조립하는
container다. ACTIVE Room은 실시간 session과 Message History 조회를 시작한다. CLOSED Room은 구독과 Message History
조회를 모두 시작하지 않고, 빈 timeline과 `ChatRoomSessionNotice`의 종료 안내를 표시한다.
`ChatRoomListScreen`과 `ChatRoomScreen`은 최초 목록·Room/Message History 조회 오류, 실제 연결 오류
session view, Outbox의 최종 메시지 전송 실패만 failure analytics에 전달한다. 연결 준비·자동 재전송 같은
중간 상태와 정상 이탈은 제외하며, 명시적 재조회·재연결 또는 동일 outgoing message의 후속 수락만 복구로
기록한다.
Room별 최초 진입에서 session view가 아직 `pending`이면 `ChatRoomScreen`은 준비 완료 여부를 기억하고
`ChatRoomView`에 단일 초기화 상태를 전달한다. View는 이 동안 개별 구독·이력·입력 상태를 노출하지 않고
고정된 message/composer skeleton을 표시하며, 준비가 길어질 때만 하나의 안내 문구를 보여준다. 한 번
준비가 끝난 Room은 뒤로가기나 짧은 연결 전환에서 초기화 화면으로 되돌아가지 않는다.
`useChatRoomRealtimeExperience`는 ACTIVE Room에서만 Room session과 Message History를 활성화하고, Read Receipt snapshot,
실시간 Query coordinator 및 Room system activity journal을 한 생명주기로 묶는다. Message History
snapshot과 두 sequence 경계가 모두 준비된 뒤에만 실시간 event merge를 열고, 동기화 결과를 session
view로 변환한다. Membership topology event는 수신 시점의 마지막 확정 message sequence를 표시
anchor로 기록하되 Message History, 읽음 수와 검색 cache에는 합치지 않는다. Receipt 오류는 기존
coordinator 경계에서 core message realtime과 분리한다. `useChatRealtimeQueryCoordinator`는 coordinator
callback을 순수 상태 reducer event로 변환해 복구·동기화·Receipt 상태 전이를 한 경계에서 관리한다.
`useChatRoomContentExperience`는 Screen이 공유한 Room detail query와 participant profile을 받아 realtime
snapshot을 읽음 진입 경험과 메시지 경험에 연결한다. Room detail의 현재 membership identity는 일시적인
realtime session 전환 중에도 메시지 소유권 표현에 유지하고, mutation 가능 여부만 활성 session으로
제한한다. CLOSED Room에서는 mutation과 read-state 보고를 비활성화하고 timeline item, history feedback과 이전
이력 조회를 비운다.
Header, viewport ViewModel, history feedback과
Room 오류 복구 동작까지 UI가 바로 소비할 수 있는 content model로 반환한다.
Room 메시지 검색의 dialog disclosure, 적용된 query와 opaque cursor를 소유하는 독립 session,
현재 결과 위치와 순차 이동은 `useChatRoomMessageSearchExperience`가 조립한다. 이 controller hook은
선택한 `messageId`를 Screen의 메시지 이동 controller에 전달하되 검색 bar를 유지한다. 불러온 가장
오래된 결과의 위쪽으로 이동하면 다음 cursor page를 조회하고, `items`가 빈 중간 page도
`searchComplete`가 될 때까지 건너뛴다. 명시적인 취소나 Room 종료 시에는 검색 session을 정리하고
panel을 닫는다. 연결이 끊기거나(자동 재연결 중 잠깐 거치는 연결 오류 포함) 다른 탭·기기에 사용권을
넘긴 동안에는 검색을 유지하고,
다시 활성화되면 적용된 query와 선택한 결과를 유지한 채 결과만 다시 조회한다. 끊긴 사이의 수정·삭제는
실시간 이벤트로 다시 오지 않으므로 generation이 같아도 다시 조회하고, generation이 바뀌면 새 generation으로
조회한다. 이때는 현재 결과로 자동 이동하지 않아 메시지 이동 controller의 위치 복원을 덮어쓰지 않는다. `ChatRoomScreen`이 소유한 `useRoomMessageNavigation`은 선택한 메시지의
위치를 live message history, 현재 Context window, 같은 Room generation의 캐시된 Context 순서로
찾는다. 찾은 window에서는 API 요청 없이 target만 바꾸고, 캐시에 없을 때 선택한 메시지를 중심으로 새
Context를 조회한다. Context query는 개별 이동이나 최신 대화 복귀 때 제거하지 않고 Room이 바뀌거나
재연결로 복원할 때 정리해 겹치는 검색 결과가 window를 재사용할 수 있게 한다. 연결이 끊기거나 다른
탭에 사용권을 넘겨 Room session이 잠시 비활성화되어도 이동 선택을 유지한다. 다시 활성화되면
generation이 같아도 `ChatMessageViewport`가 스크롤 위치가 정해질 때마다 `onViewportAnchorSettled`로
알린 화면 맨 위 메시지 주변 Context를 다시 조회한다. 실시간 복구는 live history의 불러온 page만 다시
받으므로, 끊긴 사이의 수정·삭제를 Context에 반영하려면 따로 다시 조회해야 한다.
조회하는 동안에는 이전 메시지와 timeline key를 유지해 화면을 움직이지 않고, 도착하면 새 timeline으로
바꿔 같은 높이의 `anchor` 초기 위치로 맞춘다. 그 메시지가 이미 live history에 있으면 live 이동으로
복원하고, 조회에 실패하면 이전 메시지를 내리고 Context 오류와 재시도를 보여 준다.
`useChatRoomContentExperience`는 live 이동이면 기존 timeline source와 read-state를 유지하고, Context
이동이면 분리된 message source와 read-state pause를 viewport model로 변환한다.
새 메시지는 고정된 검색 session에 자동 추가하지 않고, 실시간 UPDATE와 DELETE만 이미 로드된
검색 결과와 Context에 반영한다. 검색이나 Context 오류는 core message 수신·전송을 막지 않는다.
`useChatRoomParticipantProfiles`는 ACTIVE membership profile을 메시지 이력과 병렬로 조회하고,
`membershipId` cursor page를 끝까지 이어 Backend `userLabel`과 입장 sequence를 제공한다. profile 조회 실패는 core
message 동작을 막지 않는다. 발신자 이름은 참여 이력(`senderParticipationId`)의 이름, ACTIVE profile,
내 메시지이면 내 이름 순서로 찾고, 모두 없으면 `알 수 없음`으로 표시한다.
`useChatRoomMessageHistoryData`는 최신 message Query의 메시지와 이전 page 유무를 진입 위치 판단용
history snapshot으로 변환하여 Screen이 TanStack infinite page 구조를 직접 해석하지 않게 한다.
`useChatRoomMessageExperience`는 확정 Message History와 Outbox의 optimistic outgoing을 합치고,
확정된 `clientMessageId`를 Outbox에서 정리한다. 수정·삭제 mutation, 메시지 action sheet와
`useChatRoomMessagePresentation`도 같은 경험 경계에서 조립한다. presentation hook은 참여자 이름 map,
Read Receipt projection, 날짜·읽음 구분선과 Membership system activity가 포함된 화면용 timeline 및
viewport item을 만든다. system activity는 participations API 참여 이력의 입장과 나감·차단 이벤트를
WebSocket journal과 중복 제거해 조립하며 현재 사용자의 활동은 제외한다. receipt sync가 ready이며
Room detail의 현재 membership과 snapshot의 self membership이 일치할 때만 현재 확정 메시지에 읽은
인원 projection을 적용하고, message Query cache는 수정하지 않으며 양수인 읽은 인원만 표시한다.
Room 진입 시에는 `useChatRoomEntryNavigation`이 `roomId`별 최초 진입 위치를 한 번 고정하고(재연결로
generation이 바뀌어도 다시 정하지 않음),
`useChatRoomContentExperience`가 읽음 경험 조립을 `useChatRoomReadExperience`에 위임한다. 이 hook은
receipt snapshot의 읽은 위치가 처음 불러온 최신 message page 안에 있거나 더 이전 메시지가 없으면 그
목록의 읽음 구분선을 초기 스크롤 목표로 쓴다. 최신 page보다 이전이면 과거 page를 거슬러 조회하지 않고
`afterSequence`로 첫 안 읽은 메시지 하나를 조회한 뒤 그 주변을 읽은 위치로 이동한 Context
(`purpose: "entry"`)로 연다. 조회가 끝나기 전에는 viewport 초기 이동과 새 read-state 보고를 보류한다.
`ChatMessageViewport`는 목표가 준비된 뒤 virtualization index로 이동하고, 목표 위치가 정착된
이후에만 기존 focus·visibility·overlay 판정을 다시 적용한다. 첫 안 읽은 메시지 조회에 실패하면 최신
메시지를 보여 주되 viewport 상단 안내의 다시 찾기 동작으로 위치를 찾기 전까지 새 read-state 보고를
보류하고, 그 사이 읽을 메시지가 없어졌으면 최신 위치로 연다. 자세한 흐름은
`docs/architecture/chat-room-unread-entry.md`에 둔다.
같은 hook이 Room 종료·멤버십 상실을 read-state terminal 신호로 변환하고, receipt snapshot의 self
membership 불일치에서는 generation별 한 번만 Room detail과 receipt를 함께 재조회한다. 재참여 후 새
실시간 generation이 준비되면 재개 가능한 terminal 또는 sequence-ahead 상태만 다시 연다.
`ChatRoomListView`와 `ChatRoomView`는 각 container가 만든 UI 전용 ViewModel과 callback 또는 ReactNode
slot을 공통 `PlatformShell`에 배치하는 View 경계다. 두 View는 `PlatformNavigationClient`를 하단 slot에
제공한다. `ChatRoomView`는 `PlatformHeader`에 `/chat` back action, 제목과 도메인 action을 전달한다.
최초 진입 중에는 실제 message viewport를 inert·비가시 상태로 배치해 초기 위치
측정은 허용하되 loading content가 이를 덮고, viewport의 위치 보정 완료 callback을 받은 뒤 완성된 화면을
한 번에 노출한다. 이때 read-state 보고는 실제 화면이 노출될 때까지 보류한다. overlay 존재 여부는
공통 surface의 inert 상태와 read-state pause 신호에 함께 전달한다. session indicator처럼 받은 값을
표시하는 내부 요소는 생략한다. `ChatRoomScreenHeaderActions`는 검색·채팅방 메뉴
trigger를 배치하고, `ChatRoomScreenOverlay`는 채팅방 메뉴와 메시지 action의 단일 overlay 우선순위를
표현한다. `ChatMessageViewport`는 virtualization, scroll anchoring, 이전 이력 조회와
focus·visibility·최신 위치·overlay 상태를 반영한 read-state 보고 생명주기를 소유한다. 검색 결과 이동
목표는 virtualization index의 중앙으로 정착시킨 뒤 focus하고, 최신 대화 복귀 시 원래 timeline
viewport key로 전환한다. 최초 목표가 비어 있으면 빈 viewport도 즉시 위치 준비 완료로 처리하고,
목표 위치의 측정·보정이 끝나면 해당 viewport key를 Screen에 알린다. system activity가 추가되면 viewport가 최신 위치에 고정된 경우에만 따라가며
새 메시지 수에는 포함하지 않는다. 이 책임 때문에 독립 Feature로 유지하고,
상단 loading/error, 이력 안내, 새 메시지 이동 버튼과 가상 row 선택 렌더링은
`chat-message-viewport-presentation.tsx`의 순수 표현 컴포넌트로 위임한다. 이 내부 표현 컴포넌트와
반복되는 개별 message item은 책임 경계를 새로 만들지 않으므로 트리에서는 생략한다.
Room detail 조회가 실패하면 `useChatRoomContentExperience`가 API 오류를 재시도 가능 여부와 사용자 안내 문구로
해석하고, `ChatRoomEntryError`가 일반 메시지 timeline 대신 공통 진입 오류 화면을 표시한다. 접근 종료·차단처럼
현재 화면에서 복구할 수 없는 오류는 채팅방 목록 이동을, 일시 조회 실패는 같은 자리의 명시적 재시도를 제공한다.

다른 탭 사용이나 연결 오류처럼 조치가 필요한 안내는 `ChatRoomSessionNotice`, snapshot 동기화
실패와 복구 동작은 `ChatRealtimeSyncStatus`가 담당한다. `ChatRoomSessionControls`는 해석된
session view와 message draft 동작을 조립하되 입력창에 별도 비활성 문구를 표시하지 않는다. 입력할 수 없는
상태의 placeholder는 사유와 관계없이 `채팅을 사용할 수 없습니다.`로 같고, 종료 같은 사유는
`ChatRoomSessionNotice`가 표시한다. `ChatMessageComposer`는 입력·전송 및 키보드 동작을
담당한다. 메시지 수정·삭제 lifecycle과 transport command는 `useChatRoomMessageExperience`가 조립하고,
선택된 메시지의 접근 가능한 modal 동작은 `ChatMessageActionsBottomSheet`가 담당한다.
`useChatRoomOverlayExperience`는 채팅방 메뉴·메시지 검색 disclosure, trigger focus 복원과
멤버십/메시지 액션의 단일 blocking overlay 우선순위를 조립한다. Screen은 이 controller가 제공한
header action과 overlay model을 View에 배치하고, `ChatRoomMembershipDialog` 안에서만
`ChatRoomMembershipPanel`을 mount한다. 검색 bar는 content 안에 유지되고 두 blocking overlay는
동시에 렌더링하지 않는다.
순수 overlay 선택 정책과 message history feedback 타입은 `.ts` ViewModel 모듈에 두어,
experience hook이 `.tsx` 표현 컴포넌트의 구현 타입을 역으로 참조하지 않게 한다.
`ChatRoomMembershipPanel`은 `useChatRoomMembershipPanel`이 조립한 controller를
`ChatRoomMembershipPanelView`에 전달하는 얇은 container다. controller hook은 Membership Query,
관리 mutation, 멱등성 key·재시도, 완료 라우팅을 소유하며 View에는 정규화된 목록 상태,
사용자 문구와 callback만 제공한다. View는 `ChatRoomInformationSection`을 제공하고, 보는 사용자가 ACTIVE Room의 ACTIVE 멤버일 때만
모든 ACTIVE membership의 profile 목록을 조회해 제공한다. BANNED 조회와 차단 해제 control은 활성 OWNER에게만 표시한다. LEFT membership은
조회하거나 렌더링하지 않는다. `ChatRoomInformationSection`은 모든 사용자에게 이름·설명 카드를
제공하고 활성 OWNER에게만 카드의 수정 action을 제공한다. 수정을 누르면 같은 자리에서
`ChatRoomSettingsControl`로 전환하고, 취소하면 카드로 돌아간다.
`ChatRoomSettingsControl`은 `useChatRoomSettingsControl`의 controller를 설정 View에 전달하는 container다.
controller hook은 이름·설명만 허용하는 draft, 부분 patch 계산, update-settings mutation과 멱등성 key 재시도를
소유한다. View는 별도 modal 없이 방 정보 카드 자리에 이름·설명 form과 취소 action을 표시하고,
canonical 값 기준 변경 여부에 따라 저장 action을 활성화한다.

## Route `/vote`, `/vote/[taskId]`, `/vote/[taskId]/result`

`VoteLayout`은 `VoteQueryProvider`를 `/vote` 하위 route 전체에 제공하고,
`ServiceEligibilityGuard`의 자격 확인 중에는 `VoteTaskListLoading`을 동일한 화면 fallback으로 유지한다.
`/vote/loading.tsx`는 pathname이 정확히 `/vote`일 때 `VoteTaskListScreen`을 cache-aware fallback으로
사용해 캐시된 투표 카드를 유지한 채 갱신하고, 캐시가 없는 최초 진입에서만 screen 내부 목록 skeleton을
표시한다. 이 fallback은 props 없이 렌더링되므로 `tab`, `query`, `view`와 관계없이 진행 중 탭의 캐시를
보여준다. 그 밖의 pathname에서는 `VoteTaskScreenLoading`을 선택한다. `/vote/[taskId]/loading.tsx`도 같은
상세 loading view를 사용하며, 이 segment loading은 하위 `/vote/[taskId]/result`에도 적용되므로 결과 route의
loading도 참여 1/4 skeleton으로 표시된다. `VoteTaskScreen`의 최초 상세 Query 대기도 같은 1/4 구조와 4개 선택지 placeholder를 재사용한다.
Provider는 Vote 전용 `QueryClient`와 인증 사용자 전환 시 cache 경계를 소유한다. 각 Vote screen container는 자체
`PlatformShell`, `PlatformHeader`, `PlatformNavigationClient`를 조립한다. `/vote`의
`VotePage`는 `tab`, `query`, `view` search param을 검증해 진행 중·완료 탭, 검색어와 목록·검색 결과
view 초기값을 정규화한다.
`VoteTaskListScreen`은 검색 실행과 진행 중·완료 필터 및 URL 동기화를 소유한다. 목록을 내려 검색창과 탭 form이
화면 밖으로 나가면 shell의 `contentTopAction` slot에 전달한 `PlatformScrollTopButton`이 header 아래에
나타나고, 누르면 content 스크롤을 맨 위로 올린다. 완료 탭과 검색 결과의 다음 cursor 페이지는 목록 끝에 가까워지면
자동으로 이어 받고, 다음 페이지 요청이 실패했을 때만 오류 안내에 더 보기 버튼을 보여 준다. 모든 페이지를
받으면 탭별 마무리 문구를 목록 끝에 표시한다. `view`가 지정되지 않으면
검색어가 있을 때 검색 결과 view, 없을 때 목록 view로 시작한다. 목록 view에서는 선택한 탭의 목록 Query를
카드 view model로 변환하고, 검색 결과 view에서는 두 탭의 Query를 비활성화한 뒤 통합 검색 Infinite Query로
서버 정렬 순서대로 진행 중·완료 결과와 cursor pagination을 표시한다. 통합 검색 Query는 view와 관계없이
검색어가 있으면 활성화된다. 검색 결과
탭은 검색어 유무와 관계없이 고정 노출하고, 검색어가 없으면 API를 호출하지 않은 채 빈 검색 결과 상태를
표시한다. 검색어가 남아 있는 동안 진행 중·완료 목록으로 전환해도 검색어를 보존하며, 검색 결과 탭을 다시
선택하면 cache된 통합 결과로 복귀한다. `NEXT_PUBLIC_VOTE_COMPLETED_API_MODE`가 `unavailable`이면 완료 Query를 비활성화하고
준비 중 상태를 표시한다. 기본값은 `ready`이고 `mock`도 선택할 수 있다. `NODE_ENV`가 `production`이 아닐 때만
publishing 디자인 샘플 카드를 실제 데이터와 구분해 제공한다.

`VoteTaskScreen`은 controller가 제공하는 화면 model과 action으로 실제 질문·선택지, 1/4 과업 확인부터
4/4 참여 완료까지의 단계 view와 종료 bottom sheet를 조립한다. 최초 상세 Query가 pending이면
`VoteTaskScreenLoading`을 반환하고, 종료 확인 bottom sheet는 열렸을 때만 `PlatformShell`의 overlay slot에
전달한다. `useVoteTaskController`는 Task 상세·제출
Query, Prediction 상태 조회·생성·polling coordinator, Task 멱등 제출 mutation, 이미 제출된 Task 복구 경로의
query invalidation과 analytics 같은 부수효과를 소유한다. 정상 제출 뒤의 Task 관련 query 갱신은
`useSubmitTaskMutation`의 `onSuccess`가 담당한다. `vote-task-flow.ts`의 순수 reducer는 local draft, 단계 전이와
복구 가능한 제출 상태를 관리하고, `vote-submission-recovery.ts`는 제출 오류를 side effect 없는 복구
정책으로 분류한다. `vote-task-participation-presentation.ts`는 Prediction 준비 상태와 제출 오류를 사용자
안내 문구로 변환한다. 사용자 UUID가 설정된 방문에 대해서는 단계별 최초 노출, Prediction 참여 가능 상태의
최초 노출과 실제 제출 시도를 GA custom event로 기록한다.
Vote 목록·참여·제출 응답·결과 screen의 사용자 노출 조회 실패와 Prediction 최종 실패, 제출 실패는
공통 failure analytics로 기록하고, 같은 방문에서 재조회·Prediction 준비·멱등 제출이 성공한 경우에만
복구를 기록한다. Prediction polling의 대기 상태와 자동 복구되는 중간 오류는 실패로 세지 않는다.
Prediction 조회·생성 실패에는 사용자 주도의 재시도를 제공하고,
session storage에 남은 미확정 제출은 자동 전송하지 않고 동일 key·body 재제출 또는 새 작성 선택을 받는다.
이미 제출한 열린 Task로 재진입하면 Task 기준 내 제출 Query를 활성화하고, 단계 진행 표시 없이 header 제목을
`제출 완료`로 바꾼 읽기 전용 응답 확인 화면을 참여 폼 대신 조립한다. 참여 가능 여부는 Prediction capability를 그대로 사용하고, 제출 요청은 선택한
option과 `AI_ACCEPTED`의 predicted reason ID 또는 `USER_WRITTEN`의 직접 입력 이유만 전달한다. Persona,
Prediction, Question 식별자는 Backend가 현재 상태에서 결정한다. `VoteTaskResultScreen`은 완료 API mode가
`unavailable`이면 준비 중 상태를 표시한다. `NODE_ENV`가 `production`이 아닐 때만 허용되는 `source=mock` 진입은 실제 API를 호출하지 않고 publishing
결과 샘플을 같은 view model로 변환해 그래프 시각 검수에 사용한다. 정성 요약의 AI 뱃지는 기본적으로 숨기며,
개발 전용 mock에서 `aiBadge=on`을 함께 지정한 경우에만 표시해 비교할 수 있다. 같은 mock에서
`opinionMap=pending`을 지정하면 의견 지도를 준비 중 상태로 표시한다. Vote API client와 query hook은
Provider가 제공하는 client cache를 공유한다.

```text
RootLayout [Server] [Route] (apps/web/app/layout.tsx)
└── AppShell [Server] [Runtime] (apps/web/components/app-shell.tsx) — 전역 runtime은 Route `/` 트리 참고
    └── AppUpdateGate [Client] [Feature] [conditional] (apps/web/components/app-update-gate.tsx)
        └── AuthenticationLifecycleBoundary [Client] [Boundary] (apps/web/components/authentication-lifecycle-boundary.tsx)
            └── children [slot: App Router가 route child를 제공]
                └── VoteLayout [Server] [Route] (apps/web/app/vote/layout.tsx)
                    └── VoteQueryProvider [Client] [Provider] (apps/web/components/vote/vote-query-provider.tsx)
                        └── ServiceEligibilityGuard [Client] [Boundary] (apps/web/components/service-eligibility-guard.tsx)
                            ├── VoteTaskListLoading [Server-compatible] [View] [conditional: 자격 확인 중] (apps/web/components/vote/vote-task-list-loading.tsx) — `loadingFallback`
                            ├── ServiceEligibilityStatus [Client] [View] [conditional: 자격 조회 실패 또는 필수 설문 이동 중] (apps/web/components/service-eligibility-guard.tsx)
                            └── children [slot: nested page를 제공]
                                ├── route segment loading: VoteLoading [Client] [Route] (apps/web/app/vote/loading.tsx) — pathname으로 fallback 선택
                                │   ├── VoteTaskListScreen [Client] [Container] [conditional: pathname `/vote`] — cache-aware fallback
                                │   └── VoteTaskScreenLoading [Server-compatible] [View] [conditional: 그 밖의 pathname] (apps/web/components/vote/vote-task-screen-loading.tsx)
                                ├── route /vote: VotePage [Server] [Route] (apps/web/app/vote/page.tsx) — `tab`, `query`, `view` search param 정규화
                                │   └── VoteTaskListScreen [Client] [Container] (apps/web/components/vote/vote-task-list-screen.tsx)
                                │       └── PlatformShell [Server-compatible] [View]
                                │           └── PlatformScrollTopButton [Client] [Feature] [slot: contentTopAction] (apps/web/components/platform-shell/platform-scroll-top-button.tsx) — 검색창·탭이 화면 밖일 때 표시
                                └── segment /vote/[taskId]
                                    ├── route segment loading: VoteTaskLoading [Server] [Route] (apps/web/app/vote/[taskId]/loading.tsx) — `/result`에도 적용
                                    │   └── VoteTaskScreenLoading [Server-compatible] [View]
                                    ├── route /vote/[taskId]: VoteTaskPage [Server] [Route] (apps/web/app/vote/[taskId]/page.tsx)
                                    │   └── VoteTaskScreen [Client] [Container] (apps/web/components/vote/vote-task-screen.tsx)
                                    │       ├── VoteTaskScreenLoading [Server-compatible] [View] [conditional: 최초 상세 Query pending]
                                    │       └── PlatformShell [Server-compatible] [View] — 종료 확인 bottom sheet를 조건부 overlay로 전달
                                    └── route /vote/[taskId]/result: VoteTaskResultPage [Server] [Route] (apps/web/app/vote/[taskId]/result/page.tsx)
                                        └── VoteTaskResultScreen [Client] [Container] (apps/web/components/vote/vote-task-result-screen.tsx)
                                            └── PlatformShell [Server-compatible] [View]
```

## App Router special UI

다음 파일은 일반 route page가 아니라 root app segment에 연결된 App Router special file이다. 어떤 boundary와 runtime 상태에서 실제로 선택되는지는 Next.js가 관리하며, 프로젝트 소스에는 이들을 `RootLayout`이나 `AppShell`이 직접 JSX 자식으로 호출하는 관계가 없다. 따라서 아래 항목은 직접 부모를 추정하지 않고 독립된 framework-managed branch로 표시한다.

```text
Loading [Server] [Route] [conditional: loading state]
(apps/web/app/loading.tsx)

ErrorPage [Client] [Route] [conditional: uncaught route error]
(apps/web/app/error.tsx)

NotFound [Server] [Route] [conditional: unmatched route 또는 notFound()]
(apps/web/app/not-found.tsx)
└── PlatformPageShell [Server-compatible] [View]
    └── PlatformShell [Server-compatible] [View] [scroll: self]
        ├── PlatformHeader [Server-compatible] [View]
        └── PlatformNavigationClient [Client] [View]
            ├── ParticipantSwipeNavigationController [Client] [Adapter] [active: /chat/**, /vote/**]
            └── PlatformNavigation [Client] [View]
                └── PlatformBottomNavigation [Client graph] [View]
```

`Loading`과 `ErrorPage`는 프로젝트에서 정의한 다른 React 컴포넌트를 렌더링하지 않는다.
`NotFound`는 일반 플랫폼 화면과 같은 shell을 사용하고 `/home`으로 이동할 수 있는 header
back action과 본문 link를 제공한다. 하단 내비게이션의 active item은 현재 pathname으로 정해진다.
일치하는 route가 없는 pathname에서는 active item이 없다. 반면 `/chat/[roomId]`,
`/chat/creation-requests/[creationRequestId]`, `/vote/[taskId]`, `/vote/[taskId]/result` page가
`notFound()`를 호출하면 하위 `not-found.tsx`가 없으므로 root `NotFound`가 렌더링된다. 이때 pathname은
그대로 남아 토론방 또는 투표 item이 active로 표시되고, swipe navigation도 동작한다.

## 전체 component dependency graph

실선은 주요 책임 경계 사이의 논리적 조립 관계다. 중간의 순수 표현용 컴포넌트는 생략될 수
있으므로 실선이 항상 실제 React parent-child 관계를 뜻하지는 않는다. 점선은 App Router 또는
`children` slot이 런타임에 결정하는 관계다.

`PlatformShell`은 설정별로 세 노드(`scroll: self`, `scroll: child`, Survey의 `scroll: child`와
bottom navigation 생략)로 나누어 공통 header·bottom navigation 조립만 표시하고, 화면별 content와 overlay는
해당 View에서 직접 잇는다. `ServiceEligibilityGuard`와 `VoteQueryProvider`처럼 여러 route가 쓰는
컴포넌트는 route마다 별도 노드로 두어 다른 route의 분기가 섞이지 않게 한다. 노드 색은 실행 환경 태그를
따른다.

```mermaid
flowchart TD
    RootLayout["RootLayout [Server] [Route]<br/>apps/web/app/layout.tsx"]
    GoogleAnalytics["GoogleAnalytics [Client] [Runtime] [conditional: production]<br/>@next/third-parties/google"]
    AppShell["AppShell [Server] [Runtime]<br/>apps/web/components/app-shell.tsx"]
    GoogleAnalyticsUserIdentity["GoogleAnalyticsUserIdentity [Client] [Runtime] [conditional: production]<br/>apps/web/components/google-analytics-user-identity.tsx"]
    NativeBridgeRuntime["NativeBridgeRuntime [Client] [Runtime]<br/>apps/web/components/native-bridge-runtime.tsx"]
    AppUpdateGate["AppUpdateGate [Client] [Feature] [conditional]<br/>apps/web/components/app-update-gate.tsx"]
    AuthenticationLifecycleBoundary["AuthenticationLifecycleBoundary [Client] [Boundary]<br/>apps/web/components/authentication-lifecycle-boundary.tsx"]
    ChildrenSlot["children slot<br/>App Router가 실제 자식을 결정"]

    IndexPage["IndexPage [Server] [Route] [redirect: /home]<br/>apps/web/app/page.tsx"]
    HomePage["HomePage [Server] [Route]<br/>apps/web/app/home/page.tsx"]
    ParticipantHome["ParticipantHome [Server] [View]<br/>apps/web/components/participant-home.tsx"]
    LocalE2ELoginControl["LocalE2ELoginControl [Client] [Feature] [conditional: non-production]<br/>apps/web/components/local-e2e-login-control.tsx"]
    PlatformPageShell["PlatformPageShell [Server-compatible] [View]<br/>apps/web/components/platform-page-shell.tsx"]
    SelfScrollPlatformShell["PlatformShell [Server-compatible] [View] [scroll: self]<br/>apps/web/components/platform-shell/platform-shell.tsx"]
    ChildScrollPlatformShell["PlatformShell [Server-compatible] [View] [scroll: child]<br/>apps/web/components/platform-shell/platform-shell.tsx"]
    SurveyPlatformShell["PlatformShell [Server-compatible] [View] [scroll: child] [bottom navigation: omitted]<br/>apps/web/components/platform-shell/platform-shell.tsx"]
    PlatformShellVisualViewportBoundary["PlatformShellVisualViewportBoundary [Client] [Runtime]<br/>apps/web/components/platform-shell/platform-shell-visual-viewport-boundary.tsx"]
    PlatformHeader["PlatformHeader [Server-compatible] [View]<br/>apps/web/components/platform-shell/platform-header.tsx"]
    PlatformNavigationClient["PlatformNavigationClient [Client] [View]<br/>apps/web/components/platform-navigation-client.tsx"]
    ParticipantSwipeNavigationController["ParticipantSwipeNavigationController [Client] [Adapter] [active: /chat/**, /vote/**]<br/>apps/web/components/participant-swipe-navigation-controller.tsx"]
    PlatformNavigation["PlatformNavigation [Client] [View]<br/>apps/web/components/platform-shell/platform-navigation.tsx"]
    PlatformBottomNavigation["PlatformBottomNavigation [Client graph] [View]<br/>apps/web/components/platform-shell/platform-bottom-navigation.tsx"]

    ChatLayout["ChatLayout [Server] [Route]<br/>apps/web/app/chat/layout.tsx"]
    ChatQueryProvider["ChatQueryProvider [Client] [Provider]<br/>apps/web/components/chat/chat-query-provider.tsx"]
    ChatAuthenticationBoundary["ChatAuthenticationBoundary [Client] [Boundary]<br/>apps/web/components/chat/chat-authentication-boundary.tsx"]
    ChatAuthenticationRecoveryView["ChatAuthenticationRecoveryView [Client] [View] [conditional]<br/>apps/web/components/chat/chat-authentication-boundary.tsx"]
    ChatServiceEligibilityGuard["ServiceEligibilityGuard [Client] [Boundary]<br/>apps/web/components/service-eligibility-guard.tsx"]
    ServiceEligibilityStatus["ServiceEligibilityStatus [Client] [View] [conditional]<br/>apps/web/components/service-eligibility-guard.tsx"]
    ChatRealtimeProvider["ChatRealtimeProvider [Client] [Provider]<br/>apps/web/components/chat/chat-realtime-provider.tsx"]
    ChatRoomReadStateProvider["ChatRoomReadStateProvider [Client] [Provider]<br/>apps/web/components/chat/chat-room-read-state-provider.tsx"]
    ChatRealtimeDiagnosticsPanel["ChatRealtimeDiagnosticsPanel [Client] [Feature] [conditional: development]<br/>apps/web/components/chat/chat-realtime-diagnostics-panel.tsx"]
    ChatRoomInboxRuntime["ChatRoomInboxRuntime [Client] [Runtime]<br/>apps/web/components/chat/chat-room-inbox-runtime.tsx"]
    ChatRoomInboxToastList["ChatRoomInboxToastList [Client] [View] [conditional]<br/>apps/web/components/chat/chat-room-inbox-toast-list.tsx"]
    ChatChildrenSlot["chat children slot<br/>nested page를 제공"]
    ChatLoading["ChatLoading [Client] [Route]<br/>apps/web/app/chat/loading.tsx"]
    ChatRoomListLoading["ChatRoomListLoading [Server-compatible] [View] [conditional]<br/>apps/web/components/chat/chat-room-list-loading.tsx"]
    ChatRoomScreenLoading["ChatRoomScreenLoading [Server-compatible] [View] [conditional]<br/>apps/web/components/chat/chat-room-screen-loading.tsx"]
    ChatPage["ChatPage [Server] [Route]<br/>apps/web/app/chat/page.tsx"]
    ChatRoomListScreen["ChatRoomListScreen [Client] [Container]<br/>apps/web/components/chat/chat-room-list-screen.tsx"]
    ChatRoomListView["ChatRoomListView [Client] [View]<br/>apps/web/components/chat/chat-room-list-view.tsx"]
    PublicRoomSearchForm["PublicRoomSearchForm [Client] [Feature]<br/>apps/web/components/chat/public-room-search-form.tsx"]
    CreateChatRoomForm["CreateChatRoomForm [Client] [Feature] [conditional]<br/>apps/web/components/chat/create-chat-room-form.tsx"]
    RoomCreationRequestListContent["RoomCreationRequestListContent [Client] [View] [conditional]<br/>apps/web/components/chat/room-creation-request-list-view.tsx"]
    ChatRoomListDetailDialog["ChatRoomListDetailDialog [Client] [Feature] [conditional]<br/>apps/web/components/chat/chat-room-list-detail-dialog.tsx"]
    JoinChatRoomControl["JoinChatRoomControl [Client] [Feature] [conditional]<br/>apps/web/components/chat/join-chat-room-control.tsx"]
    LegacyRoomCreationRequestsPage["LegacyRoomCreationRequestsPage [Server] [Route] [redirect: /chat]<br/>apps/web/app/chat/creation-requests/page.tsx"]
    RoomCreationRequestPage["RoomCreationRequestPage [Server] [Route]<br/>apps/web/app/chat/creation-requests/[creationRequestId]/page.tsx"]
    RoomCreationRequestScreen["RoomCreationRequestScreen [Client] [Container]<br/>apps/web/components/chat/room-creation-request-screen.tsx"]
    RoomCreationRequestView["RoomCreationRequestView [Client] [View]<br/>apps/web/components/chat/room-creation-request-view.tsx"]
    ChatRoomLoading["ChatRoomLoading [Server] [Route]<br/>apps/web/app/chat/[roomId]/loading.tsx"]
    ChatRoomPage["ChatRoomPage [Server] [Route]<br/>apps/web/app/chat/[roomId]/page.tsx"]
    ChatRoomScreen["ChatRoomScreen [Client] [Container]<br/>apps/web/components/chat/chat-room-screen.tsx"]
    ChatRoomView["ChatRoomView [Client] [View]<br/>apps/web/components/chat/chat-room-view.tsx"]
    ChatRoomEntryError["ChatRoomEntryError [Client graph] [View] [conditional]<br/>apps/web/components/chat/chat-room-entry-error.tsx"]
    ChatMessageViewport["ChatMessageViewport [Client] [Feature] [conditional: Room 오류 없음]<br/>apps/web/components/chat/chat-message-viewport.tsx"]
    ChatRoomSessionNotice["ChatRoomSessionNotice [Client graph] [Feature] [conditional] [slot: sessionNotice]<br/>apps/web/components/chat/chat-room-session-status.tsx"]
    ChatRealtimeSyncStatus["ChatRealtimeSyncStatus [Client] [Feature] [conditional] [slot: syncStatus]<br/>apps/web/components/chat/chat-realtime-sync-status.tsx"]
    ChatRoomSessionControls["ChatRoomSessionControls [Client] [Feature] [slot: sessionControls]<br/>apps/web/components/chat/chat-room-session-controls.tsx"]
    ChatMessageComposer["ChatMessageComposer [Client] [Feature]<br/>apps/web/components/chat/chat-message-composer.tsx"]
    ChatRoomScreenHeaderActions["ChatRoomScreenHeaderActions [Client] [View] [conditional] [slot: headerAction]<br/>apps/web/components/chat/chat-room-screen-overlays.tsx"]
    ChatRoomScreenMessageSearchPanel["ChatRoomScreenMessageSearchPanel [Client] [View] [conditional] [slot: messageSearchPanel]<br/>apps/web/components/chat/chat-room-screen-overlays.tsx"]
    ChatRoomMessageSearchPanel["ChatRoomMessageSearchPanel [Client] [Feature]<br/>apps/web/components/chat/chat-room-message-search-dialog.tsx"]
    ChatRoomScreenOverlay["ChatRoomScreenOverlay [Client] [View] [conditional] [slot: overlay]<br/>apps/web/components/chat/chat-room-screen-overlays.tsx"]
    ChatMessageActionsBottomSheet["ChatMessageActionsBottomSheet [Client] [Feature] [conditional]<br/>apps/web/components/chat/chat-message-actions-bottom-sheet.tsx"]
    ChatRoomMembershipDialog["ChatRoomMembershipDialog [Client] [Feature] [conditional]<br/>apps/web/components/chat/chat-room-membership-dialog.tsx"]
    ChatRoomMembershipPanel["ChatRoomMembershipPanel [Client] [Container]<br/>apps/web/components/chat/chat-room-membership-panel.tsx"]
    ChatRoomMembershipPanelView["ChatRoomMembershipPanelView [Client] [View]<br/>apps/web/components/chat/chat-room-membership-panel.tsx"]
    ChatRoomInformationSection["ChatRoomInformationSection [Client] [Feature]<br/>apps/web/components/chat/chat-room-settings-control.tsx"]
    ChatRoomSettingsControl["ChatRoomSettingsControl [Client] [Container] [conditional: 활성 OWNER 편집 중]<br/>apps/web/components/chat/chat-room-settings-control.tsx"]
    ChatRoomSettingsControlView["ChatRoomSettingsControlView [Client] [View]<br/>apps/web/components/chat/chat-room-settings-control.tsx"]

    VoteLayout["VoteLayout [Server] [Route]<br/>apps/web/app/vote/layout.tsx"]
    VoteQueryProvider["VoteQueryProvider [Client] [Provider]<br/>apps/web/components/vote/vote-query-provider.tsx"]
    VoteServiceEligibilityGuard["ServiceEligibilityGuard [Client] [Boundary]<br/>apps/web/components/service-eligibility-guard.tsx"]
    VoteTaskListLoading["VoteTaskListLoading [Server-compatible] [View] [conditional]<br/>apps/web/components/vote/vote-task-list-loading.tsx"]
    VoteChildrenSlot["vote children slot<br/>nested page를 제공"]
    VoteLoading["VoteLoading [Client] [Route]<br/>apps/web/app/vote/loading.tsx"]
    VoteTaskScreenLoading["VoteTaskScreenLoading [Server-compatible] [View] [conditional]<br/>apps/web/components/vote/vote-task-screen-loading.tsx"]
    VotePage["VotePage [Server] [Route]<br/>apps/web/app/vote/page.tsx"]
    VoteTaskListScreen["VoteTaskListScreen [Client] [Container]<br/>apps/web/components/vote/vote-task-list-screen.tsx"]
    PlatformScrollTopButton["PlatformScrollTopButton [Client] [Feature] [slot: contentTopAction]<br/>apps/web/components/platform-shell/platform-scroll-top-button.tsx"]
    VoteTaskLoading["VoteTaskLoading [Server] [Route]<br/>apps/web/app/vote/[taskId]/loading.tsx"]
    VoteTaskPage["VoteTaskPage [Server] [Route]<br/>apps/web/app/vote/[taskId]/page.tsx"]
    VoteTaskScreen["VoteTaskScreen [Client] [Container]<br/>apps/web/components/vote/vote-task-screen.tsx"]
    VoteTaskResultPage["VoteTaskResultPage [Server] [Route]<br/>apps/web/app/vote/[taskId]/result/page.tsx"]
    VoteTaskResultScreen["VoteTaskResultScreen [Client] [Container]<br/>apps/web/components/vote/vote-task-result-screen.tsx"]

    SurveyLayout["SurveyLayout [Server] [Route]<br/>apps/web/app/survey/layout.tsx"]
    SurveyQueryProvider["VoteQueryProvider [Client] [Provider]<br/>apps/web/components/vote/vote-query-provider.tsx"]
    SurveyChildrenSlot["survey children slot<br/>nested page를 제공"]
    SurveyLoading["SurveyLoading [Server] [Route]<br/>apps/web/app/survey/loading.tsx"]
    SurveyScreenLoading["SurveyScreenLoading [Server-compatible] [View]<br/>apps/web/components/survey/survey-loading.tsx"]
    SurveyLoadingStatus["SurveyLoadingStatus [Server-compatible] [View]<br/>apps/web/components/survey/survey-loading.tsx"]
    SurveyPage["SurveyPage [Server] [Route]<br/>apps/web/app/survey/page.tsx"]
    SurveyScreen["SurveyScreen [Client] [Container]<br/>apps/web/components/survey/survey-screen.tsx"]
    SurveyHeaderProgress["SurveyHeaderProgress [Client graph] [View] [conditional]<br/>apps/web/components/survey/survey-flow.tsx"]
    SurveyForm["SurveyForm [Client] [Feature] [conditional: PENDING]<br/>apps/web/components/survey/survey-screen.tsx"]
    SurveySectionFields["SurveySectionFields [Client graph] [Feature] [conditional: Section 단계]<br/>apps/web/components/survey/survey-question-fields.tsx"]
    SurveySelect["SurveySelect [Client] [Control]<br/>apps/web/components/survey/survey-select.tsx"]
    SurveyMultiSelect["SurveyMultiSelect [Client] [Control]<br/>apps/web/components/survey/survey-multi-select.tsx"]
    SurveyDropdownSurface["SurveyDropdownSurface [Client] [View]<br/>apps/web/components/survey/survey-dropdown.tsx"]
    ResidenceAddressField["ResidenceAddressField [Client] [Feature] [conditional: demographics.residence]<br/>apps/web/components/survey/residence-address-field.tsx"]
    KakaoPostcodeDialog["KakaoPostcodeDialog [Client] [Feature] [conditional]<br/>apps/web/components/survey/kakao-postcode-dialog.tsx"]
    SurveyConfirmation["SurveyConfirmation [Client] [View] [conditional: 확인 단계]<br/>apps/web/components/survey/survey-screen.tsx"]
    SurveySubmissionCompletion["SurveySubmissionCompletion [Client graph] [Feature] [conditional: 제출 결과 있음]<br/>apps/web/components/survey/survey-submission-completion.tsx"]

    SpecialBoundary["App Router root-segment special UI<br/>framework-managed; direct JSX parent 미확정"]
    Loading["Loading [Server] [Route] [conditional]<br/>apps/web/app/loading.tsx"]
    ErrorPage["ErrorPage [Client] [Route] [conditional]<br/>apps/web/app/error.tsx"]
    NotFound["NotFound [Server] [Route] [conditional]<br/>apps/web/app/not-found.tsx"]

    RootLayout --> AppShell
    RootLayout -->|"production only"| GoogleAnalytics
    AppShell -->|"production only"| GoogleAnalyticsUserIdentity
    AppShell --> NativeBridgeRuntime
    AppShell -->|"update policy branch"| AppUpdateGate
    AppUpdateGate --> AuthenticationLifecycleBoundary
    AuthenticationLifecycleBoundary --> ChildrenSlot

    SelfScrollPlatformShell --> PlatformShellVisualViewportBoundary
    SelfScrollPlatformShell -->|"header slot"| PlatformHeader
    SelfScrollPlatformShell -->|"bottom navigation slot"| PlatformNavigationClient
    ChildScrollPlatformShell --> PlatformShellVisualViewportBoundary
    ChildScrollPlatformShell -->|"header slot"| PlatformHeader
    ChildScrollPlatformShell -->|"bottom navigation slot"| PlatformNavigationClient
    SurveyPlatformShell --> PlatformShellVisualViewportBoundary
    SurveyPlatformShell -->|"header slot"| PlatformHeader
    PlatformNavigationClient --> ParticipantSwipeNavigationController
    PlatformNavigationClient --> PlatformNavigation
    PlatformNavigation --> PlatformBottomNavigation

    ChildrenSlot -. "route /" .-> IndexPage
    ChildrenSlot -. "route /home" .-> HomePage
    HomePage --> PlatformPageShell
    HomePage --> ParticipantHome
    HomePage -->|"non-production only"| LocalE2ELoginControl
    PlatformPageShell --> SelfScrollPlatformShell

    ChildrenSlot -. "route /chat" .-> ChatLayout
    ChatLayout --> ChatQueryProvider
    ChatQueryProvider --> ChatAuthenticationBoundary
    ChatAuthenticationBoundary -->|"401 recovery checking or failed"| ChatAuthenticationRecoveryView
    ChatAuthenticationBoundary -->|"refresh rejected"| PlatformPageShell
    ChatAuthenticationRecoveryView --> PlatformPageShell
    ChatAuthenticationBoundary -->|"not 401"| ChatServiceEligibilityGuard
    ChatServiceEligibilityGuard -->|"checking"| ChatRoomListLoading
    ChatServiceEligibilityGuard -->|"error or survey redirect"| ServiceEligibilityStatus
    ServiceEligibilityStatus --> PlatformPageShell
    ChatServiceEligibilityGuard -->|"eligible"| ChatRealtimeProvider
    ChatRoomListLoading --> SelfScrollPlatformShell
    ChatRealtimeProvider --> ChatRoomReadStateProvider
    ChatRoomReadStateProvider --> ChatChildrenSlot
    ChatRealtimeProvider --> ChatRoomInboxRuntime
    ChatRealtimeProvider -->|"development only"| ChatRealtimeDiagnosticsPanel
    ChatRoomInboxRuntime -->|"conditional toast"| ChatRoomInboxToastList
    ChatChildrenSlot -. "route segment loading" .-> ChatLoading
    ChatLoading -->|"list or non-room path; cached data retained"| ChatRoomListScreen
    ChatLoading -->|"room detail path"| ChatRoomScreenLoading
    ChatRoomScreenLoading --> ChildScrollPlatformShell
    ChatChildrenSlot -. "route /chat" .-> ChatPage
    ChatChildrenSlot -. "legacy redirect" .-> LegacyRoomCreationRequestsPage
    ChatChildrenSlot -. "route /chat/creation-requests/[creationRequestId]" .-> RoomCreationRequestPage
    ChatChildrenSlot -. "route segment loading /chat/[roomId]" .-> ChatRoomLoading
    ChatChildrenSlot -. "route /chat/[roomId]" .-> ChatRoomPage
    ChatRoomLoading --> ChatRoomScreenLoading
    ChatPage --> ChatRoomListScreen
    ChatRoomListScreen --> ChatRoomListView
    ChatRoomListView --> SelfScrollPlatformShell
    ChatRoomListView --> PublicRoomSearchForm
    ChatRoomListView -->|"overlay slot; surface inert"| CreateChatRoomForm
    CreateChatRoomForm -->|"request history view"| RoomCreationRequestListContent
    ChatRoomListView -->|"overlay slot; surface inert"| ChatRoomListDetailDialog
    ChatRoomListDetailDialog -->|"available room action"| JoinChatRoomControl
    RoomCreationRequestPage --> RoomCreationRequestScreen
    RoomCreationRequestScreen --> RoomCreationRequestView
    ChatRoomPage --> ChatRoomScreen
    ChatRoomScreen --> ChatRoomView
    ChatRoomView --> ChildScrollPlatformShell
    ChatRoomView -->|"room detail error"| ChatRoomEntryError
    ChatRoomView -->|"no room error"| ChatMessageViewport
    ChatRoomScreen -->|"sessionNotice slot"| ChatRoomSessionNotice
    ChatRoomScreen -->|"syncStatus slot"| ChatRealtimeSyncStatus
    ChatRoomScreen -->|"sessionControls slot"| ChatRoomSessionControls
    ChatRoomSessionControls --> ChatMessageComposer
    ChatRoomScreen -->|"headerAction slot"| ChatRoomScreenHeaderActions
    ChatRoomScreen -->|"messageSearchPanel slot"| ChatRoomScreenMessageSearchPanel
    ChatRoomScreenMessageSearchPanel --> ChatRoomMessageSearchPanel
    ChatRoomScreen -->|"overlay slot; one blocking overlay"| ChatRoomScreenOverlay
    ChatRoomScreenOverlay -->|"one selected message"| ChatMessageActionsBottomSheet
    ChatRoomScreenOverlay -->|"room menu disclosure"| ChatRoomMembershipDialog
    ChatRoomMembershipDialog --> ChatRoomMembershipPanel
    ChatRoomMembershipPanel --> ChatRoomMembershipPanelView
    ChatRoomMembershipPanelView --> ChatRoomInformationSection
    ChatRoomInformationSection -->|"active OWNER editing"| ChatRoomSettingsControl
    ChatRoomSettingsControl --> ChatRoomSettingsControlView

    ChildrenSlot -. "route /vote" .-> VoteLayout
    VoteLayout --> VoteQueryProvider
    VoteQueryProvider --> VoteServiceEligibilityGuard
    VoteServiceEligibilityGuard -->|"checking"| VoteTaskListLoading
    VoteServiceEligibilityGuard -->|"error or survey redirect"| ServiceEligibilityStatus
    VoteServiceEligibilityGuard -->|"eligible"| VoteChildrenSlot
    VoteTaskListLoading --> SelfScrollPlatformShell
    VoteChildrenSlot -. "route segment loading" .-> VoteLoading
    VoteLoading -->|"pathname /vote; cached data retained"| VoteTaskListScreen
    VoteLoading -->|"other pathname"| VoteTaskScreenLoading
    VoteTaskScreenLoading --> SelfScrollPlatformShell
    VoteChildrenSlot -. "route /vote" .-> VotePage
    VotePage --> VoteTaskListScreen
    VoteTaskListScreen --> SelfScrollPlatformShell
    VoteTaskListScreen -->|"contentTopAction"| PlatformScrollTopButton
    VoteChildrenSlot -. "route segment loading /vote/[taskId]; also /result" .-> VoteTaskLoading
    VoteTaskLoading --> VoteTaskScreenLoading
    VoteChildrenSlot -. "route /vote/[taskId]" .-> VoteTaskPage
    VoteTaskPage --> VoteTaskScreen
    VoteTaskScreen -->|"detail pending"| VoteTaskScreenLoading
    VoteTaskScreen --> SelfScrollPlatformShell
    VoteChildrenSlot -. "route /vote/[taskId]/result" .-> VoteTaskResultPage
    VoteTaskResultPage --> VoteTaskResultScreen
    VoteTaskResultScreen --> SelfScrollPlatformShell

    ChildrenSlot -. "route /survey" .-> SurveyLayout
    SurveyLayout --> SurveyQueryProvider
    SurveyQueryProvider --> SurveyChildrenSlot
    SurveyChildrenSlot -. "route segment loading" .-> SurveyLoading
    SurveyLoading --> SurveyScreenLoading
    SurveyScreenLoading --> SurveyPlatformShell
    SurveyScreenLoading --> SurveyLoadingStatus
    SurveyChildrenSlot -. "route /survey" .-> SurveyPage
    SurveyPage --> SurveyScreen
    SurveyScreen --> SurveyPlatformShell
    SurveyScreen -->|"header actions"| SurveyHeaderProgress
    SurveyScreen -->|"current survey pending"| SurveyLoadingStatus
    SurveyScreen -->|"PENDING"| SurveyForm
    SurveyScreen -->|"submission result"| SurveySubmissionCompletion
    SurveyForm -->|"Section step"| SurveySectionFields
    SurveyForm -->|"confirmation step"| SurveyConfirmation
    SurveySectionFields --> SurveySelect
    SurveySectionFields --> SurveyMultiSelect
    SurveySectionFields -->|"residence question"| ResidenceAddressField
    ResidenceAddressField -->|"postcode search open"| KakaoPostcodeDialog
    SurveySelect --> SurveyDropdownSurface
    SurveyMultiSelect --> SurveyDropdownSurface

    SpecialBoundary -. "loading state" .-> Loading
    SpecialBoundary -. "error state" .-> ErrorPage
    SpecialBoundary -. "not-found state" .-> NotFound
    NotFound --> PlatformPageShell

    classDef server fill:#e8f1ff,stroke:#2563eb,color:#172554;
    classDef serverCompatible fill:#ecfdf5,stroke:#059669,color:#064e3b;
    classDef client fill:#fff1e6,stroke:#ea580c,color:#431407;
    classDef clientGraph fill:#fefce8,stroke:#ca8a04,color:#422006;
    classDef framework fill:#f3f4f6,stroke:#6b7280,color:#111827,stroke-dasharray:5 5;

    class RootLayout,AppShell,IndexPage,HomePage,ParticipantHome,ChatLayout,ChatPage,LegacyRoomCreationRequestsPage,RoomCreationRequestPage,ChatRoomLoading,ChatRoomPage,VoteLayout,VotePage,VoteTaskLoading,VoteTaskPage,VoteTaskResultPage,SurveyLayout,SurveyLoading,SurveyPage,Loading,NotFound server;
    class GoogleAnalytics,GoogleAnalyticsUserIdentity,NativeBridgeRuntime,AppUpdateGate,AuthenticationLifecycleBoundary,LocalE2ELoginControl,PlatformShellVisualViewportBoundary,PlatformNavigationClient,PlatformNavigation,ParticipantSwipeNavigationController,ChatQueryProvider,ChatAuthenticationBoundary,ChatAuthenticationRecoveryView,ChatServiceEligibilityGuard,ServiceEligibilityStatus,ChatRealtimeProvider,ChatRoomReadStateProvider,ChatRealtimeDiagnosticsPanel,ChatRoomInboxRuntime,ChatRoomInboxToastList,ChatLoading,ChatRoomListScreen,ChatRoomListView,PublicRoomSearchForm,CreateChatRoomForm,RoomCreationRequestListContent,ChatRoomListDetailDialog,JoinChatRoomControl,RoomCreationRequestScreen,RoomCreationRequestView,ChatRoomScreen,ChatRoomView,ChatMessageViewport,ChatRealtimeSyncStatus,ChatRoomSessionControls,ChatMessageComposer,ChatRoomScreenHeaderActions,ChatRoomScreenMessageSearchPanel,ChatRoomMessageSearchPanel,ChatRoomScreenOverlay,ChatMessageActionsBottomSheet,ChatRoomMembershipDialog,ChatRoomMembershipPanel,ChatRoomMembershipPanelView,ChatRoomInformationSection,ChatRoomSettingsControl,ChatRoomSettingsControlView,VoteQueryProvider,VoteServiceEligibilityGuard,VoteLoading,VoteTaskListScreen,PlatformScrollTopButton,VoteTaskScreen,VoteTaskResultScreen,SurveyQueryProvider,SurveyScreen,SurveyForm,SurveySelect,SurveyMultiSelect,SurveyDropdownSurface,ResidenceAddressField,KakaoPostcodeDialog,SurveyConfirmation,ErrorPage client;
    class PlatformBottomNavigation,ChatRoomEntryError,ChatRoomSessionNotice,SurveyHeaderProgress,SurveySectionFields,SurveySubmissionCompletion clientGraph;
    class PlatformPageShell,SelfScrollPlatformShell,ChildScrollPlatformShell,SurveyPlatformShell,PlatformHeader,ChatRoomListLoading,ChatRoomScreenLoading,VoteTaskListLoading,VoteTaskScreenLoading,SurveyScreenLoading,SurveyLoadingStatus serverCompatible;
    class ChildrenSlot,ChatChildrenSlot,VoteChildrenSlot,SurveyChildrenSlot,SpecialBoundary framework;
```
