# Main/Auth·RAG 통합 구현 위치

실제 UI 위에 인증과 RAG를 연결한 코드 위치를 빠르게 찾기 위한 문서다. 인증 규격은
[`../contracts/platform-auth.md`](../contracts/platform-auth.md)를 따른다.

## Route

- `apps/web/app/(participant)/[feature]/[[...screen]]/page.tsx`: 공개·참여자 Main/Auth와 RAG 화면
- `apps/web/app/(admin)/admin/[feature]/[[...screen]]/page.tsx`: 관리자 Main/Auth와 RAG 화면
- `apps/web/app/api/v1/[...path]/route.ts`: 허용 목록 기반 Main/Auth BFF
- `apps/web/app/api/v1/rag/**`: RAG BFF
- `apps/web/app/auth/refresh/page.tsx`: path-scoped Refresh Token을 이용하는 갱신 화면
- `apps/web/app/stream/rag/queries/[jobId]/route.ts`: RAG SSE 프록시

## 인증 코드

- `apps/web/lib/auth/require-session.ts`: Server Component 사용자 확인
- `apps/web/lib/auth/require-admin.ts`: role·permission 기반 관리자 확인
- `apps/web/lib/auth/shell-session-client.ts`: Main/Auth `/me` 응답을 최소 Shell 모델로 변환
- `apps/web/lib/auth/authenticated-fetch.ts`: `401 -> refresh -> 1회 재시도`
- `apps/web/lib/api/main-auth-client.ts`: Main/Auth same-origin 프록시와 CSRF 처리
- `apps/web/lib/server/civic-auth/production-credential-adapter.ts`: 동일 Access Token 전달 경계

## UI 코드

- `apps/web/components/platform-shell/**`: `frontend2` 원본 `393 × 852` 참여자 레이아웃
- `apps/web/components/shell/participant-shell.tsx`: 원본 Platform Shell에 이관 UI를 넣는 adapter
- `apps/web/components/screens/auth-functional-screen.tsx`: 로그인·가입·복구
- `apps/web/components/screens/account-functional-screen.tsx`: 계정·보안
- `apps/web/components/screens/admin-functional-screen.tsx`: 사용자·역할·permission 관리
- `apps/web/components/rag/participant-rag-screen.tsx`: 문서 기반 사용자 질의
- `apps/web/components/rag/admin-rag-screen.tsx`: 폴더·문서·업로드·작업 관리
- `apps/web/components/rag/admin-rag-analytics.tsx`: RAG 분석
- `apps/web/components/rag/admin-rag-crawler.tsx`: 수집 소스 관리

Chat·Vote·Task·Simulation은 현재 placeholder이며 이 문서의 통합 범위에 포함되지 않는다.
참여자·공개 사용자 화면은 기능과 관계없이 정확히 하나의 `PlatformShell` 안에서 렌더링한다.
