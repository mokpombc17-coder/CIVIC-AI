# apps/web React 책임 구조

## Root

```text
RootLayout [Server Route, 문서 CSP nonce 소유]
└── StyleNonceProvider [Client, 현재 문서 수명 동안 nonce 고정]
    ├── AuthSessionSync [Client, LOGIN/LOGOUT 수신 후 router.push 이동]
    └── AppShell [Client]
        ├── PwaServiceWorkerRegistration [production, window load 이후 최초 사용자 상호작용 뒤 idle 등록]
        ├── NativeBridgeRuntime
        └── AppUpdateGate
            └── App Router children
```

`AppShell`은 DOM 레이아웃을 추가하지 않고 WebView bridge와 PWA service worker 등록, 앱
업데이트 정책만 소유한다. service worker 등록은 초기 문서의 `load` 이후 최초의 실제
`pointerdown`·`wheel`·`keydown`을 기다린 다음 `requestIdleCallback`에서 실행하며 강제 timeout을 두지
않는다. idle API가 없는 브라우저에서만 다음 timer task를 사용한다.
service worker의 v5 shell cache는 `/pwa/start`의 공개 HTML과 전용 CSS·JavaScript만 install 시
원자적으로 저장한다. 별도 runtime cache는 실제 요청된 버전 지정 Pretendard GOV 폰트와 platform
navigation 이미지만 cache-first로 저장하며, 이미 로드된 홈 자산을 다시 요청하지 않는다. manifest·설치
아이콘은 브라우저에 맡기고 API 응답이나 인증 정보는 캐시하지 않는다.

`AuthSessionSync`는 `civic-ai:auth:v1` 채널을 전역에서 구독한다. 다른 문서의 `LOGIN`은
`/home`, `LOGOUT`은 `/login`으로 `router.push()`를 통해 이동한다. 인증 확인은 기존
페이지/API 로직이 담당하고, 송신한 탭은 기존 성공 이동을 따른다.
[공통 규약](../integration/auth-session-sync-front-handoff.md)을 따른다.

로그인·로그아웃·세션 무효화 성공 처리와 `AuthSessionSync`의 메시지 수신 처리는
`clearAuthSessionData()`를 공유한다. 이 함수는 RAG 대화 스냅샷·초안, 분석용 사용자 ID,
브라우저의 공유 QueryClient 캐시를 함께 비운다. API 요청·메시지 송신·화면 이동은 호출부가 담당한다.
`AuthSessionSync`는 `observeAuthMessages`로 받은 메시지에 따라 정리 후 이동한다.
다음 로그인 후 역할·서비스 이용 자격을 새로 조회한다.
`RagSessionBoundary`는 RAG 진입·탭 복귀 시 현재 계정을 확인하고, 확인 중에는 대화 내용을 제외한
empty RAG 골격과 비활성 composer를 렌더링한다. RAG route는 자격 확인 단계에도 같은 골격을
`ParticipantEligibilityGuard` fallback으로 전달한다. bfcache 저장 전에도 대화를 언마운트하고 복원 시 문서를 다시 로드한다. 브로드캐스트의
수신 이동에는 인증 조회를 추가하지 않는다. [RAG 계정 격리](../contracts/rag-session-isolation.md)를 따른다.

`StyleNonceProvider`는 최상위 문서 응답의 `x-nonce`를 처음 마운트된 값으로 고정한다.
RSC 이동·갱신 요청에서 새 nonce가 발급되어도 현재 문서의 CSP는 바뀌지 않으므로,
AG Grid가 런타임에 삽입하는 테마 `<style>`은 항상 문서 nonce를 사용한다.
참여자 레이아웃은 저장소에 원래 있던 `PlatformShell`이 소유하고, 관리자 레이아웃은 `AdminShell`이
소유한다.

`PlatformShell`은 480px 이하 viewport에서 가용 너비를 모두 사용하고, 그보다 넓은 viewport에서는
최대 393px mobile-first surface를 가운데 표시한다. 높이는 고정된 Figma frame이 아니라 실제
viewport의 `100dvh`를 따른다.

## 실제 제품 route

화면 레지스트리는 `apps/web/lib/screens/screens.v1.generated.json`이다. optional catch-all page가
canonical route를 조회하고 화면 owner·audience·status에 따라 실제 기능 화면 또는 준비 중 화면을
선택한다.

참여자 RAG 기능 route는 `/rag`만 등록한다. 참조 문서는 이 화면 안의 `RagReferenceSurface`에서
열며, 이전 임시 route인 `/rag/source`와 `/rag/source/page`는 레지스트리에 없어 404를 반환한다.

```text
RootLayout [Server, 문서 CSP nonce 읽기]
└── StyleNonceProvider [Client, nonce 고정]
    └── AppShell

IndexPage / [Server Route] [redirect: /home]

PwaStartRouteHandler /pwa/start [Route Handler, manifest start_url, 독립 HTML document]
├── /pwa-start/start.css [startup 전용 style]
└── /pwa-start/start.js [React 비의존 startup runtime]
    ├── 일반 브라우저: /home 이동, Refresh 미실행
    └── installed PWA: 최소 1.5초 splash + 세션 초기화
        ├── 인증 성공: /home 이동
        ├── 인증 실패: analytics session 정리 후 /login 이동
        └── 네트워크·일시 오류: 로그인 상태를 지우지 않고 수동·online 재시도

RefreshPage /auth/refresh [Server Route, 안전한 returnTo 기준 대기 surface 선택]
└── AccessTokenRefresh [Client, Access Token 갱신 후 returnTo로 복귀]
    ├── /rag 또는 /mypage 계열 갱신 중: ParticipantLoadingView [목적지 PlatformShell 유지]
    └── 관리자·기타 경로 갱신 중 또는 갱신 실패: FullscreenStatus [route-neutral]

ForbiddenLoading /forbidden/loading.tsx [Server Route, route-neutral PlatformShell fallback]
├── header: CIVIC.AI + 전남광주
├── content: spinner + 준비 상태 안내
└── bottom navigation: 현재 선택 상태 없이 공통 메뉴 유지

HomeLayout /home [Server Route Layout, home.css 소유] → HomePage /home [Server Route]
├── HomeBrandTitle [CIVIC.AI + 고정 권역 광주/전남]
└── ParticipantShell [정적 홈 surface를 인증 확인보다 먼저 렌더링]
    ├── headerActions Suspense [fallback: Login Link]
    │   └── hasAccessCredential
    │       ├── 비로그인: Login Link
    │       └── CurrentUserGreeting [Client, 사용자 이름·팝업 trigger·PWA 설치 이벤트]
    │           ├── CurrentUserMenuPanel [Client, 최초 open 시 lazy load, 설치·로그아웃·관리자 Link]
    │           └── PwaInstallGuideDialog [Client, iOS 설치 안내 open 시 lazy load]
    ├── bottomNavigation Suspense [fallback: 보호 메뉴를 /login?returnTo=...로 연결]
    │   └── hasAccessCredential 결과로 보호 메뉴 목적지만 교체, 히어로 전 Link prefetch 비활성
    └── PlatformPageShell
        └── 기존 frontend2 PlatformShell
            ├── ParticipantSwipeNavigationController [Client, hydration에서 swipe listener 등록]
            │   └── 수평 의도 확인 뒤 현재 content surface drag/exit
            ├── DeferredHomeQueryRuntime [Client, 히어로 완료 신호 뒤 동적 import]
            │   ├── 완료 신호 누락: 3초 fallback 뒤 idle scheduling
            │   └── HomeQueryRuntime
            │       ├── AppQueryProvider [Client, 비로그인도 query runtime 준비]
            │       └── ParticipantEligibilityGuard [로그인 사용자만 백그라운드 확인]
            │           ├── GET /api/v1/me/service-eligibility [browser singleton cache 공유]
            │           ├── 확인 중: 정적 홈 surface 유지, 별도 indicator 없음
            │           └── 필수 미제출: /survey?returnTo=/home hard navigation
            ├── HomeHeroAnimationController [Client, 도넛 debug replay 및 inline bootstrap 미실행 시 fallback]
            ├── ParticipantHomeScreen [U-HOME-001, 홈 route가 직접 조립]
            │   ├── OpinionGatheringHero [SSR: 질문·회색 도넛·replay 표식]
            │   └── ParticipantHomeLayout Suspense [fallback: 보호 동작을 /login?returnTo=...로 연결]
            └── HomeHeroAnimationBootstrap [Server, Hero 뒤 nonce inline script로 double RAF 시작·완료 계약 소유]

`participant-swipe-bootstrap.js`는 모바일 성능 비교를 위해 소스만 보존한다. 현재
`ParticipantShell`은 이를 주입하지 않으며 PWA persistent asset에도 포함하지 않는다.

ParticipantLayout [Server Route Layout, wireflow.css 소유] → ParticipantCatchAllPage [Server Route]
├── PUBLIC Main/Auth
│   └── PublicAuthScreen [Client, 활성 인증 단계·header 동기화]
│       └── PlatformPageShell [bottom navigation 없음]
│           └── AuthFunctionalScreen [가입 단계 history state 관리]
├── PARTICIPANT or AUTHENTICATED Main/Auth
│   ├── requireParticipantAccess
│   └── EligibleParticipantShell 또는 AdminShell
│       ├── EligibleParticipantShell
│       │   └── PlatformPageShell
│       │       └── 기존 frontend2 PlatformShell [정확히 1개]
│       │           └── AppQueryProvider
│       │               └── ParticipantEligibilityGuard [Client, 본문 slot만 제어]
│       │                   ├── /survey·인증 경로 제외
│       │                   ├── 확인 중에도 header·navigation 유지
│       │                   ├── 필수 미제출: /survey?returnTo=<현재 경로> hard navigation
│       │                   ├── MainFunctionalScreen
│       │                   └── AccountFunctionalScreen [conditional]
│       │                       ├── AccountHubSurface [/mypage, 로그아웃]
│       │                       ├── AccountManagementSurface [/mypage/profile, 보안 포함]
│       │                       └── DeactivationDialog [/mypage/deactivate]
│       └── AdminShell
│           └── MainFunctionalScreen
├── RAG
│   ├── requireParticipantAccess
│   └── EligibleParticipantShell
│       └── PlatformPageShell [U-RAG-001은 child scroll]
│           └── 기존 frontend2 PlatformShell [정확히 1개]
│               ├── RagNewQuestionHeaderAction [U-RAG-001 header action]
│               └── RagSessionBoundary [Client, 현재 계정 확인 전 대화 노출 차단]
│                   └── RagFunctionalScreen
│                       └── ParticipantRagScreen [header action event 수신·확인 dialog·메시지 scroll·문서 미리보기 상태 소유]
│                           ├── ParticipantDocumentCatalog [Client, 빈 대화에서 참여자 문서 목록 조회·미리보기 선택 전달]
│                           └── ReadOnlyPdfViewer [Client, 인용 페이지 이미지 또는 목록 문서의 정규화 PDF 표시]
└── PLACEHOLDER
    ├── requireParticipantAccess
    └── EligibleParticipantShell
        └── PlatformPageShell
            └── 기존 frontend2 PlatformShell [정확히 1개]
                └── ComingSoonScreen

AdminLayout [Server Route Layout, wireflow.css + admin-console.css 소유] → AdminCatchAllPage [Server Route]
├── requireAdminAccess(role 또는 permission)
└── AdminShell
    ├── AdminFunctionalScreen [Main/Auth의 A-HOME·A-USER, 관리자 route가 직접 조립]
    │   ├── OpinionMapRetryPanel [A-HOME의 UNAVAILABLE Opinion Map 목록·cursor 페이지네이션·과업별 수동 재시도]
    │   ├── AdminCurrentOperations [보이는 탭에서 RAG 문서·Simulation·Vote AI 예상 답변 작업 통합 폴링; VOTE_ADMIN 권한으로 초안 상세를 최대 4개 동시 조회]
    │   └── UserDetailDrawer [계정 정보·역할/권한·변경 이력 3개 탭]
    ├── RagFunctionalScreen [RAG]
    │   └── AdminRagScreen
    │       ├── FolderTree
    │       ├── DocumentWorkspace
    │       │   └── UploadPanel [인라인 신규 문서]
    │       ├── UploadPanel [A-RAG-004 신규 문서·새 버전]
    │       ├── AutomaticRagJobRetryPanel [A-RAG-004 실패 작업 재시도·상태 이동]
    │       ├── JobPanel [A-RAG-005]
    │       ├── DocumentInspector
    │       │   └── AdminRagSpreadsheetPreview [Excel/CSV 읽기 전용]
    │       └── AdminRagModal / FolderEditor
    ├── AdminChatInsightsScreen [Chat 채팅방 관리]
    │   ├── RoomTable [검색·상태 필터·목록]
    │   └── RoomStatisticsDrawer [기간별 통계·원본 ZIP·방 종료]
    ├── AdminChatRequestScreen [Chat 생성 신청 관리]
    │   └── RequestDetailDrawer [우측 상세 검토·카테고리 선택·승인/반려]
    ├── AdminRoomCategoryScreen [Chat 카테고리 및 ACTIVE·LISTED 방 관리]
    │   ├── ListedRoomTable [참여자 방 목록 API 검색·페이지네이션]
    │   └── RoomCategorySelector [선택 방의 카테고리 교체]
    ├── AdminTaskScreen [Vote 과업 관리]
    │   ├── TaskList [목록·검색·상태 필터]
    │   ├── TaskCreationDrawer [기본 정보→질문→선택지 단계형 초안 생성]
    │   ├── TaskDetailDrawer [우측 상세·상태 변경, 운영 이력 미노출]
    │   └── TaskResultsTab [결과 탭: OPEN 현황 집계·수동 새로고침, 종료 시 확정 결과·다운로드]
    │       └── OpinionMapReviewPanel [생성 상태·선택지별 sameChoice/otherChoices 조회·수동 생성/재시도/재생성·run/attempt 과금 이력·활성 run 폴링]
    ├── AdminSimulationScreen [SONA 과업 집계 시뮬레이션]
    │   ├── SimulationSectionTabs [실행·공용 지갑·가격 정책·사용량·근거 이관]
    │   ├── Vote 과업 선택·실행 전 비용/시간 견적·설정
    │   ├── 활성 데이터 번들 기반 패널 필터
    │   ├── 실행 상태·취소·수동 재설정
    │   ├── 집계 결과·익명 패널 응답 상세
    │   └── SimulationBillingSection
    │       ├── 공용 지갑 조회·쿠폰 발급/사용
    │       ├── 환율·공급자 단가·모델 가격 초안/활성화
    │       ├── 일별 정산 사용량
    │       └── 최근 SONA 근거 이관 상태
    └── ComingSoonScreen [서버 계약 미확정 화면]
```

사용자·권한 관리 화면은 `HIGHEST_ADMIN`을 요구한다. RAG, Chat, Vote, Simulation 관리자 화면은
`ADMIN | HIGHEST_ADMIN` role과 해당 `*_ADMIN` permission을 함께 사용한다.

Vote 과업 목록의 `과업 상세`는 별도 페이지로 이동하지 않고 `TaskDetailDrawer`를 연다. 선택한
`taskId`는 `/admin/tasks?taskId=...`에 반영해 새로고침 후에도 같은 Drawer를 복원하며, 기존
`/admin/tasks/detail` 주소는 인증·권한 확인 뒤 이 목록 주소로 이동한다.

`새 과업 만들기`도 목록 위에서 `TaskCreationDrawer`를 연다. Drawer는 닫혀도 목록 화면에
마운트된 작성 상태를 유지해 다시 열었을 때 입력값과 현재 단계를 복원한다. 상단 네비게이션은
`기본 정보(제목·상황 또는 사건) → 질문 → 선택지` 순서이며, 새 과업의 질문 설명은 별도 입력 없이
`null`로 저장한다. 기존 `/admin/tasks/create` 주소는 `/admin/tasks?create=1`로 이동한다.

사용자 목록의 `사용자 상세`도 별도 페이지 대신 `UserDetailDrawer`를 열고, 계정 정보·역할/권한·
변경 이력을 Drawer 내부 탭으로 전환한다. 기존 상세·권한·감사 route는 인증·권한 확인 뒤
`/admin/users?userId=...&tab=...`으로 이동한다.

Chat 신청 목록의 `상세 검토`는 `RequestDetailDrawer`를 열어 신청 정보와 카테고리 선택,
승인·반려 작업을 한 흐름에서 처리한다. 선택한 `requestId`는
`/admin/chat/requests?requestId=...`에 반영하며, 기존 상세·승인/반려 route는 인증·권한 확인 뒤
같은 목록 Drawer 주소로 이동한다.

관리자 사이드바의 `채팅 운영`은 별도의 콘텐츠 탭 대신 `채팅방 신청 목록`, `채팅방 관리`,
`카테고리 관리` 세 하위 항목을 제공한다. 채팅방 관리는 과업 관리와 같은 표 목록을 사용하고, `상세 보기`는
`RoomStatisticsDrawer`를 열어 통계와 운영 설정을 표시한다. 선택한 `roomId`는
`/admin/chat?roomId=...`에 반영하며 기존 상세·통계·Export route는 같은 Drawer 주소로 이동한다.

참여자 `ParticipantShell`은 새 시각 레이아웃이 아니라 기존 `PlatformPageShell`의 얇은 route
adapter다. 기존 header, safe area, overlay 계층, 표준 `/home`, `/rag`, `/chat`, `/vote`, `/mypage`
navigation을 그대로 사용한다. 일반 화면은 `self` scroll을 사용하고, `U-RAG-001`은 `child` scroll로
전환해 header와 composer를 고정한 채 `.civic-rag-messages`만 스크롤한다. 투표 화면은 `/vote`를 유일한 표준 주소로
사용하며, 이관 전 계정 UI의 `/account` 주소만 같은 화면과 active menu에 매핑한다. 참여자 섹션 루트는 header 자리를 유지하는
비활성 뒤로가기 control을 표시하고, 하위 화면에서는 각 섹션 루트로 연결되는 활성 control로 바꾼다.
정확한 landing route에서는 지연 로드된 swipe controller가 중앙 content surface에만 pointer gesture를 연결하며,
header와 하단 navigation은 고정된 상태로 실제 navigation link를 실행한다.

계정 본문은 Figma `U-ACCOUNT-001..004`에 맞춰 `/mypage`, `/mypage/profile`,
`/mypage/deactivate`로 나뉜다. 설문 정식 경로 `/survey`는 같은 공개 origin의 3001 Next.js
애플리케이션이 소유하며, 이관 전 `/account/survey`와 `/mypage/survey`는 `/survey`로 리다이렉트한다.
기존 강제 비밀번호 변경 복귀 주소인
`/account/security`는 `/account/profile`의 호환 별칭으로 유지하며, 공통 header와 하단
navigation은 `ParticipantShell`이 계속 소유한다.

`/home`은 인증 없이 렌더링한다. Access Token cookie가 없는 경우 홈의 기능 동작과 하단 메뉴 중
`/rag`, `/chat`, `/vote`, `/mypage`는 `/login?returnTo=...`로 연결하고, `/home` 메뉴는 공개 홈에
남는다. 인증 확인에 따라 달라지는 header, 보호 링크와 하단 메뉴만 각각의 `Suspense` 안에서
교체하므로 랜딩 본문과 회색 도넛은 cookie 확인을 기다리지 않는다. cookie가 있으면 원래 보호
경로를 유지하고, 필수 설문 여부는 랜딩 본문을 가리지 않는 guard가 확인한다. 실제 refresh는 각
보호 route가 담당한다.

초기 CSS도 같은 route 경계를 따른다. `RootLayout`은 `globals.css`만 소유하고, `HomeLayout`의
`home.css`가 작은 `wireflow-base.css`와 홈 전용 규칙을 함께 가져온다. 참여자 catch-all은
`ParticipantLayout`에서 전체 `wireflow.css`를, 관리자 route는 `AdminLayout`에서 `wireflow.css`와
`admin-console.css`를 가져오므로 `/home` 초기 dependency에는 두 전체 stylesheet가 포함되지 않는다.

`CurrentUserGreeting`은 로그인 사용자 이름과 팝업 trigger만 초기 client graph에 유지한다. 팝업의
`CurrentUserMenuPanel`은 최초 open 시 lazy load하고, `PwaInstallGuideDialog`는 iOS 설치 안내가 실제로
열릴 때 lazy load한다. Chromium 계열의 `beforeinstallprompt`는 초기 listener에서 계속 캡처해 이후
동적으로 로드된 메뉴의 `앱 설치` 동작으로 연결하고, iOS·iPadOS 일반 브라우저에서는 같은 메뉴에서
Safari의 공유 메뉴와 `홈 화면에 추가` 절차를 안내한다.
설치된 PWA와 네이티브 셸에서는 설치 동작을 제공하지 않으며, `appinstalled` 이후에도 다시 숨긴다.
관리자는 같은 팝업에서 관리자 페이지로 이동한다. 홈의 참여 안내 카드는 설치 동작을 소유하지
않는다. 앱스토어 이동을 위한 별도 시각 CTA는 제공하지 않는다.

`MainFunctionalScreen`은 홈을 제외한 참여자·인증 화면만 조립한다. 관리자 route는
`AdminFunctionalScreen`을 직접 import하므로 AG Grid를 포함한 관리자 client graph는 관리자
페이지에 진입할 때만 내려받는다.

`/home` route는 `MainFunctionalScreen`을 거치지 않고 `ParticipantHomeScreen`을 직접 import한다.
따라서 랜딩 초기 client graph에는 계정·인증 화면 및 React Query 코드가 포함되지 않는다. 홈은 인증
여부와 관계없이 `ParticipantSwipeNavigationController`가 초기 hydration에서 listener를 먼저 등록하고
ready 신호를 발행한다. `HomeHeroAnimationController`는 이 신호를 확인한 뒤 두 번의 animation frame과
idle scheduling 이후 애니메이션을 시작하고 도넛 click/touch debug replay를 제어한다. 히어로 완료 신호 이후
`HomeQueryRuntime`을 동적 import하며, 신호를 놓치면
3초 fallback을 사용한다. 비로그인은 query runtime만 준비하고, 로그인 사용자만
`ParticipantEligibilityGuard`를 실행한다. 보호 참여자 route는 `EligibleParticipantShell`에서
`AppQueryProvider`와 guard를 즉시 조립하며 browser singleton query cache를 공유한다. 홈에 노출되는
Next Link는 히어로 도중 route prefetch가 query runtime을 먼저 가져오지 않도록 prefetch를 끈다.

`/pwa/start`는 RootLayout과 React hydration을 거치지 않는 Route Handler HTML이다. 전용
`start.js`는 standalone display mode 또는 iOS standalone flag가 없으면 Refresh를 호출하지 않고
`/home`으로 이동한다. installed PWA에서는 Refresh 결과와 최소 splash 시간을 함께 기다리며,
401·403만 비인증으로 처리하고 네트워크·429·서버 오류는 재시도 상태로 유지한다. 토큰은 브라우저
JavaScript 메모리나 service worker cache에 저장하지 않고 Main/Auth의 HttpOnly cookie 계약을 유지한다.
시작 shell의 `CIVIC.AI` wordmark는 이미지나 웹폰트를 요청하지 않는 system font 텍스트다.

공개 인증 route는 Server Route가 `PublicAuthScreen`에 초기 화면과 query만 전달한다. 이 Client
wrapper가 가입 단계의 `history.state` 변화와 상단 제목·뒤로가기 동작을 동기화하고,
`AuthFunctionalScreen`은 입력 상태와 단계 전환을 소유한다. 가입 중 뒤로가기는 전체 페이지 이동이
아니라 브라우저 history를 사용해 직전 가입 단계로 복귀한다.

## 인증 책임

```text
Protected Server Route
└── loadCurrentUser
    ├── HttpOnly Access Token cookie 읽기
    └── Main/Auth GET /api/v1/auth/me
        └── CurrentUser view model

Protected Client request
└── authenticatedFetch
    ├── 원래 same-origin API 요청
    └── 401일 때
        ├── 동시 요청을 하나의 POST /api/v1/auth/refresh로 직렬화
        └── 원래 요청 1회 재시도
```

Refresh Token은 `/api/v1/auth` path로 제한되므로 일반 Server Component가 읽지 않는다. Access Token이
없거나 만료된 Server Route는 `/auth/refresh`를 거쳐 브라우저가 갱신한다. Frontend는 JWT payload를
해석하지 않고 `/me` 응답을 화면 접근 판정에 사용한다. `/auth/refresh`는 갱신이 끝나기 전에 안전한
`returnTo`를 기준으로 participant 목적지에는 해당 shell을 유지하고, 관리자·기타 경로에는
`FullscreenStatus`를 렌더링한다. `/forbidden/loading.tsx`는 사용자 조회가 끝나기 전 route-neutral
`PlatformPageShell`을 제공한다. 루트에는 공통 `loading.tsx`를 두지 않으므로 `/home`의 초기 fallback은
항상 `/home/loading.tsx`가 소유한다.

## BFF 책임

```text
Browser /api/v1/auth|account|admin/**
└── MainAuth BFF
    ├── route/method allowlist
    ├── same-origin 검사
    ├── mutation CSRF 획득
    └── Auth cookie Set-Cookie 검증

Browser /api/v1/rag/**
└── nginx direct ingress
    └── RAG Resource Server
        ├── Cookie/Bearer raw equality 검사
        ├── Origin/CSRF와 JWT scope 검사
        └── /internal/v1/rag/** 정본 경로 처리

Browser /api/v1/admin/simulation-tasks/**|simulations/**|simulation-options|simulation-billing/**
└── nginx direct ingress
    └── Simulation Resource Server
        ├── Cookie/Bearer raw equality 검사
        ├── Origin/CSRF와 JWT scope 검사
        └── 정본 Simulation API 처리

Browser /api/v1/admin/room-creation-requests/** | /api/v1/admin/room-categories/**
        | /api/v1/admin/rooms | /api/v1/admin/rooms/{roomId}/categories
        | /api/v1/admin/rooms/{roomId}/commands/close | /api/v1/rooms | /api/v1/rooms/{roomId}
        | /api/v1/admin/tasks/**
└── Admin Domain BFF
    ├── 화면별 path·method allowlist
    ├── same-origin 검사
    └── Chat 또는 Vote upstream에 동일 Cookie + Bearer 전달

Browser /api/v1/me/service-eligibility | /api/v1/me/surveys/current | /api/v1/me/survey-responses
        | /api/v1/me/survey-responses/latest
├── A1: nginx direct ingress
│   └── Vote Resource Server :8082
└── Next.js participant Vote BFF [local/standalone Frontend2]
    ├── path·method allowlist
    ├── same-origin 검사
    └── Vote upstream에 동일 Cookie + Bearer 및 Idempotency-Key 전달
```

회원가입은 `AUTH-002` 계정 정보, `AUTH-005` 이메일 인증, `AUTH-004` 약관 동의·필수정보 확인의 3단계
흐름이다. 기존 `AUTH-003` 서비스 설정 화면은 가입 흐름에서 제거하고, Main/Auth 계약이 아직 요구하는
선호 언어·AI 답변 상세도에는 각각 `ko`·`balanced` 기본값을 전송한다. 1단계에서 가입 flow와 인증
메일을 만들되 사용자 계정은 만들지 않고, 2단계 이메일 인증을 통과한 flow만 3단계 약관 동의와 계정
생성을 완료할 수 있다. 계정·RAG 처리 안내는 별도 동의를 받지 않는 필수정보 고지로 제공한다. 실제
설문은 계정 생성·로그인 이후 Vote의 JWT `sub`를 기준으로 3001의 `/survey`에서
진행한다. 로그인 callback은 역할 홈 또는 검증된 `returnTo`까지만 결정하고, 로그인된 참여자 화면의 공통
`ParticipantEligibilityGuard`가 `GET /api/v1/me/service-eligibility`를 전역 cache로 조회한다.
자격 확인 중에는 `ParticipantShell`의 header와 navigation을 유지한 채 본문만 차단하고, 200ms 안에
응답하면 indicator를 노출하지 않는다. indicator가 표시된 경우에는 최소 200ms 동안 유지한다.
`eligible=false`이고 `nextAction=COMPLETE_CURRENT_SURVEY`이면 현재 경로를 `returnTo`로 보존해
`/survey`로 hard navigation한다. 3001은 제출 성공 후 같은 eligibility를 invalidate·재조회하여
`eligible=true`를 확인한 뒤 `returnTo` 또는 `/home`으로 돌아와야 한다. Vote 조회 장애는 인증 성공
자체를 되돌리지 않고 현재 참여자 화면을 표시한다.

실행 요청은 먼저 `/api/v1/admin/simulations/preview`에 `taskId`를 포함해 예상 원화 비용·20% 보류액·
예상 시간·가격 정책 fingerprint를 받는다. 관리자가 화면에서 이를 확인한 다음 동일 fingerprint를
`POST /api/v1/admin/simulations`에 넣는다. 지갑·정책·사용량·이관 화면은 내부 UUID 대신 금액, 버전,
이메일, 상태처럼 운영자가 판단할 수 있는 값만 표시한다. 쿠폰 원문은 발급 응답 직후의 Client state에만
존재하며 URL, 브라우저 저장소, 로그에는 기록하지 않는다.

RAG client container는 `authenticatedFetch`를 사용한다. 질의 완료 스트림은 nginx에서 RAG Resource
Server로 직접 연결하며 provider API key나 JWT payload를 Client Component에 전달하지 않는다. 참여자 RAG 화면은
같은 탭의 질문·답변·인용·후속 질문 제안을 `sessionStorage`에서 복원하고 `새 질문`에서 삭제한다.
`RagNewQuestionHeaderAction`은 `ParticipantShell`의 header action slot에 렌더링하고, 요청 event만
`ParticipantRagScreen`에 전달한다. 대화 초기화와 확인 dialog 상태는 RAG client container가 계속 소유한다.
`ParticipantDocumentCatalog`는 대화 복원이 끝났고 메시지가 없을 때만 mount되어
`/api/v1/rag/documents/random`을 `authenticatedFetch`로 조회하며, 메시지가 생기면 대화 화면에서 제거된다.
문서 선택 상태와 reference surface 조립은 `ParticipantRagScreen`이 소유한다. 선택한 문서는 목록 응답의
버전 ID로 `/api/v1/rag/sources/{document_version_id}/pages/1`을 기준 source로 사용하고,
`ReadOnlyPdfViewer`가 답변 citation과 동일한 페이지 PNG 목록을 기존 읽기 전용 미리보기 surface에 표시한다.
Crawler 상세 설정과 실행 UI는 현재 컴포넌트 트리에 포함하지 않는다.

## 현재 비활성 기능

참여자 Chat·Vote route는 `ComingSoonScreen`만 렌더링한다. 관리자 Chat 채팅방 목록·통계 Drawer·
생성 신청·카테고리 관리, Vote 과업 관리, 과업 집계 Simulation route는 실제 REST API를 사용한다.
Chat 카테고리 화면은 참여자용 `/api/v1/rooms`에서 조회되는 `ACTIVE + LISTED` 방을
검색·선택해 카테고리를 교체한다. 비공개 또는 목록 비공개 방을 ID로 직접 조회하는 UI는 제공하지 않는다.
placeholder 화면은 REST mutation, WebSocket, SharedWorker를 시작하지 않는다.

## App Router special UI

루트에는 공통 `loading.tsx`를 두지 않는다. `/forbidden/loading.tsx`만 route-neutral
`PlatformPageShell`에 브랜드 header, 준비 상태, 선택 상태가 없는 공통 bottom navigation을 렌더링한다.
참여자·관리자 route 내부의 `loading.tsx`는 각 목적지 shell에 맞는 skeleton을 사용하고,
`error.tsx`와 `not-found.tsx`는 기존 `PlatformPageShell`을 사용한다. 이 special UI들은 일반 제품
화면의 상태와 데이터 요청을 소유하지 않는다. `/home/loading.tsx`는 관리자 skeleton과 분리된
`ParticipantHomeSkeleton`을 직접 사용해 질문·회색 도넛·홈 카드의 초기 구조만 렌더링한다.
