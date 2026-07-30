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
→ 두 번째 브라우저 종료
→ 첫 번째 브라우저 새로고침 후 연결 복구
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

현재 사용권을 가진 탭이 종료되었을 때 남은 탭이 자동으로 선점하지 않고, 사용자 요청으로만
다시 활성화되는 정책도 검증한다.

```text
탭 B가 채팅방 사용권을 가진 상태에서 종료
→ 탭 A의 ROOM_REPLACED 상태와 입력 중지 유지
→ 탭 A에서 "이 탭에서 다시 활성화" 실행
→ 탭 A의 방 구독 및 입력 권한 복구
```

서로 다른 플랫폼 사용자에게 적용되는 메시지 접근 경계도 별도의 브라우저 컨텍스트로 검증한다.

```text
사용자 A가 방을 만들고 메시지 전송
→ 사용자 B가 공개 방에 신규 참여
→ B에게 참여 이전 메시지가 보이지 않는지 확인
→ A가 참여 이후 메시지 전송
→ B의 실시간 수신 확인
→ B 새로고침 후 REST 이력에도 참여 이후 메시지만 복구되는지 확인
```

재참여 테스트는 페이지를 새로 열지 않고 기존 TanStack Query cache가 남아 있는 문서에서
진행한다. 이를 통해 `REJOINED` 시 이전 참여 구간의 메시지 cache를 제거하는지까지 검증한다.

```text
사용자 B가 첫 참여 구간 메시지 수신
→ B가 방 나가기
→ 4002 ROOM_ACCESS_REVOKED 이후 공통 연결 복구
→ B의 퇴장 중 사용자 A가 메시지 전송
→ B가 같은 문서에서 재참여
→ 첫 참여 구간과 퇴장 중 메시지가 모두 보이지 않는지 확인
→ 재참여 이후 메시지의 실시간 수신 및 새로고침 복구 확인
```

현재 서버는 다른 활성 멤버가 남아 있으면 방 종료를 `409`로 거절한다. 따라서 `4003
ROOM_CLOSED`는 동일 사용자의 두 탭 중 하나가 활성 방 구독을 유지하고, 다른 비활성 탭에서
방장이 종료 Command를 실행하는 방식으로 검증한다.

```text
탭 A에서 방 생성
→ 탭 B가 같은 방의 실시간 사용권 선점
→ 비활성 탭 A에서 방 종료
→ 활성 탭 B가 4003 ROOM_CLOSED 수신
→ 공통 WebSocket 재연결 후에도 종료된 방은 terminal error 유지
→ 메시지 입력 및 "이 탭에서 다시 활성화" 차단 확인
```

메시지 이력 UI는 서버의 기본 최신 조회 크기보다 많은 52개 메시지를 만든 뒤
`beforeSequence` cursor를 실제로 사용하는지 검증한다.

```text
메시지 52개 전송
→ 새로고침 후 cursor 없는 최신 50개 복구
→ 첫 메시지는 보이지 않고 "이전 메시지 불러오기"가 표시되는지 확인
→ 버튼 클릭
→ beforeSequence=3 요청 확인
→ 과거 2개가 앞에 병합되고 전체 52개가 시간순으로 표시되는지 확인
```

재연결 복구 테스트는 한 사용자의 SharedWorker WebSocket만 Chromium DevTools Protocol로
오프라인 처리한다. 다른 사용자 연결은 유지해 단절 중 메시지를 실제 서버에 저장하고, 복귀한
클라이언트가 마지막 연속 sequence 다음부터 복구하는지 검증한다.

```text
사용자 A와 B가 같은 방에서 단절 전 메시지 수신
→ 사용자 A의 SharedWorker WebSocket 네트워크 단절
→ 사용자 B가 메시지 2개 전송
→ A 화면에는 아직 누락된 상태 확인
→ A의 네트워크 복귀
→ afterSequence=1 REST 요청 확인
→ 누락 메시지 2개가 기존 메시지 뒤에 병합되는지 확인
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
