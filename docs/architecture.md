# Architecture decisions

## Runtime ownership

```text
Next.js Server Component
- initial data
- HTML/RSC generation
- server session
- Spring Boot query API

Next.js Client Component
- browser interaction
- temporary UI state
- WebSocket
- WebView bridge client

Next.js Server Action
- Next UI-specific mutation workflow
- Next cache invalidation
- redirect/refresh

Next.js Route Handler
- explicit HTTP endpoint
- useQuery/useMutation BFF boundary
- webhook/callback/file response

Expo native shell
- WebView lifecycle
- OS back button
- deep links
- app lifecycle
- native capability execution
```

## Data ownership

```text
Spring Boot/DB     domain state and final authorization
Next.js server     web session, page composition, web-only cache
Browser/WebView    React state and browser storage
Expo shell         native-only transient state and device capability data
```

## Why the bridge is a package

The installed native binary and deployed web application may have different release dates. A versioned schema makes incompatibility detectable.
The bridge package contains only transport contracts; it must not contain domain API DTOs or application state.

## Why no direct database access

The template does not grant the Next.js runtime access to the operational database. This keeps domain authorization, transaction boundaries,
and schema ownership in Spring Boot. Next.js may own a separate session store or web-specific cache when the application requires it.

## Detailed architecture documents

- [채팅 실시간 세션과 멀티탭 정책](./architecture/chat-realtime-session.md)
- [React component tree](./architecture/react-component-tree.md)
- [WebView bridge](./architecture/webview-bridge.md)
