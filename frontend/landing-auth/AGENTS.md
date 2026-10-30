## Repository rules

- 모든 작업은 시작 전에 최신 `origin/main`을 기준으로 작업 전용 Git worktree와 브랜치를 생성하고, 해당 worktree 안에서만 수행한다. 기본 체크아웃에서 직접 수정하지 않으며 다른 작업의 worktree를 재사용하지 않는다.
- 작업이 끝나고 필요한 검증을 통과하면 변경사항을 커밋하고 원격 브랜치에 푸시한 뒤, 반드시 `main`을 대상으로 하는 PR을 생성한다. PR이 생성되기 전에는 작업 완료로 보고하지 않는다.
- PR 병합이 확인되면 해당 작업에 사용한 worktree를 제거하고 `git worktree prune`으로 메타데이터를 정리한다. 미커밋 변경이 있거나 다른 작업에서 사용하는 worktree는 제거하지 않는다.
- 패키지 설치와 workspace 명령은 pnpm을 사용한다.
- 웹 제품 UI의 라우팅과 화면 구성은 Next.js가 소유한다.
- Expo 애플리케이션은 WebView와 모바일 운영체제 기능을 연결하는 얇은 네이티브 셸로 유지한다.
- 일반 HTTP 및 WebSocket 통신은 WebView 내부의 웹 애플리케이션에서 처리한다.
- 웹과 네이티브가 공유하는 bridge message contract는 `packages/bridge`에 정의한다.
- bridge contract를 변경할 때는 웹 송신 코드, 모바일 수신 코드 및 bridge 테스트를 함께 확인한다.
- 작업 완료 전 `pnpm check`를 실행한다.
- `docs/architecture/react-component-tree.md`는 주요 React 컴포넌트의 책임 경계와 논리적 조립 관계를 기록한다.
- `apps/web`에서 route/layout, Server·Client 경계, provider 범위, screen/container/view/feature control의 책임 또는 이들 사이의 조립 관계가 변경되면 해당 문서를 함께 갱신한다.
- 순수 표현용 내부 컴포넌트, HTML 구조, 스타일 변경 또는 책임 경계를 바꾸지 않는 JSX 리팩터링은 component tree에 추가하지 않는다.
