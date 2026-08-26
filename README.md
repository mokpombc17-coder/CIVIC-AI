# CIVIC.AI Platform Shell Template

도메인 애플리케이션을 시작하기 위한 최소 Next.js 템플릿이다. 공통 모바일 Platform Shell과
Next.js App Router 연결만 포함하며, 웹 인증·Chat·Vote·RAG·Simulation 구현은 포함하지 않는다.
기존 `apps/mobile`과 `packages/bridge` workspace는 package 구성을 유지하기 위해 원본 그대로 둔다.

## 포함 범위

- Next.js `16.2.11`, React `19.2.3`, TypeScript `6.0.3`
- `393 × 852` mobile-first Platform Shell
- 공통 header, `self | child` scroll 책임, overlay 계층
- 홈·AI·토론방·투표·계정 bottom navigation
- `/home`, 404, loading, error의 기본 Shell 조립
- Platform Shell 단위·E2E 테스트와 사용 문서

## 시작하기

```bash
pnpm install
pnpm dev:web
```

전체 정적 검증은 다음 명령으로 실행한다.

```bash
pnpm check
pnpm build
pnpm test:e2e
```

## 구조

```text
apps/web/
  app/                         Next.js route와 특수 화면
  components/platform-shell/  패키징 가능한 공통 Shell
  components/platform-page-shell.tsx
                               일반 route용 Next.js adapter
  components/platform-navigation-client.tsx
                               pathname 기반 navigation adapter
  public/assets/               Platform Shell과 navigation 이미지
packages/typescript-config/    공통 TypeScript 설정
apps/mobile/                   유지된 Expo native shell workspace
packages/bridge/               유지된 web/native bridge contract
```

새 도메인은 `apps/web/app/<domain>`에 route를 만들고 일반 화면에서는 `PlatformPageShell`을
사용한다. 가상화처럼 자식이 scroll element를 직접 소유할 때만 `PlatformShell`의
`scroll="child"`를 사용한다.

현재 구현되지 않은 bottom navigation 경로는 로컬에서 공통 404 화면으로 연결된다. 인증은 운영
서버가 HttpOnly 쿠키로 제공한다는 계약만 전제로 하며, 이 템플릿은 JWT를 발급·저장·해석하지 않는다.

세부 사용법은 [`docs/architecture/platform-shell-usage.md`](docs/architecture/platform-shell-usage.md)를
참고한다.
