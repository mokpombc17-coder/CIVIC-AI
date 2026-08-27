# apps/web React 책임 구조

## Root

```text
RootLayout [Server Route]
└── AppShell [Client]
    ├── NativeBridgeRuntime
    └── AppUpdateGate
        ├── AppInstallBanner [conditional]
        └── App Router children
```

`AppShell`은 DOM 레이아웃을 추가하지 않고 WebView bridge와 앱 설치·업데이트 정책만 소유한다.
참여자 레이아웃은 저장소에 원래 있던 `PlatformShell`이 소유하고, 관리자 레이아웃은 `AdminShell`이
소유한다.

## 실제 제품 route

화면 레지스트리는 `apps/web/lib/screens/screens.v1.generated.json`이다. optional catch-all page가
canonical route를 조회하고 화면 owner·audience·status에 따라 실제 기능 화면 또는 준비 중 화면을
선택한다.

```text
HomePage /home [Server Route]
├── requireParticipantSession
└── ParticipantShell
    └── PlatformPageShell
        └── 기존 frontend2 PlatformShell
            └── MainFunctionalScreen [U-HOME-001]

ParticipantCatchAllPage [Server Route]
├── PUBLIC Main/Auth
│   └── PlatformPageShell [bottom navigation 없음]
│       └── MainFunctionalScreen
├── PARTICIPANT or AUTHENTICATED Main/Auth
│   ├── requireParticipantSession
│   └── ParticipantShell 또는 AdminShell
│       ├── ParticipantShell
│       │   └── PlatformPageShell
│       │       └── 기존 frontend2 PlatformShell [정확히 1개]
│       │           └── MainFunctionalScreen
│       │               └── AccountFunctionalScreen [conditional]
│       └── AdminShell
│           └── MainFunctionalScreen
├── RAG
│   ├── requireParticipantSession
│   └── ParticipantShell
│       └── PlatformPageShell
│           └── 기존 frontend2 PlatformShell [정확히 1개]
│               └── RagFunctionalScreen
│                   └── ParticipantRagScreen
└── PLACEHOLDER
    ├── requireParticipantSession
    └── ParticipantShell
        └── PlatformPageShell
            └── 기존 frontend2 PlatformShell [정확히 1개]
                └── ComingSoonScreen

AdminCatchAllPage [Server Route]
├── requireAdminSession(role 또는 permission)
└── AdminShell
    ├── MainFunctionalScreen [Main/Auth]
    ├── RagFunctionalScreen [RAG]
    │   └── AdminRagScreen
    │       ├── FolderTree
    │       ├── DocumentLedger / Upload / Job panel
    │       ├── DocumentInspector
    │       ├── AdminRagAnalytics
    │       └── AdminRagCrawler
    ├── AdminChatRequestScreen [Chat 생성 신청 관리]
    ├── AdminTaskScreen [Vote 과업 관리]
    ├── AdminSimulationScreen [SONA 과업 집계 시뮬레이션]
    │   ├── Vote 과업 선택·설정
    │   ├── 활성 데이터 번들 기반 패널 필터
    │   ├── 실행 상태·취소·수동 재설정
    │   └── 집계 결과·익명 패널 응답 상세
    └── ComingSoonScreen [서버 계약 미확정 화면]
```

사용자·권한 관리 화면은 `HIGHEST_ADMIN`을 요구한다. RAG, Chat, Vote, Simulation 관리자 화면은
`ADMIN | HIGHEST_ADMIN` role과 해당 `*_ADMIN` permission을 함께 사용한다.

참여자 `ParticipantShell`은 새 시각 레이아웃이 아니라 기존 `PlatformPageShell`의 얇은 route
adapter다. 기존 header, `self` scroll, safe area, overlay 계층, 표준 `/home`, `/rag`, `/chat`,
`/vote`, `/mypage` navigation을 그대로 사용한다. 이관 전 실제 UI의 `/votes`, `/account` 주소도
호환 별칭으로 같은 화면과 active menu에 매핑한다.

## 인증 책임

```text
Protected Server Route
└── loadShellSession
    ├── HttpOnly Access Token cookie 읽기
    └── Main/Auth GET /api/v1/auth/me
        └── ShellSession view model

Protected Client request
└── authenticatedFetch
    ├── 원래 same-origin API 요청
    └── 401일 때
        ├── 동시 요청을 하나의 POST /api/v1/auth/refresh로 직렬화
        └── 원래 요청 1회 재시도
```

Refresh Token은 `/api/v1/auth` path로 제한되므로 일반 Server Component가 읽지 않는다. Access Token이
없거나 만료된 Server Route는 `/auth/refresh`를 거쳐 브라우저가 갱신한다. Frontend는 JWT payload를
해석하지 않고 `/me` 응답을 화면 접근 판정에 사용한다.

## BFF 책임

```text
Browser /api/v1/auth|account|admin/**
└── MainAuth BFF
    ├── route/method allowlist
    ├── same-origin 검사
    ├── mutation CSRF 획득
    └── Auth cookie Set-Cookie 검증

Browser /api/v1/rag/**
└── RAG BFF
    ├── same-origin 검사
    ├── Access Token raw equality 검사
    └── RAG upstream에 동일 Cookie + Bearer 전달

Browser /api/v1/admin/tasks/{taskId}/simulations|simulations/**|simulation-options
└── Simulation BFF
    ├── route/method allowlist
    ├── same-origin 검사
    ├── Access Token raw equality 검사
    └── Simulation upstream에 동일 Cookie + Bearer 전달

Browser /api/v1/admin/room-creation-requests/** | /api/v1/admin/tasks/** | /api/v1/admin/simulation-tasks/**
└── Admin Domain BFF
    ├── 화면별 path·method allowlist
    ├── same-origin 검사
    └── Chat 또는 Vote upstream에 동일 Cookie + Bearer 전달
```

RAG client container는 `authenticatedFetch`를 사용한다. 질의 완료 스트림은 Next.js SSE 프록시를
통해 연결하며 provider API key나 JWT를 Client Component에 전달하지 않는다.

## 현재 비활성 기능

참여자 Chat·Vote, Chat의 활성 방·카테고리·통계 운영, Simulation route는 `ComingSoonScreen`만
렌더링한다. Chat 생성 신청과 Vote 과업 관리자 route는 실제 REST API를 사용한다. placeholder 화면은
REST mutation, WebSocket, SharedWorker를 시작하지 않는다.

## App Router special UI

`loading.tsx`, `error.tsx`, `not-found.tsx`도 기존 `PlatformPageShell`을 사용한다. 일반 제품 화면의
상태와 데이터 요청은 소유하지 않는다.
