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

## A1 deployment

### Release source and build

- A1에 배포할 수 있는 소스는 원격 `main`에 존재하는 정확한 커밋뿐이다. 배포 직전에 `git fetch origin main`을 실행하고 `git rev-parse HEAD`와 `git rev-parse origin/main`이 같은지, 작업 트리가 깨끗한지 확인한다.
- 이미지 태그는 `civic-release/web:<12자리 Git SHA>` 형식을 사용한다. `latest`, 브랜치명 또는 날짜만 있는 태그로 배포하지 않는다.
- A1 서버에서는 pnpm 설치, Next.js 빌드 또는 Docker 빌드를 하지 않는다. ARM64 빌드 호스트에서 다음 검증과 빌드를 수행한다.

```bash
pnpm install --frozen-lockfile
pnpm check

RELEASE_SHA="$(git rev-parse HEAD)"
RELEASE_TAG="$(git rev-parse --short=12 HEAD)"
RELEASE_IMAGE="civic-release/web:${RELEASE_TAG}"

docker buildx build --platform linux/arm64 --target verification --load \
  -t "civic-verify/web:${RELEASE_TAG}" .
docker buildx build --platform linux/arm64 --load \
  --label "org.opencontainers.image.revision=${RELEASE_SHA}" \
  --label 'org.opencontainers.image.source=https://github.com/Ham-n-Cheeze/civic-ai-frontend2' \
  -t "${RELEASE_IMAGE}" .
```

- 빌드 후 이미지의 `linux/arm64`, OCI revision/source label, 런타임 사용자 `10001:10001`을 검사한다. 레지스트리를 사용할 수 있으면 정확한 digest로 push/pull한다. 레지스트리를 사용할 수 없으면 `docker save`로 압축 archive를 만들고 SHA-256을 기록하여 전달한다. 빌드 호스트 image ID와 A1에서 load된 image ID는 달라질 수 있으므로 A1에서도 플랫폼·label·사용자·image ID를 다시 검사한다.

### A1 cutover

- 현재 실행 중인 `civic-a1-dev-web-1`의 `com.docker.compose.project.config_files`와 `com.docker.compose.project.working_dir` label에서 실제 Compose 파일 목록과 순서를 읽는다. 문서에 적힌 과거 release 경로나 임의의 base YAML 목록을 재사용하지 않는다.
- `/etc/civic/a1-dev.env`와 `/etc/civic/a1-dev-images.env`를 유지하고 비밀값을 이미지나 overlay에 넣지 않는다.
- `/etc/civic/front2-main-<12자리 SHA>.yaml`에는 `web.image`만 새 불변 이미지로 덮어쓴다. 동시에 이전 image를 가리키는 `/etc/civic/front2-main-<12자리 SHA>.rollback.yaml`을 만든다.
- 현재 Compose 파일 목록 뒤에 release overlay 또는 rollback overlay를 각각 마지막 `-f`로 추가하여 두 구성 모두 `docker compose config --quiet`를 통과시키고, 렌더된 `web.image`가 의도한 값인지 확인한다.
- 전환 직전 기존 컨테이너의 image, image ID, health, restart count와 시작 시간을 기록한다. 그 뒤에만 다음과 같이 Web 하나만 교체한다.

```bash
docker compose <현재 env/project/profile 및 -f 목록> \
  -f /etc/civic/front2-main-<12자리 SHA>.yaml \
  up -d --no-build --no-deps web
```

- 컨테이너가 제한 시간 안에 `running/healthy`가 되지 않거나 image ID·revision label이 다르면 즉시 rollback overlay로 같은 명령을 실행한다. Front2 배포만으로 Nginx를 재빌드하거나 reload하지 않는다. 라우팅 변경이 포함된 별도 작업일 때만 Nginx 설정 검증과 fail-closed 복구 절차를 추가한다.

### Acceptance and deployment record

- `https://civic-ai.co.kr/healthz`, `/home`, 변경된 사용자·관리자 화면을 공개 origin으로 확인한다. 인증이 필요한 대표 API는 비인증 요청에서 예상한 `401`을 반환해야 한다.
- `/home` HTML이 참조하는 모든 `/main-assets/_next/static/` JS/CSS를 공개 origin에서 가져와 상태 `200`, 올바른 JavaScript/CSS content type, HTML fallback이 아님을 확인한다. `/_next/static/`이 직접 노출되면 성공으로 간주하지 않는다.
- 컨테이너 health, restart count `0`, `OOMKilled=false`, 전환 이후 오류 로그, 공개 Nginx `5xx`를 확인한다. 로그인 후 기능을 변경했다면 실제 인증 브라우저 흐름까지 확인해야 GUI 배포 완료라고 표현할 수 있다.
- 배포 기록에는 Git SHA, image tag와 registry digest 또는 A1 image ID, `linux/arm64`, release/rollback overlay, Compose project/config 경로, health, 공개 smoke, 정적 자산 검사 결과, rollback 명령을 남긴다. Front2 단독 배포에는 DB migration이 없었다는 사실도 명시한다.
