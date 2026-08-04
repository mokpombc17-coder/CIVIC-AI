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
        ├── TemporaryLoginControl [Client] [conditional] (apps/web/components/temporary-login-control.tsx)
        │   └── 조건: NODE_ENV가 production이 아닐 때만 렌더링
        └── children [slot: App Router가 route child를 제공]
            └── HomePage [Server] (apps/web/app/page.tsx)
                ├── RuntimeQueryPanel [Client] (apps/web/components/runtime-query-panel.tsx)
                ├── UpstreamHealthPanel [Client] (apps/web/components/upstream-health-panel.tsx)
                └── NativeBridgePanel [Client] (apps/web/components/native-bridge-panel.tsx)
```

`TemporaryLoginControl`, `RuntimeQueryPanel`, `UpstreamHealthPanel`, `NativeBridgePanel` 내부에는 조건부 UI가 있지만 모두 intrinsic HTML element이므로 이 컴포넌트 트리에는 별도 자식으로 표시하지 않는다.

## Route `/chat`와 `/chat/[roomId]`

`ChatLayout`은 채팅 route segment의 공통 Query Client를 `ChatQueryProvider`에서 생성하고,
그 안에 `ChatRealtimeProvider`를 배치한다. 실시간 Provider는 STOMP Client를 직접 노출하지
않고 교체 가능한 transport를 제공한다. SharedWorker 지원 브라우저에서는 Worker가 STOMP Client를
소유하고, 미지원 단일 WebView에서는 Direct transport를 사용한다. 두 환경 모두 하위 채팅
컴포넌트의 사용 계약은 같다. 목록에서는 `ChatPage`, 방 상세에서는 `ChatRoomPage`가 Provider의
`children` slot으로 전달된다.

```text
RootLayout [Server] (apps/web/app/layout.tsx)
└── AppShell [Client] (apps/web/components/app-shell.tsx)
    ├── NativeBridgeRuntime [Client] (apps/web/components/native-bridge-runtime.tsx)
    └── AppUpdateGate [Client] [conditional] (apps/web/components/app-update-gate.tsx)
        ├── AppInstallBanner [Client] [conditional] (apps/web/components/app-install-banner.tsx)
        ├── TemporaryLoginControl [Client] [conditional] (apps/web/components/temporary-login-control.tsx)
        └── children [slot: App Router가 route child를 제공]
            └── ChatLayout [Server] (apps/web/app/chat/layout.tsx)
                └── ChatQueryProvider [Client] (apps/web/components/chat-query-provider.tsx)
                    └── ChatRealtimeProvider [Client] (apps/web/components/chat-realtime-provider.tsx)
                        ├── children [slot: nested page를 제공]
                            ├── route /chat: ChatPage [Server] (apps/web/app/chat/page.tsx)
                            │   └── ChatRoomListScreen [Client] (apps/web/components/chat-room-list-screen.tsx)
                            │       ├── RoomUnreadBadge [internal, conditional]
                            │       └── ChatConnectionStatus [Client] (apps/web/components/chat-connection-status.tsx)
                            └── route /chat/[roomId]: ChatRoomPage [Server] (apps/web/app/chat/[roomId]/page.tsx)
                                └── ChatRoomScreen [Client] (apps/web/components/chat-room-screen.tsx)
                                    └── ChatRoomView [Client] (apps/web/components/chat-room-view.tsx)
                                        ├── ChatRoomHeader [internal]
                                        │   └── ChatConnectionStatus [Client] [slot] (apps/web/components/chat-connection-status.tsx)
                                        ├── ChatMessageViewport [Client] (apps/web/components/chat-message-viewport.tsx)
                                        │   └── ChatMessageItem [Client] [virtualized, repeated] (apps/web/components/chat-message-item.tsx)
                                        │       └── ChatMessageActionsPopover [Client] [conditional] (apps/web/components/chat-message-actions-popover.tsx)
                                        ├── ChatRealtimeSyncStatus [Client] [slot, conditional] (apps/web/components/chat-realtime-sync-status.tsx)
                                        ├── ChatRoomSessionControls [Client] [slot] (apps/web/components/chat-room-session-controls.tsx)
                                        │   ├── ChatRoomSessionBanner [Client] (apps/web/components/chat-room-session-banner.tsx)
                                        │   └── ChatMessageComposer [Client] (apps/web/components/chat-message-composer.tsx)
                                        └── ChatRoomMembershipPanel [Client] [slot, conditional] (apps/web/components/chat-room-membership-panel.tsx)
                                            └── ChatRoomSettingsControl [Client] [conditional] (apps/web/components/chat-room-settings-dialog.tsx)
                        └── ChatRoomInboxRuntime [Client] [conditional] (apps/web/components/chat-room-inbox-runtime.tsx)
```

`ChatQueryProvider`가 렌더링하는 `ReactQueryDevtools`는 프로젝트 외부 컴포넌트이므로 트리에서
제외한다. Devtools 출력은 development 환경에서만 활성화된다. `ChatRealtimeSyncStatus`는
REST snapshot과 Worker buffer의 병합이 진행 중이거나 실패한 동안만 상태 UI를 렌더링하고,
동기화 완료 상태에서는 `null`을 반환한다.

`ChatRoomInboxRuntime`은 개인 inbox WebSocket 이벤트를 받아 Room inbox Query를 무효화하고,
현재 포커스된 탭에서 다른 Room의 CREATE 알림이 있을 때만 조건부 토스트를 렌더링한다.

`ChatRoomScreen`은 REST Query, realtime session, Outbox 확인 처리를 조립하는 container다.
`ChatRoomView` 이하 컴포넌트는 container가 만든 UI 전용 ViewModel과 callback 또는 ReactNode
slot만 받아 화면을 렌더링한다. `ChatRoomSessionControls`도 session 정책을 해석하는 container로
남고, 실제 배너와 입력 폼은 각각 `ChatRoomSessionBanner`, `ChatMessageComposer`가 담당한다.
메시지 수정·삭제 lifecycle과 transport command는 `ChatRoomScreen`의 container hook이 조립하고,
`ChatMessageActionsPopover`는 작성자 메시지의 입력·확인·진행 상태만 표시한다.
`ChatRoomMembershipPanel`은 활성 OWNER에게만 `ChatRoomSettingsControl`을 렌더링한다. 이
control은 설정 Dialog, 부분 patch 계산, update-settings mutation과 같은 멱등성 key 재시도를
소유하며, 멤버십 패널은 owner 여부와 배치만 담당한다.

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

실선은 소스에 직접 나타나는 프로젝트 컴포넌트 렌더링 관계다. 점선은 App Router 또는 `children` slot이 런타임에 결정하는 관계다. `AppUpdateGate`는 정책 판정에 따라 전달받은 `children` 또는 자체 안내 UI를 선택하며, `AppInstallBanner`와 `TemporaryLoginControl`은 조건부 관계를 edge label에 표시했다.

```mermaid
flowchart TD
    RootLayout["RootLayout [Server]<br/>apps/web/app/layout.tsx"]
    AppShell["AppShell [Client]<br/>apps/web/components/app-shell.tsx"]
    NativeBridgeRuntime["NativeBridgeRuntime [Client]<br/>apps/web/components/native-bridge-runtime.tsx"]
    AppUpdateGate["AppUpdateGate [Client] [conditional]<br/>apps/web/components/app-update-gate.tsx"]
    AppInstallBanner["AppInstallBanner [Client] [conditional]<br/>apps/web/components/app-install-banner.tsx"]
    ChildrenSlot["children slot<br/>App Router가 실제 자식을 결정"]

    HomePage["HomePage [Server]<br/>apps/web/app/page.tsx"]
    TemporaryLoginControl["TemporaryLoginControl [Client] [conditional]<br/>apps/web/components/temporary-login-control.tsx"]
    RuntimeQueryPanel["RuntimeQueryPanel [Client]<br/>apps/web/components/runtime-query-panel.tsx"]
    UpstreamHealthPanel["UpstreamHealthPanel [Client]<br/>apps/web/components/upstream-health-panel.tsx"]
    NativeBridgePanel["NativeBridgePanel [Client]<br/>apps/web/components/native-bridge-panel.tsx"]

    ChatLayout["ChatLayout [Server]<br/>apps/web/app/chat/layout.tsx"]
    ChatQueryProvider["ChatQueryProvider [Client]<br/>apps/web/components/chat-query-provider.tsx"]
    ChatRealtimeProvider["ChatRealtimeProvider [Client]<br/>apps/web/components/chat-realtime-provider.tsx"]
    ChatRoomInboxRuntime["ChatRoomInboxRuntime [Client] [conditional]<br/>apps/web/components/chat-room-inbox-runtime.tsx"]
    ChatChildrenSlot["chat children slot<br/>nested page를 제공"]
    ChatPage["ChatPage [Server]<br/>apps/web/app/chat/page.tsx"]
    ChatRoomListScreen["ChatRoomListScreen [Client]<br/>apps/web/components/chat-room-list-screen.tsx"]
    ChatRoomPage["ChatRoomPage [Server]<br/>apps/web/app/chat/[roomId]/page.tsx"]
    ChatRoomScreen["ChatRoomScreen [Client]<br/>apps/web/components/chat-room-screen.tsx"]
    ChatRoomView["ChatRoomView [Client]<br/>apps/web/components/chat-room-view.tsx"]
    ChatRoomHeader["ChatRoomHeader [internal]<br/>apps/web/components/chat-room-view.tsx"]
    ChatMessageViewport["ChatMessageViewport [Client]<br/>apps/web/components/chat-message-viewport.tsx"]
    ChatMessageItem["ChatMessageItem [Client] [virtualized] [repeated]<br/>apps/web/components/chat-message-item.tsx"]
    ChatMessageActionsPopover["ChatMessageActionsPopover [Client] [conditional]<br/>apps/web/components/chat-message-actions-popover.tsx"]
    ChatRoomMembershipPanel["ChatRoomMembershipPanel [Client]<br/>apps/web/components/chat-room-membership-panel.tsx"]
    ChatRoomSettingsControl["ChatRoomSettingsControl [Client] [conditional]<br/>apps/web/components/chat-room-settings-dialog.tsx"]
    ChatConnectionStatus["ChatConnectionStatus [Client]<br/>apps/web/components/chat-connection-status.tsx"]
    ChatRealtimeSyncStatus["ChatRealtimeSyncStatus [Client] [conditional]<br/>apps/web/components/chat-realtime-sync-status.tsx"]
    ChatRoomSessionControls["ChatRoomSessionControls [Client]<br/>apps/web/components/chat-room-session-controls.tsx"]
    ChatRoomSessionBanner["ChatRoomSessionBanner [Client]<br/>apps/web/components/chat-room-session-banner.tsx"]
    ChatMessageComposer["ChatMessageComposer [Client]<br/>apps/web/components/chat-message-composer.tsx"]

    SpecialBoundary["App Router root-segment special UI<br/>framework-managed; direct JSX parent 미확정"]
    Loading["Loading [Server] [conditional]<br/>apps/web/app/loading.tsx"]
    ErrorPage["ErrorPage [Client] [conditional]<br/>apps/web/app/error.tsx"]
    NotFound["NotFound [Server] [conditional]<br/>apps/web/app/not-found.tsx"]

    RootLayout --> AppShell
    AppShell --> NativeBridgeRuntime
    AppShell -->|"update policy branch"| AppUpdateGate
    AppUpdateGate -->|"component output conditional"| AppInstallBanner
    AppUpdateGate -->|"non-production only"| TemporaryLoginControl
    AppUpdateGate --> ChildrenSlot

    ChildrenSlot -. "route /" .-> HomePage
    HomePage --> RuntimeQueryPanel
    HomePage --> UpstreamHealthPanel
    HomePage --> NativeBridgePanel

    ChildrenSlot -. "route /chat" .-> ChatLayout
    ChatLayout --> ChatQueryProvider
    ChatQueryProvider --> ChatRealtimeProvider
    ChatRealtimeProvider --> ChatChildrenSlot
    ChatRealtimeProvider -->|"conditional toast"| ChatRoomInboxRuntime
    ChatChildrenSlot -. "route /chat" .-> ChatPage
    ChatChildrenSlot -. "route /chat/[roomId]" .-> ChatRoomPage
    ChatPage --> ChatRoomListScreen
    ChatRoomListScreen --> RoomUnreadBadge
    ChatRoomListScreen --> ChatConnectionStatus
    ChatRoomPage --> ChatRoomScreen
    ChatRoomScreen --> ChatRoomView
    ChatRoomView --> ChatRoomHeader
    ChatRoomHeader -->|"slot"| ChatConnectionStatus
    ChatRoomView --> ChatMessageViewport
    ChatMessageViewport -->|"confirmed / optimistic; visible range only"| ChatMessageItem
    ChatMessageItem -->|"author-owned ACTIVE message"| ChatMessageActionsPopover
    ChatRoomView -->|"slot; sync pending/error only"| ChatRealtimeSyncStatus
    ChatRoomView -->|"slot"| ChatRoomSessionControls
    ChatRoomSessionControls --> ChatRoomSessionBanner
    ChatRoomSessionControls --> ChatMessageComposer
    ChatRoomView -->|"slot"| ChatRoomMembershipPanel
    ChatRoomMembershipPanel -->|"active OWNER only"| ChatRoomSettingsControl

    SpecialBoundary -. "loading state" .-> Loading
    SpecialBoundary -. "error state" .-> ErrorPage
    SpecialBoundary -. "not-found state" .-> NotFound

    classDef server fill:#e8f1ff,stroke:#2563eb,color:#172554;
    classDef client fill:#fff1e6,stroke:#ea580c,color:#431407;
    classDef framework fill:#f3f4f6,stroke:#6b7280,color:#111827,stroke-dasharray:5 5;

    class RootLayout,HomePage,ChatLayout,ChatPage,ChatRoomPage,Loading,NotFound server;
    class AppShell,NativeBridgeRuntime,AppUpdateGate,AppInstallBanner,TemporaryLoginControl,RuntimeQueryPanel,UpstreamHealthPanel,NativeBridgePanel,ChatQueryProvider,ChatRealtimeProvider,ChatRoomInboxRuntime,ChatRoomScreen,ChatRoomView,ChatRoomHeader,ChatMessageHistory,ChatMessageList,ChatMessageItem,ChatConnectionStatus,ChatRealtimeSyncStatus,ChatRoomSessionControls,ChatRoomSessionBanner,ChatMessageComposer,ChatRoomMembershipPanel,ChatRoomSettingsControl,ErrorPage client;
    class ChildrenSlot,ChatChildrenSlot,SpecialBoundary framework;
```
