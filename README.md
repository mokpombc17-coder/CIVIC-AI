# CIVIC.AI Frontend

CIVIC의 Next.js 웹 애플리케이션과 Expo WebView 셸을 함께 관리한다. Wire Flow 기반 실제 사용자·관리자
UI, Main/Auth 연동, RAG 사용자 질의와 관리자 문서 관리 화면이 포함되어 있다. 참여자 화면은
`frontend2`가 원래 제공하던 `393 × 852` Platform Shell을 외곽 레이아웃으로 사용하고, 이관한 실제
기능 UI는 그 content 영역 안에서 렌더링한다.

## 현재 범위

- Main/Auth: 로그인, 회원가입, 비밀번호 재설정, 계정·보안, 사용자·권한 관리자 화면
- RAG: 사용자 질의, 답변·출처 확인, 피드백, 관리자 폴더·문서·업로드·작업·분석·크롤러 화면
- Chat 관리자: 전체 채팅방 목록·검색·상태 확인·즉시 종료, 대화 Export·분석, 생성 신청 승인·반려,
  카테고리 관리
- Vote 관리자: 과업 Draft 작성·수정, 예약·발행·마감·취소, 결과 조회·JSONL 다운로드
- Simulation 관리자: Vote 과업 선택, SONA 집계 패널 설정·비용 확인·실행, 상태·결과·과금 관리
- 공통: 기존 frontend2 참여자 Platform Shell, 관리자 Shell, 오류 화면, 모바일 bridge,
  설치·업데이트 안내
- 준비 중: 참여자 Chat·Vote

준비 중인 기능은 화면 레지스트리의 canonical 경로와 제목만 제공하며 WebSocket이나 백엔드 호출을
시작하지 않는다. 기존 `civic-ai-frontend`의 오래된 Chat 구현은 이 저장소로 복사하지 않았다.

## 인증 방식

브라우저는 Main/Auth가 발급한 두 HttpOnly 쿠키를 사용한다.

- `civic_ai_access_token`: `Path=/`, 15분 Access Token
- `civic_ai_refresh_token`: `Path=/api/v1/auth`, 회전형 Refresh Token

Access Token 만료로 API가 `401`을 반환하면 브라우저가 `POST /api/v1/auth/refresh`를 한 번 호출하고
원래 요청을 한 번만 재시도한다. 동시에 여러 요청이 만료되어도 Refresh Token 회전은 하나의 요청으로
직렬화한다. Next.js는 JWT를 발급·해석·저장하지 않는다. RAG와 Simulation 요청은 공개 nginx가
각 Resource Server로 직접 전달하며, Resource Server가 HttpOnly Access Token 쿠키 또는 Bearer를
검증한다. Chat·Vote 관리자 API와 Main/Auth만 Next.js BFF 경계를 유지한다.

세부 계약은 [`docs/contracts/platform-auth.md`](docs/contracts/platform-auth.md)에 있다.

## 환경 변수

`apps/web/.env.local`에 다음 값을 설정한다.

```dotenv
CIVIC_BROWSER_ORIGIN=http://localhost:3000
MAIN_AUTH_INTERNAL_URL=http://localhost:8080
CHAT_INTERNAL_URL=http://localhost:8082
VOTE_INTERNAL_URL=http://localhost:8083
CIVIC_DEV_RAG_UPSTREAM=http://127.0.0.1:8000
CIVIC_DEV_SIMULATION_UPSTREAM=http://127.0.0.1:8090
```

`CIVIC_DEV_*_UPSTREAM`은 `pnpm dev:web`에서만 loopback 리소스 서버를 same-origin 경로로 연결한다.
production Next.js에서는 무시되며, 운영 트래픽은 nginx가 각 Resource Server로 직접 전달한다.
브라우저에는 내부 서비스 URL이나 비밀 키를 노출하지 않는다. 외부 OAuth 로그인은 사용하지 않는다.

## 배포 전 도메인 교체

이 저장소의 공개 URL은 `example.com`으로 채워져 있다. 그대로 배포하면 `canonical`, `robots`,
`sitemap`, `llms.txt`가 `example.com`을 가리키므로, 배포 전에 다음 파일의 값을 자기 도메인으로 바꾼다.

- `apps/web/app/robots.ts`
- `apps/web/app/sitemap.ts`
- `apps/web/lib/home-search.ts`
- `apps/web/public/llms.txt`

테스트도 같은 URL을 검사하므로 `apps/web/lib/home-search.test.ts`, `apps/web/tests/robots.test.ts`,
`apps/web/tests/sitemap.test.ts`, `apps/web/tests/llms-txt.test.ts`도 함께 바꾼다.

## 실행과 검증

Node.js `24.18.0`, pnpm `11.15.1`을 사용한다.

```bash
pnpm install --frozen-lockfile
pnpm dev:web
```

전체 정적 검사·단위 테스트와 production build는 다음과 같다.

```bash
pnpm check
pnpm build
```

브라우저 시나리오는 목적에 맞는 Playwright 설정을 사용한다.

```bash
pnpm test:e2e
pnpm test:e2e:wireflow
pnpm test:e2e:milestone
```

## 주요 구조

```text
apps/web/app/                         Next.js route와 same-origin BFF
apps/web/components/platform-shell/  frontend2 원본 참여자 레이아웃
apps/web/components/platform-page-shell.tsx
                                      참여자 route용 Platform Shell 조립
apps/web/components/screens/          Main/Auth 실제 기능 화면
apps/web/components/rag/              사용자·관리자 RAG 실제 기능 화면
apps/web/components/admin/            Chat 승인·Vote 과업·Simulation 관리자 화면
apps/web/components/shell/            Platform Shell participant adapter·관리자 Shell
apps/web/components/wireflow/         Wire Flow 공용 UI
apps/web/lib/auth/                     로그인 상태·권한·자동 refresh
apps/web/lib/api/                      Main/Auth·Chat·Vote allowlist BFF
apps/mobile/                           Expo WebView native shell
packages/bridge/                       web/native bridge 계약
```

컴포넌트 책임은
[`docs/architecture/react-component-tree.md`](docs/architecture/react-component-tree.md)에 정리한다.
