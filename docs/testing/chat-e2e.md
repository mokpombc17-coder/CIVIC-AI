# 채팅 Playwright E2E

이 테스트는 브라우저 API를 흉내 내지 않고 실제 Chromium을 실행해 다음 흐름을 검증한다.

```text
임시 로그인
→ 방 생성
→ 방 진입
→ SharedWorker WebSocket 및 STOMP 구독 준비
→ 메시지 전송
→ CHAT_MESSAGE_CREATED 화면 반영
→ 새로고침
→ REST 메시지 이력 복구
```

서로 격리된 Chromium 브라우저 컨텍스트 두 개로 서버의 연결 교체 정책도 검증한다.

```text
첫 번째 브라우저 WebSocket 연결
→ 같은 사용자의 두 번째 브라우저 WebSocket 연결
→ 첫 번째 연결의 4001 CONNECTION_REPLACED 상태 확인
→ 수동 재연결 버튼 미노출 확인
→ STOMP 기본 재연결 지연 이후에도 자동 재연결이 중단된 상태 확인
```

동일한 Chromium 브라우저 컨텍스트 안에서는 두 탭이 하나의 SharedWorker 연결을 공유하며 방
사용권을 전환하는 흐름을 검증한다.

```text
탭 A에서 방 활성화 및 초안 작성
→ 탭 B에서 같은 방 활성화
→ 탭 A의 ROOM_REPLACED 상태와 입력 중지 확인
→ 탭 A에서 "이 탭에서 다시 활성화" 실행
→ 탭 A의 입력 권한 및 초안 복구
→ 탭 B의 ROOM_REPLACED 상태 확인
```

## 사전 조건

Chat Resource Server와 MongoDB가 로컬 `http://localhost:8082`에서 실행 중이어야 한다.
테스트 시작 시 `GET /actuator/health`를 호출해 `UP`인지 먼저 확인한다.

Playwright 브라우저가 설치되지 않았다면 한 번 실행한다.

```bash
pnpm exec playwright install chromium
```

## 실행

일반 실행은 화면이 보이지 않는 headless Chromium을 사용한다.

```bash
pnpm test:e2e
```

자동으로 움직이는 브라우저를 직접 보려면 headed 모드를 사용한다.

```bash
pnpm test:e2e:headed
```

한 단계씩 멈추며 locator와 상태를 확인하려면 디버그 모드를 사용한다.

```bash
pnpm test:e2e:debug
```

Next.js 개발 서버는 Playwright가 자동으로 실행한다. 이미 `localhost:3000`에서 실행 중이면 로컬
테스트에서는 기존 서버를 재사용한다.

## 테스트 데이터와 결과물

각 실행은 UUID가 포함된 공개 채팅방과 메시지를 실제 로컬 MongoDB에 생성한다. 테스트 결과물은
`e2e/.artifacts` 아래에 생성되며 Git에는 포함되지 않는다.

테스트가 실패하면 HTML report, screenshot, video, trace를 확인할 수 있다.

```bash
pnpm exec playwright show-report e2e/.artifacts/report
```

기본 주소를 바꿔야 할 때는 셸 환경 변수로 덮어쓸 수 있다. 별도의 env 파일은 사용하지 않는다.

```bash
CHAT_E2E_WEB_BASE_URL=http://localhost:3000 \
CHAT_E2E_RESOURCE_SERVER_URL=http://localhost:8082 \
pnpm test:e2e
```
