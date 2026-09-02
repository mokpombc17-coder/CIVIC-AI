# apps/web React 책임 구조

## Root

```text
RootLayout [Server Route]
└── AppShell [Client]
    ├── PwaServiceWorkerRegistration [production, PWA 시작 shell만 캐시]
    ├── NativeBridgeRuntime
    └── AppUpdateGate
        ├── AppInstallBanner [conditional]
        └── App Router children
```

`AppShell`은 DOM 레이아웃을 추가하지 않고 WebView bridge와 PWA service worker 등록, 앱
설치·업데이트 정책만 소유한다. service worker는 `/pwa/start`의 공개 시작 shell과 해당 정적
리소스만 캐시하고 API 응답이나 인증 정보를 캐시하지 않는다.
참여자 레이아웃은 저장소에 원래 있던 `PlatformShell`이 소유하고, 관리자 레이아웃은 `AdminShell`이
소유한다.

`PlatformShell`은 480px 이하 viewport에서 가용 너비를 모두 사용하고, 그보다 넓은 viewport에서는
최대 393px mobile-first surface를 가운데 표시한다. 높이는 고정된 Figma frame이 아니라 실제
viewport의 `100dvh`를 따른다.

## 실제 제품 route

화면 레지스트리는 `apps/web/lib/screens/screens.v1.generated.json`이다. optional catch-all page가
canonical route를 조회하고 화면 owner·audience·status에 따라 실제 기능 화면 또는 준비 중 화면을
선택한다.

```text
RootLayout [Server]
└── AppQueryProvider [Client, 전역 TanStack Query cache]
    └── AppShell

IndexPage / [Server Route] [redirect: /home]

PwaStartPage /pwa/start [Server Route, manifest start_url]
└── PwaStartup [Client]
    ├── 일반 브라우저: /home 이동, Refresh 미실행
    └── installed PWA: 최소 1.5초 splash + 세션 초기화
        ├── 인증 성공: /home 이동
        ├── 인증 실패: /login 이동
        └── 네트워크·일시 오류: 로그인 상태를 지우지 않고 재시도

HomePage /home [Server Route]
├── hasAccessCredential [Access Token cookie 존재 여부만 확인]
└── ParticipantShell [비로그인 보호 메뉴: /login?returnTo=...]
    └── PlatformPageShell
        └── 기존 frontend2 PlatformShell
            └── ParticipantEligibilityGuard [Client, 로그인 사용자 본문만 제어]
                ├── GET /api/v1/me/service-eligibility [전역 cache 공유]
                ├── 확인 중: Shell 유지, 200ms 뒤 indicator 표시·최소 200ms 유지
                ├── 필수 미제출: /survey?returnTo=/home hard navigation
                └── MainFunctionalScreen [U-HOME-001] [비로그인 보호 동작: /login?returnTo=...]
                ├── PwaInstallTriggerCard [Client, beforeinstallprompt 준비 시 환영 카드 클릭으로 설치 요청]
                └── ParticipantHomeLayout

ParticipantCatchAllPage [Server Route]
├── PUBLIC Main/Auth
│   └── PublicAuthScreen [Client, 활성 인증 단계·header 동기화]
│       └── PlatformPageShell [bottom navigation 없음]
│           └── AuthFunctionalScreen [가입 단계 history state 관리]
├── PARTICIPANT or AUTHENTICATED Main/Auth
│   ├── requireParticipantAccess
│   └── ParticipantShell 또는 AdminShell
│       ├── ParticipantShell
│       │   └── PlatformPageShell
│       │       └── 기존 frontend2 PlatformShell [정확히 1개]
│       │           └── ParticipantEligibilityGuard [Client, 본문 slot만 제어]
│       │               ├── /survey·인증 경로 제외
│       │               ├── 확인 중에도 header·navigation 유지
│       │               ├── 필수 미제출: /survey?returnTo=<현재 경로> hard navigation
│       │               └── MainFunctionalScreen
│       │               └── AccountFunctionalScreen [conditional]
│       │                   ├── AccountHubSurface [/mypage, 로그아웃]
│       │                   ├── AccountManagementSurface [/mypage/profile, 보안 포함]
│       │                   └── DeactivationDialog [/mypage/deactivate]
│       └── AdminShell
│           └── MainFunctionalScreen
├── RAG
│   ├── requireParticipantAccess
│   └── ParticipantShell
│       └── PlatformPageShell
│           └── 기존 frontend2 PlatformShell [정확히 1개]
│               ├── RagNewQuestionHeaderAction [U-RAG-001 header action]
│               └── RagFunctionalScreen
│                   └── ParticipantRagScreen [header action event 수신·확인 dialog 소유]
└── PLACEHOLDER
    ├── requireParticipantAccess
    └── ParticipantShell
        └── PlatformPageShell
            └── 기존 frontend2 PlatformShell [정확히 1개]
                └── ComingSoonScreen

AdminCatchAllPage [Server Route]
├── requireAdminAccess(role 또는 permission)
└── AdminShell
    ├── MainFunctionalScreen [Main/Auth]
    │   └── AdminFunctionalScreen [A-HOME·A-USER]
    │       ├── AdminCurrentOperations [보이는 탭에서 RAG 문서·Simulation 진행 상태 통합 폴링]
    │       └── UserDetailDrawer [계정 정보·역할/권한·변경 이력 3개 탭]
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
    │   └── TaskDetailDrawer [우측 상세·상태 변경, 운영 이력 미노출]
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
adapter다. 기존 header, `self` scroll, safe area, overlay 계층, 표준 `/home`, `/rag`, `/chat`,
`/vote`, `/mypage` navigation을 그대로 사용한다. 투표 화면은 `/vote`를 유일한 표준 주소로
사용하며, 이관 전 계정 UI의 `/account` 주소만 같은 화면과 active menu에 매핑한다. 참여자 섹션 루트는 header 자리를 유지하는
비활성 뒤로가기 control을 표시하고, 하위 화면에서는 각 섹션 루트로 연결되는 활성 control로 바꾼다.

계정 본문은 Figma `U-ACCOUNT-001..004`에 맞춰 `/mypage`, `/mypage/profile`,
`/mypage/deactivate`로 나뉜다. 설문 정식 경로 `/survey`는 같은 공개 origin의 3001 Next.js
애플리케이션이 소유하며, 이관 전 `/account/survey`와 `/mypage/survey`는 `/survey`로 리다이렉트한다.
기존 강제 비밀번호 변경 복귀 주소인
`/account/security`는 `/account/profile`의 호환 별칭으로 유지하며, 공통 header와 하단
navigation은 `ParticipantShell`이 계속 소유한다.

`/home`은 인증 없이 렌더링한다. Access Token cookie가 없는 경우 홈의 기능 동작과 하단 메뉴 중
`/rag`, `/chat`, `/vote`, `/mypage`는 `/login?returnTo=...`로 연결하고, `/home` 메뉴는 공개 홈에
남는다. cookie가 있으면 원래 보호 경로를 유지하며, 실제 자격 확인과 refresh는 각 보호 route가
담당한다.

`PwaInstallTriggerCard`는 브라우저가 `beforeinstallprompt`를 제공한 경우에만 기존 환영 카드 위에
접근 가능한 투명 버튼을 활성화한다. 클릭 시 브라우저의 네이티브 설치 UI를 요청하고,
`appinstalled` 이후에는 다시 비활성화한다. iOS 설치 안내나 별도 시각 CTA는 소유하지 않는다.

`PwaStartup`의 세션 초기화는 `/pwa/start`에서만 실행한다. standalone display mode 또는 iOS
standalone flag가 없으면 Refresh를 호출하지 않는다. API 계약 의존부는
`lib/pwa/session-bootstrap.ts`에 격리하며, Refresh 결과와 최소 splash 시간을 함께 기다린다. 토큰은
브라우저 JavaScript 메모리나 service worker cache에 저장하지 않고 Main/Auth의 HttpOnly cookie
계약을 유지한다.

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
해석하지 않고 `/me` 응답을 화면 접근 판정에 사용한다. `/auth/refresh`와 root `loading.tsx`는 갱신이
끝나기 전에 참여자·관리자 목적지를 확정할 수 없으므로 어느 제품 shell에도 들어가지 않고
`FullscreenStatus`만 렌더링한다. 이 경계는 관리자 갱신과 `/` redirect 중 참가자 mobile shell이 먼저
노출되는 것을 막는다.

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

회원가입의 `AUTH-003`은 Main/Auth가 저장하는 선호 언어·AI 답변 상세도만 다룬다. 실제 설문은 계정
생성·이메일 인증·로그인 이후 Vote의 JWT `sub`를 기준으로 3001의 `/survey`에서 진행한다. 로그인
callback은 역할 홈 또는 검증된 `returnTo`까지만 결정하고, 로그인된 참여자 화면의 공통
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
Crawler 상세 설정과 실행 UI는 현재 컴포넌트 트리에 포함하지 않는다.

## 현재 비활성 기능

참여자 Chat·Vote route는 `ComingSoonScreen`만 렌더링한다. 관리자 Chat 채팅방 목록·통계 Drawer·
생성 신청·카테고리 관리, Vote 과업 관리, 과업 집계 Simulation route는 실제 REST API를 사용한다.
Chat 카테고리 화면은 참여자용 `/api/v1/rooms`에서 조회되는 `ACTIVE + LISTED` 방을
검색·선택해 카테고리를 교체한다. 비공개 또는 목록 비공개 방을 ID로 직접 조회하는 UI는 제공하지 않는다.
placeholder 화면은 REST mutation, WebSocket, SharedWorker를 시작하지 않는다.

## App Router special UI

root `loading.tsx`는 route-neutral `FullscreenStatus`를 사용한다. 참여자·관리자 route 내부의
`loading.tsx`는 각 목적지 shell에 맞는 skeleton을 사용하고, `error.tsx`와 `not-found.tsx`는 기존
`PlatformPageShell`을 사용한다. 이 special UI들은 일반 제품 화면의 상태와 데이터 요청을 소유하지
않는다.
