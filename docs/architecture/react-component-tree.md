# apps/web React component tree

이 문서는 `apps/web/app/layout.tsx`의 `RootLayout`을 시작점으로, Next.js App Router가 구성하는 정적 React 컴포넌트 관계를 정리한다. CodeGraph의 symbol/call-path 탐색 결과를 기준으로 `apps/web/app`의 UI special file과 `apps/web/components`의 JSX 사용 위치를 교차 확인했다.

## 표기 규칙과 범위

- `[Server]`: App Router가 Server Component로 렌더링하며 Client module graph에 포함되지 않은 컴포넌트
- `[Client]`: `"use client"` 경계를 선언했거나 해당 경계가 시작한 Client module graph에 포함된 컴포넌트
- `[conditional]`: 컴포넌트가 조건에 따라 출력 분기를 선택하거나 `null`을 반환하고, 또는 App Router가 런타임 상태에 따라 선택하는 UI
- `[dynamic]`: `next/dynamic`, `React.lazy`, `lazy()` 또는 동적 `import()`로 로드되는 컴포넌트
- `[slot: ...]`: `children`, slot, provider처럼 소스만으로 실제 자식을 하나로 확정할 수 없는 관계
- `div`, `section`, `main`, `header` 등의 intrinsic HTML element는 제외했다.
- `next/link`의 `Link`처럼 프로젝트 외부에서 정의된 컴포넌트도 제외했다.
- 조사 범위에서 `[dynamic]`에 해당하는 컴포넌트는 확인되지 않았다.
- 조건부로 렌더링되는 intrinsic element는 트리에 나타내지 않는다. 프로젝트 정의 컴포넌트 호출이 조건식 안에 있으면 `[conditional]`로 표시한다.

## Route `/`

`RootLayout`의 `children`은 App Router가 현재 route segment에 맞게 제공한다. 이 route에서는 `HomePage`로 확정된다. `AppShell`은 `children`의 구체 타입을 알지 못하고 전달받아 렌더링한다.

```text
RootLayout [Server] (apps/web/app/layout.tsx)
└── AppShell [Client] (apps/web/components/app-shell.tsx)
    ├── NativeBridgeRuntime [Client] (apps/web/components/native-bridge-runtime.tsx)
    └── AppUpdateGate [Client] [conditional] (apps/web/components/app-update-gate.tsx)
        ├── 조건: 필수 업데이트이면 안내 UI를 렌더링하고 전달받은 children은 렌더링하지 않음
        ├── AppInstallBanner [Client] [conditional] (apps/web/components/app-install-banner.tsx)
        │   └── 조건: store URL이 없으면 null 반환
        └── children [slot: App Router가 route child를 제공]
            └── HomePage [Server] (apps/web/app/page.tsx)
                ├── TemporaryLoginPanel [Client] [conditional] (apps/web/components/temporary-login-panel.tsx)
                │   └── 조건: NODE_ENV가 production이 아닐 때만 렌더링
                ├── RuntimeQueryPanel [Client] (apps/web/components/runtime-query-panel.tsx)
                ├── UpstreamHealthPanel [Client] (apps/web/components/upstream-health-panel.tsx)
                └── NativeBridgePanel [Client] (apps/web/components/native-bridge-panel.tsx)
```

`TemporaryLoginPanel`, `RuntimeQueryPanel`, `UpstreamHealthPanel`, `NativeBridgePanel` 내부에는 조건부 UI가 있지만 모두 intrinsic HTML element이므로 이 컴포넌트 트리에는 별도 자식으로 표시하지 않는다.

## Route `/chat`와 `/chat/[roomId]`

`ChatLayout`은 채팅 route segment의 공통 Query Client를 `ChatQueryProvider`에서 생성하고,
그 안에 `ChatRealtimeProvider`를 배치한다. 실시간 Provider는 STOMP Client를 직접 노출하지
않고 교체 가능한 transport를 제공하므로, 이후 연결 소유권을 SharedWorker로 옮겨도 하위 채팅
컴포넌트의 사용 계약은 유지된다. 목록에서는 `ChatPage`, 방 상세에서는 `ChatRoomPage`가
Provider의 `children` slot으로 전달된다.

```text
RootLayout [Server] (apps/web/app/layout.tsx)
└── AppShell [Client] (apps/web/components/app-shell.tsx)
    ├── NativeBridgeRuntime [Client] (apps/web/components/native-bridge-runtime.tsx)
    └── AppUpdateGate [Client] [conditional] (apps/web/components/app-update-gate.tsx)
        ├── AppInstallBanner [Client] [conditional] (apps/web/components/app-install-banner.tsx)
        └── children [slot: App Router가 route child를 제공]
            └── ChatLayout [Server] (apps/web/app/chat/layout.tsx)
                └── ChatQueryProvider [Client] (apps/web/components/chat-query-provider.tsx)
                    └── ChatRealtimeProvider [Client] (apps/web/components/chat-realtime-provider.tsx)
                        └── children [slot: nested page를 제공]
                            ├── route /chat: ChatPage [Server] (apps/web/app/chat/page.tsx)
                            │   └── ChatConnectionStatus [Client] (apps/web/components/chat-connection-status.tsx)
                            └── route /chat/[roomId]: ChatRoomPage [Server] (apps/web/app/chat/[roomId]/page.tsx)
                                └── ChatConnectionStatus [Client] (apps/web/components/chat-connection-status.tsx)
```

`ChatQueryProvider`가 렌더링하는 `ReactQueryDevtools`는 프로젝트 외부 컴포넌트이므로 트리에서
제외한다. Devtools 출력은 development 환경에서만 활성화된다.

## Route `/architecture`

`/architecture`에는 별도의 nested layout이 없다. 따라서 root layout의 `children`이 바로 `ArchitecturePage`로 결정된다.

```text
RootLayout [Server] (apps/web/app/layout.tsx)
└── AppShell [Client] (apps/web/components/app-shell.tsx)
    ├── NativeBridgeRuntime [Client] (apps/web/components/native-bridge-runtime.tsx)
    └── AppUpdateGate [Client] [conditional] (apps/web/components/app-update-gate.tsx)
        ├── 조건: 필수 업데이트이면 안내 UI를 렌더링하고 전달받은 children은 렌더링하지 않음
        ├── AppInstallBanner [Client] [conditional] (apps/web/components/app-install-banner.tsx)
        │   └── 조건: store URL이 없으면 null 반환
        └── children [slot: App Router가 route child를 제공]
            └── ArchitecturePage [Server] (apps/web/app/architecture/page.tsx)
```

`ArchitecturePage`는 프로젝트에서 정의한 다른 React 컴포넌트를 렌더링하지 않는다.

## App Router special UI

다음 파일은 일반 route page가 아니라 root app segment에 연결된 App Router special file이다. 어떤 boundary와 runtime 상태에서 실제로 선택되는지는 Next.js가 관리하며, 프로젝트 소스에는 이들을 `RootLayout`이나 `AppShell`이 직접 JSX 자식으로 호출하는 관계가 없다. 따라서 아래 항목은 직접 부모를 추정하지 않고 독립된 framework-managed branch로 표시한다.

```text
Loading [Server] [conditional: loading state]
(apps/web/app/loading.tsx)

ErrorPage [Client] [conditional: uncaught route error]
(apps/web/app/error.tsx)

NotFound [Server] [conditional: unmatched route 또는 notFound()]
(apps/web/app/not-found.tsx)
```

세 special component 모두 프로젝트에서 정의한 다른 React 컴포넌트를 렌더링하지 않는다.

## 전체 component dependency graph

실선은 소스에 직접 나타나는 프로젝트 컴포넌트 렌더링 관계다. 점선은 App Router 또는 `children` slot이 런타임에 결정하는 관계다. `AppUpdateGate`는 정책 판정에 따라 전달받은 `children` 또는 자체 안내 UI를 선택하며, `AppInstallBanner`와 `TemporaryLoginPanel`은 조건부 관계를 edge label에 표시했다.

```mermaid
flowchart TD
    RootLayout["RootLayout [Server]<br/>apps/web/app/layout.tsx"]
    AppShell["AppShell [Client]<br/>apps/web/components/app-shell.tsx"]
    NativeBridgeRuntime["NativeBridgeRuntime [Client]<br/>apps/web/components/native-bridge-runtime.tsx"]
    AppUpdateGate["AppUpdateGate [Client] [conditional]<br/>apps/web/components/app-update-gate.tsx"]
    AppInstallBanner["AppInstallBanner [Client] [conditional]<br/>apps/web/components/app-install-banner.tsx"]
    ChildrenSlot["children slot<br/>App Router가 실제 자식을 결정"]

    HomePage["HomePage [Server]<br/>apps/web/app/page.tsx"]
    TemporaryLoginPanel["TemporaryLoginPanel [Client] [conditional]<br/>apps/web/components/temporary-login-panel.tsx"]
    RuntimeQueryPanel["RuntimeQueryPanel [Client]<br/>apps/web/components/runtime-query-panel.tsx"]
    UpstreamHealthPanel["UpstreamHealthPanel [Client]<br/>apps/web/components/upstream-health-panel.tsx"]
    NativeBridgePanel["NativeBridgePanel [Client]<br/>apps/web/components/native-bridge-panel.tsx"]

    ChatLayout["ChatLayout [Server]<br/>apps/web/app/chat/layout.tsx"]
    ChatQueryProvider["ChatQueryProvider [Client]<br/>apps/web/components/chat-query-provider.tsx"]
    ChatRealtimeProvider["ChatRealtimeProvider [Client]<br/>apps/web/components/chat-realtime-provider.tsx"]
    ChatChildrenSlot["chat children slot<br/>nested page를 제공"]
    ChatPage["ChatPage [Server]<br/>apps/web/app/chat/page.tsx"]
    ChatRoomPage["ChatRoomPage [Server]<br/>apps/web/app/chat/[roomId]/page.tsx"]
    ChatConnectionStatus["ChatConnectionStatus [Client]<br/>apps/web/components/chat-connection-status.tsx"]

    ArchitecturePage["ArchitecturePage [Server]<br/>apps/web/app/architecture/page.tsx"]

    SpecialBoundary["App Router root-segment special UI<br/>framework-managed; direct JSX parent 미확정"]
    Loading["Loading [Server] [conditional]<br/>apps/web/app/loading.tsx"]
    ErrorPage["ErrorPage [Client] [conditional]<br/>apps/web/app/error.tsx"]
    NotFound["NotFound [Server] [conditional]<br/>apps/web/app/not-found.tsx"]

    RootLayout --> AppShell
    AppShell --> NativeBridgeRuntime
    AppShell -->|"update policy branch"| AppUpdateGate
    AppUpdateGate -->|"component output conditional"| AppInstallBanner
    AppUpdateGate --> ChildrenSlot

    ChildrenSlot -. "route /" .-> HomePage
    HomePage -->|"non-production only"| TemporaryLoginPanel
    HomePage --> RuntimeQueryPanel
    HomePage --> UpstreamHealthPanel
    HomePage --> NativeBridgePanel

    ChildrenSlot -. "route /chat" .-> ChatLayout
    ChatLayout --> ChatQueryProvider
    ChatQueryProvider --> ChatRealtimeProvider
    ChatRealtimeProvider --> ChatChildrenSlot
    ChatChildrenSlot -. "route /chat" .-> ChatPage
    ChatChildrenSlot -. "route /chat/[roomId]" .-> ChatRoomPage
    ChatPage --> ChatConnectionStatus
    ChatRoomPage --> ChatConnectionStatus

    ChildrenSlot -. "route /architecture" .-> ArchitecturePage

    SpecialBoundary -. "loading state" .-> Loading
    SpecialBoundary -. "error state" .-> ErrorPage
    SpecialBoundary -. "not-found state" .-> NotFound

    classDef server fill:#e8f1ff,stroke:#2563eb,color:#172554;
    classDef client fill:#fff1e6,stroke:#ea580c,color:#431407;
    classDef framework fill:#f3f4f6,stroke:#6b7280,color:#111827,stroke-dasharray:5 5;

    class RootLayout,HomePage,ChatLayout,ChatPage,ChatRoomPage,ArchitecturePage,Loading,NotFound server;
    class AppShell,NativeBridgeRuntime,AppUpdateGate,AppInstallBanner,TemporaryLoginPanel,RuntimeQueryPanel,UpstreamHealthPanel,NativeBridgePanel,ChatQueryProvider,ChatRealtimeProvider,ChatConnectionStatus,ErrorPage client;
    class ChildrenSlot,ChatChildrenSlot,SpecialBoundary framework;
```
