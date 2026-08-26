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
→ 첫 메시지는 보이지 않고 최신 메시지가 표시되는지 확인
→ 메시지 Viewport 상단으로 스크롤
→ beforeSequence=3 요청 확인
→ 과거 2개가 앞에 병합되어도 기존 첫 가시 메시지의 화면 위치가 유지되는지 확인
→ 다시 상단·하단으로 스크롤해 가장 오래된 메시지와 최신 메시지를 확인
→ 논리 메시지는 52개를 유지하되 실제 DOM에는 가상화된 일부 행만 렌더링되는지 확인
```

새 메시지 Viewport UX는 서로 다른 사용자 두 명을 같은 방에 연결한 뒤, 수신 사용자가 과거
메시지를 읽고 있는 상태에서 실시간 메시지를 보내 검증한다. 자기 메시지 전송에 따른 의도적인
하단 이동과 타인의 메시지 수신을 분리하기 위해 별도의 브라우저 컨텍스트를 사용한다.

```text
사용자 A와 B가 같은 공개 방에 참여
→ 스크롤 가능한 초기 메시지 이력 생성
→ 사용자 B가 과거 메시지 위치로 이동
→ 사용자 A가 실시간 메시지 2개 전송
→ B의 첫 가시 메시지, viewport 내부 offset, scrollTop 유지 확인
→ "새 메시지 2개" 안내 버튼 확인
→ 안내 버튼 클릭
→ 최신 메시지 표시와 정확한 하단 이동 확인
→ 새 메시지 안내 버튼 제거 확인
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

사용자별 메시지 사용량 제한은 매 실행마다 고유한 플랫폼 사용자를 발급하고 token cost가 5인
메시지 세 개를 연속으로 보내 실제 `USER_RATE_LIMITED`와 FIFO queue를 함께 검증한다.
Optimistic 메시지 행의 `data-delivery-status`를 E2E 관찰 지점으로 사용한다.

```text
고유 사용자로 임시 로그인
→ cost 5 메시지로 사용자 token bucket 소진
→ 두 번째 cost 5 메시지 전송
→ retry-waiting 진입 확인
→ composer가 잠기지 않은 상태에서 세 번째 메시지 전송
→ 세 번째 메시지가 queued로 표시되는지 확인
→ 오류 배너 없이 jitter 대기 뒤 두 메시지를 FIFO로 자동 재전송
→ optimistic 항목이 실제 서버 메시지로 교체되는지 확인
→ 새로고침 후 REST 이력에도 세 메시지가 각각 한 번만 복구되는지 확인
```

작성자 메시지 수정·삭제는 서로 다른 두 사용자를 같은 방에 참여시켜 command result와 room
event, REST snapshot을 함께 검증한다. 메시지 행의 불변 `clientMessageId`를 사용해 수정·삭제
후에도 동일한 목록 위치가 유지되는지 확인한다.

```text
사용자 A와 B가 같은 공개 방에 참여
→ A가 메시지를 보내고 양쪽에서 확정 snapshot 확인
→ B에게는 메시지 수정·삭제 액션이 노출되지 않는지 확인
→ A가 앞뒤 공백이 있는 내용으로 수정
→ 정규화된 내용과 (수정됨) 표시가 양쪽에 실시간 반영되는지 확인
→ 같은 내용으로 다시 수정
→ room event가 없는 UNCHANGED에서도 command result로 pending 종료 확인
→ A가 메시지 삭제
→ 기존 clientMessageId 행이 양쪽에서 tombstone으로 바뀌는지 확인
→ 양쪽 새로고침 후 REST 이력에서도 tombstone 복구 확인
```

사용자별 Room inbox는 참여자가 목록 화면을 보고 있는 동안 다른 사용자가 메시지를 생성·수정·삭제하는
실제 개인 WebSocket 이벤트와 authoritative REST 재조회를 함께 검증한다.

```text
사용자 A와 B가 같은 공개 방에 참여
→ B가 채팅방 목록에서 개인 inbox 구독 유지
→ A의 메시지 생성으로 B의 토스트, latest preview, last activity와 unread badge 갱신
→ B가 방에 진입해 메시지를 실제 렌더링
→ PUT /read-state 성공 후 목록 badge 제거
→ A가 latest message를 수정
→ UPDATE 토스트 없이 authoritative preview 재조회
→ A가 새 unread 메시지를 생성한 뒤 삭제
→ DELETE 토스트 없이 Room inbox 재조회로 badge 제거와 tombstone preview 확인
```

Read-state 신뢰성은 `/chat` provider 수명, 실제 viewport 판정과 같은 브라우저의 탭 간
confirmation을 실제 SharedWorker 경로로 검증한다.

```text
탭 A는 Room inbox, 탭 B는 같은 사용자의 채팅방 화면 유지
→ 탭 B가 focus를 잃은 동안 새 메시지가 도착해 탭 A unread badge 표시
→ 탭 B focus와 최신 메시지 확인 뒤 PUT 성공
→ SharedWorker confirmation으로 탭 A가 Room inbox를 재조회해 badge 제거

read-state PUT을 retryable 503으로 bounded retry까지 실패
→ Next.js 링크로 방 화면을 unmount하고 /chat 목록으로 이동
→ focus lifecycle에서 provider가 보존한 sequence 재전송

방 정보 overlay open 상태에서 새 메시지 렌더링
→ overlay 동안 PUT 없음
→ overlay close 뒤 viewport 재평가와 PUT 성공
```

채팅방 참여 정원은 OWNER를 포함한 서로 다른 사용자로 실제 ACTIVE 인원을 채운 뒤 검증한다.

```text
OWNER가 공개 방 생성
→ 서로 다른 사용자 49명이 참여해 ACTIVE 인원 50명 도달
→ 51번째 사용자의 참여 요청이 ROOM_MEMBER_LIMIT_EXCEEDED로 거절
→ 한국어 안내와 참여 버튼 복구 확인
→ 같은 Idempotency-Key 재전송은 replayed=true 확인
→ 사용자가 참여 버튼을 다시 누르면 새로운 Idempotency-Key 사용 확인
```

사용자별 ACTIVE Room quota는 한 사용자의 실제 Room을 quota까지 생성한 뒤 CREATE와 JOIN 흐름을
함께 검증한다.

```text
사용자 M이 ACTIVE Room quota까지 Room 생성
→ 추가 CREATE가 USER_ACTIVE_ROOM_LIMIT_EXCEEDED로 거절
→ form 유지, 한국어 안내, pending 해제와 재시도 버튼 미노출 확인
→ 같은 Idempotency-Key 재전송은 replayed=true 확인
→ 기존 Room 하나 종료 후 새 key의 CREATE 성공
→ 다시 quota가 찬 상태에서 공개 Room JOIN 거절
→ 같은 Idempotency-Key 재전송은 replayed=true 확인
→ 기존 Room 하나 종료 후 새 key의 JOIN 성공
```

공개 방 검색·필터는 고유한 제목을 공유하는 OPEN Room 21개를 실제 API로 만든 뒤, 브라우저
검색 UI와 cursor pagination이 같은 조건을 유지하는지 검증한다.

```text
검색어 입력 후 검색 버튼 제출
→ query trim, joinPolicy=OPEN, category 생략과 cursor 없는 첫 page 확인
→ 공개 방 더 보기에서 같은 조건과 서버 nextCursor 전달 확인
→ REST 응답과 DOM의 21개 Room ID가 중복·누락 없이 일치하는지 확인
→ 카테고리 변경만으로 cursor 없는 첫 page 즉시 재조회
→ 공백 검색어 제출 시 query를 생략하고 선택 category 유지
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

서로 다른 사용자용 Chromium 창을 겹치지 않게 자동 배치하려면 창 타일링을 활성화한다.
두 창은 좌우로, 세 창은 한 줄에 나란히 배치한다. 이 옵션은 headed 로컬 실행에서만
사용하며 기본 E2E 및 CI 실행에는 영향을 주지 않는다.

```bash
CHAT_E2E_TILE_WINDOWS=true pnpm test:e2e:headed
```

한 단계씩 멈추며 locator와 상태를 확인하려면 디버그 모드를 사용한다.

```bash
pnpm test:e2e:debug
```

사용자별 ACTIVE Room quota만 실행하려면 다음 명령을 사용한다.

```bash
pnpm exec playwright test e2e/chat-user-active-room-limit.spec.ts
```

공개 방 검색·필터만 실행하려면 다음 명령을 사용한다.

```bash
pnpm exec playwright test e2e/chat-public-room-search.spec.ts
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

백엔드의 사용자별 ACTIVE Room quota를 기본값과 다르게 실행했다면 E2E fixture 수도 같은 값으로
맞춘다. 이 환경 변수는 테스트 fixture 구성에만 사용되며 제품 UI 계약은 아니다.

```bash
CHAT_E2E_USER_ACTIVE_ROOM_LIMIT=20 \
pnpm exec playwright test e2e/chat-user-active-room-limit.spec.ts
```

## 자동화 확대 결정 기록

2026-08-10 기준 프로젝트는 로컬 개발 단계다. Chat Resource Server와 MongoDB는 별도
저장소와 로컬 Compose 환경에서 계속 변경되고 있으며, 프론트 저장소의 GitHub Actions가
두 서비스를 재현 가능하게 기동하는 계약은 아직 없다.

따라서 현재는 다음 검증 방식을 유지한다.

```text
Backend와 MongoDB를 로컬에서 실행
→ 기능 handoff와 변경 범위에 맞는 Playwright 시나리오 실행
→ 주요 연동 완료 시 전체 Playwright 실행
→ pnpm check와 pnpm build:web 실행
```

현재 GitHub Actions의 필수 검사는 `pnpm check`와 `pnpm build:web`이다. Playwright는
로컬에서 명시적으로 실행하며, 다음 자동화는 아직 추가하지 않는다.

```text
PR마다 실행하는 Playwright smoke
main push 또는 nightly 전체 Playwright
production build(next start) 대상 브라우저 smoke
CI 전용 Backend 이미지 또는 MongoDB fixture
```

이 항목들은 불필요해서 제외한 것이 아니라, 다음 선행 조건이 마련될 때 다시 검토한다.

```text
GitHub Actions에서 Backend와 MongoDB를 기동하는 명령 및 readiness 계약 확정
CI 실행마다 사용할 Backend commit 또는 image 식별 방법 확정
여러 개발자가 PR 검증을 공유해야 하는 단계 진입
staging 또는 첫 배포 준비
production smoke에서 사용할 인증 방식 확정
Safari 또는 Expo WebView의 공식 지원 범위 확정
```

자동화 재검토 시 권장 순서는 다음과 같다.

1. `chat-message-smoke.spec.ts` 하나를 PR CI에서 실행하는 최소 실험
2. 실행 시간과 flaky 비율을 반복 측정
3. main push 또는 nightly에 전체 E2E 적용 여부 결정
4. staging 또는 CI 전용 인증으로 production build smoke 추가 여부 결정

GitHub-hosted runner에서 nightly를 실행한다면 개발자 개인 컴퓨터를 켜둘 필요는 없다. 다만
Backend와 MongoDB를 runner 안에서 준비할 방법이 확정되기 전에는 nightly workflow를 만들지
않는다.

## Room 생성 승인 모드 후속 E2E

현재 Chat Playwright suite는 로컬 Backend의 `DIRECT` 생성 모드를 기준으로 한다.
사용자 측 프론트엔드는 `201 APPROVED`, `202 PENDING`, `200 REJECTED/CANCELED replay`
계약과 신청 목록·상세·취소를 단위 테스트로 검증한다. 다만 실제 관리자 결정이
포함된 브라우저 E2E는 현재 로컬 기본 실행에서 제외한다.

후속 E2E는 다음 fixture가 공유 가능해진 뒤 추가한다.

```text
CHAT_ROOM_CREATION_MODE=APPROVAL_REQUIRED로 고정된 Backend 실행 방법
일반 사용자 JWT
chat:rooms:approve scope를 가진 관리자 JWT
테스트가 생성한 신청을 관리자 API로 결정하는 fixture
```

필수 시나리오:

```text
사용자가 Room 생성 요청
→ 202 PENDING과 신청 상세 진입
→ 관리자 승인 후 수동 상태 재조회
→ APPROVED와 생성된 Room 이동

PENDING 신청 취소
→ CANCELED 상태와 목록 반영

관리자 결정과 사용자 취소 경합
→ ROOM_CREATION_DECISION_CONFLICT
→ 상세 재조회 후 서버 최신 상태 표시
```
