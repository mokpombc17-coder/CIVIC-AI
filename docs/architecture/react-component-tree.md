# apps/web React component responsibility tree

## 문서 목적

Platform Shell 템플릿의 route, Server·Client 경계와 Shell 조립 관계를 기록한다. 순수 표현용
HTML 구조와 CSS 세부 구현은 이 문서에 포함하지 않는다.

## 공통 조립 관계

```text
RootLayout [Server] [Route] (apps/web/app/layout.tsx)
└── children [slot: App Router가 현재 route를 제공]
    ├── route /: IndexPage [Server] [Route] [redirect: /home] (apps/web/app/page.tsx)
    ├── route /home: HomePage [Server] [Route] (apps/web/app/home/page.tsx)
    │   └── PlatformPageShell [Server-compatible] [View]
    │       └── PlatformShell [Server-compatible] [View] [scroll: self]
    │           ├── PlatformHeader [Server-compatible] [View]
    │           └── PlatformNavigationClient [Client] [Adapter]
    │               └── PlatformNavigation [Server-compatible] [View]
    │                   └── PlatformBottomNavigation [Server-compatible] [View]
    ├── not-found: NotFound [Server] [Route]
    │   └── PlatformPageShell
    ├── loading: Loading [Server] [Route]
    │   └── PlatformPageShell
    └── error: ErrorPage [Client] [Route]
        └── PlatformPageShell
```

`RootLayout`은 HTML 문서와 전역 CSS만 소유한다. route마다 title, back action, bottom navigation과
scroll 책임이 달라질 수 있으므로 완성된 `PlatformShell`을 root layout에 고정하지 않는다.

## 책임 경계

- `PlatformShell`: header, content, bottom navigation, overlay와 safe area를 배치한다.
- `PlatformHeader`: title, leading, actions와 back control의 표현만 담당한다.
- `PlatformBottomNavigation`: 전달받은 anchor 항목을 배치한다.
- `PlatformNavigation`: 플랫폼 표준 경로와 pathname 기반 active 상태를 표현한다.
- `PlatformNavigationClient`: Next.js `usePathname()`을 읽는 Client adapter다.
- `PlatformPageShell`: 일반 route의 header, `scroll="self"`와 표준 navigation을 조립한다.

`apps/web/components/platform-shell`은 Next.js router, 인증, 환경변수와 도메인 코드를 import하지
않는다. 새 도메인의 상태·데이터·화면 컴포넌트는 이 트리에 추가하되, 단순 표현용 내부 컴포넌트는
생략한다.
