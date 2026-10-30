# Chat message viewport 위치 모델

`ChatMessageViewport`는 가상화된 메시지 목록에서 초기 위치, 최신 메시지 추종, 과거 이력
anchor 복원, 읽음 보고를 함께 다룬다. 이 문서는 스크롤 위치를 명시적인 상태 모델로 옮기는
리팩터링의 기준과 현재 구현의 규칙을 기록한다. 구현이 이 문서와 달라지면 문서를 함께 갱신한다.

## 리팩터링 전 구조의 문제

책임 수보다 여러 흐름이 같은 상태를 직접 덮어쓰는 구조가 버그의 원인이었다.

- `viewportPositionRef` 하나가 단계(`initializing`)와 위치(`pinned`, `detached`)를 함께
  표현한다. scroll 이벤트, 최신 이동 완료, 초기 이동 완료, 새 메시지 처리, 최신 이동 버튼이
  모두 이 값을 쓴다.
- 초기 이동, 최신 이동, anchor 복원, resize 보정이 각자 여러 RAF 동안 `scrollTop`을 바꾼다.
  우선순위와 취소 소유권이 없고 사용자 스크롤도 진행 중인 작업을 멈추지 않는다.
- `handleScroll`은 브라우저 보정과 프로그램 이동을 포함한 모든 scroll 이벤트를 사용자 의도로
  해석한다.
- 문맥 초기화 너머로 유지할 의도를 임시 ref로 전달한다(`latestScrollAfterNavigationRef`).
- 읽음 조건이 바뀌면 `reportVisibleReadSequence` identity가 바뀌고 이를 의존하는 이동 callback과
  effect가 다시 실행된다.

이 구조에서 실제로 발생한 문제는 다음과 같다.

| 증상                                           | 원인                                                            |
| ---------------------------------------------- | --------------------------------------------------------------- |
| 최신 이력 밖 검색 결과가 Context 하단으로 이동 | 목록이 비며 생긴 scroll 보정이 초기화 중 위치를 `pinned`로 확정 |
| 진입 직후 위로 스크롤해도 하단으로 되돌아감    | 진행 중인 최신 이동 보정이 사용자 스크롤을 덮어씀               |
| 최신 대화로 이동이 진입 목표로 돌아감          | 문맥 초기화가 최신 이동 의도를 잃음                             |

## 결정

- 단계, 위치, 진행 작업을 분리한 위치 모델을 순수 reducer로 만든다
  (`chat-message-viewport-position.ts`).
- 사용자 스크롤은 scroll 이벤트가 아니라 메시지 목록 안에서 시작된 사용자 입력 신호로 판단한다.
- 자동 이동 중 사용자가 스크롤하면 이동을 멈추고 사용자가 둔 위치를 존중한다.
- 위치 모델은 표시 상태와 분리한다. 위치 모델은 스크롤 정확성만 책임지고, 새 메시지 개수와 과거
  이력 상태는 각 책임 hook이 소유한다. 표시 상태는 위치 사본을 갖지 않는다.

## 위치 모델

| 축              | 값                                              | 의미                                                |
| --------------- | ----------------------------------------------- | --------------------------------------------------- |
| `phase`         | `waiting`, `positioning`, `settled`             | 목표 대기, 진입 위치로 이동 중, 위치 확정           |
| `pin`           | `pinned`, `detached`                            | `settled`에서만 의미가 있는 하단 고정 여부          |
| `job`           | `null`, `initial`, `latest`, `anchor`, `resize` | 현재 `scrollTop`을 바꾸는 자동 이동. 한 번에 하나만 |
| `intent`        | `null`, `latest`                                | 문맥이 바뀌어도 유지할 최신 이동 의도               |
| `pendingFollow` | `null`, `if-pinned`, `always`                   | 자동 이동 중 미뤄 둔 최신 추종. 이동이 끝나면 판단  |

- 위치를 바꾸는 코드는 `dispatchPosition` 하나로 모은다. 상태는 RAF 콜백과 scroll handler가
  동기적으로 읽어야 하므로 ref에 둔다.
- `job`이 바뀌면 dispatch가 이전 작업의 RAF를 취소하고 새 작업 실행부를 시작한다. 실행부는 위치를
  직접 쓰지 않고 끝나면 `job-settled`로 알린다.
- 작업마다 `id`를 붙인다. 현재 작업이 아닌 `job-settled`는 무시하므로 취소된 작업이 늦게 끝나도
  위치를 바꾸지 못한다.
- effect cleanup은 작업을 취소하지 않는다. 작업은 완료, 다른 작업으로 교체, 문맥 변경, 사용자
  입력으로만 끝난다.
- 실행부는 시작 시점이 아니라 실행 시점의 목록과 진입 목표를 ref로 읽는다.

## Hook 구성

`ChatMessageViewport`는 가상화, hook 조립, scroll·입력 handler 연결과 렌더링만 담당한다. 스크롤과
관련된 책임은 위치 모델 위의 hook으로 나눈다.

| Hook                                  | 책임                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `useChatMessageViewportPosition`      | 위치 모델, `dispatchPosition`, 자동 이동 실행부, 문맥 변경, resize, 준비 완료 알림 |
| `useChatMessageViewportReadReport`    | 읽음 보고 조건 판단과 focus·visibility·목록 변경 시 재확인                         |
| `useChatMessageViewportLatestFollow`  | 추가 메시지 감지, 새 메시지 개수, 도착 안내, 최신 이동 버튼                        |
| `useChatMessageViewportInitialTarget` | 진입 목표 확인(`target-resolved`)                                                  |
| `useChatMessageViewportOlderHistory`  | 과거 이력 요청·오류·진행 상태, anchor 캡처와 복원 요청                             |

- hook은 위 순서로 호출한다. effect 실행 순서가 호출 순서를 따르므로 문맥 변경 → 추가 메시지 감지 →
  진입 목표 확인 순서를 지켜야 한다. 진입 목표 확인이 추가 감지보다 먼저 실행되면 같은 commit에 붙은
  메시지가 위치 확정 전 무시가 아니라 이동 중 예약으로 처리된다.
- `useChatMessageViewportPosition`은 다른 hook보다 먼저 호출되므로 작업 완료, 하단 도달, 문맥 변경을
  콜백으로 알린다. 컴포넌트가 각각 읽음 보고, 새 메시지 개수 초기화, 최신 추종·과거 이력 상태 정리를
  연결한다.
- 대기 anchor ref는 컴포넌트가 만들어 `useChatMessageViewportPosition`과
  `useChatMessageViewportOlderHistory`에 넘긴다. 과거 이력 hook이 캡처하고 위치 hook의 `anchor`
  작업이 복원한다.
- hook 안에서는 렌더 중 ref를 갱신하지 않고 `useLayoutEffect`로 최신 값을 담는다. layout effect는
  같은 commit의 effect보다 먼저 실행되므로 effect, RAF, 이벤트 handler는 항상 최신 값을 읽는다.

### 이벤트

| 이벤트                  | 전이                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `viewport-changed`      | 같은 timeline이고 `settled`면 작업만 취소하고 위치 유지. `intent=latest`면 최신 이동 시작            |
|                         | 그 밖에는 모든 작업 취소, `phase=waiting`. `intent`는 유지                                           |
| `target-resolved`       | `waiting`에서만 처리. `intent=latest`이고 항목이 있으면 최신 목표로, 목표가 있으면 진입 목표로 이동  |
|                         | 목표가 없으면 현재 위치에서 바로 `settled`                                                           |
| `job-settled`           | 현재 작업만 종료, `phase=settled`, 하단 여부로 `pin` 확정. 최신 이동이면 `intent` 해제               |
|                         | `pendingFollow`가 `always`이거나 `if-pinned`이고 하단이면 최신 이동 시작                             |
| `user-scrolled`         | 진행 작업과 `pendingFollow` 취소, `phase=settled`, 하단 여부로 `pin` 갱신. `waiting`에서는 무시      |
| `scroll-observed`       | `settled`이고 작업이 없을 때만 하단 여부로 `pin` 갱신                                                |
| `messages-appended`     | 아래 작업 충돌 규칙 적용. `waiting`에서는 무시                                                       |
| `latest-requested`      | `intent=latest`. 같은 문맥이고 `settled`면 하단 고정 후 최신 이동 시작                               |
|                         | 진입 이동 중이면 진입 목표를 최신 목표로 교체. 다른 문맥으로 이동하거나 목표 대기 중이면 의도만 남김 |
| `newer-page-appended`   | `settled`에서 목록 아래에 다음 페이지가 붙으면 하단 고정을 풀고 최신 이동·resize 작업을 멈춤         |
| `older-anchor-rendered` | `settled`이고 최신 이동 중이 아니면 anchor 복원 시작                                                 |
| `viewport-resized`      | 아래 작업 충돌 규칙 적용                                                                             |

### 작업 충돌 규칙

| 진행 중                       | 새 요청                          | 처리                                           |
| ----------------------------- | -------------------------------- | ---------------------------------------------- |
| 없음, `pinned`                | 새 메시지·시스템 활동            | 최신 이동 시작                                 |
| 없음, `detached`              | 새 메시지·시스템 활동            | 따라가지 않고 새 메시지 개수만 증가            |
| 없음                          | 내 메시지                        | 하단 고정 후 최신 이동 시작                    |
| `latest`                      | 하단 고정 중 새 메시지·내 메시지 | 최신 이동 다시 시작                            |
| `initial`, `anchor`, `resize` | 새 메시지                        | `pendingFollow=if-pinned`, 새 메시지 개수 증가 |
| `initial`, `anchor`, `resize` | 내 메시지                        | `pendingFollow=always`                         |
| 없음, `pinned`                | resize                           | `resize` 작업으로 하단 보정                    |
| `initial`                     | resize                           | 이동 유지, `pendingFollow=if-pinned`           |
| `latest`, `resize`            | resize                           | 같은 작업 다시 시작                            |
| `anchor`                      | resize                           | 무시                                           |
| 모든 작업                     | 사용자 입력                      | 작업 취소 후 사용자 위치로 확정                |
| 모든 작업                     | 문맥 변경                        | 모든 작업 취소 후 `waiting`                    |

새 메시지 개수는 다른 사용자 메시지 중 바로 최신 이동을 시작하지 않는 메시지만 센다. 하단에
위치가 확정되면 개수를 초기화한다.

## 사용자 입력 판단

- 메시지 목록 요소 안에서 시작된 `wheel`, `touchstart`, `pointerdown`을 사용자 스크롤 신호로 본다.
- `keydown`은 방향키, `PageUp`, `PageDown`, `Home`, `End`, `Space`만 센다. 입력 요소 안의 키와
  버튼에 focus가 있을 때의 `Space`는 제외한다.
- composer 입력, 하단 버튼, sheet 안의 입력은 목록 밖이므로 사용자 스크롤로 보지 않는다.
- 입력 신호가 오면 그 시점에 `user-scrolled`를 보낸다. 입력 후 시간 창을 두지 않는다. touch와
  wheel의 관성 스크롤은 작업이 이미 취소된 뒤의 scroll 이벤트이므로 `scroll-observed`로 반영된다.
- 이동 중 메시지를 탭해도(`pointerdown`) 이동이 멈춘다.

## 과거 이력 anchor 복원

- 상단에 가까워지면 화면 맨 위 항목과 offset을 대기 anchor로 저장하고 과거 이력을 요청한다.
  날짜 구분선은 뒤 항목에 따라 render key가 바뀌므로 anchor 기준에서 제외한다.
- 응답을 기다리는 동안은 작업이 아니다. 이 동안의 사용자 스크롤은 복원을 취소하지 않는다.
- 과거 이력 불러오기가 끝난 뒤 anchor 항목이 목록에 있으면 `older-anchor-rendered`로 `anchor`
  작업을 시작한다. anchor 항목은 요청 전부터 목록에 있으므로 응답을 기다리는 사이 실시간 메시지로
  목록이 바뀌어도 복원을 시작하지 않는다.
- 몇 frame 안에 anchor 항목을 찾지 못하면 작업은 끝내되 대기 anchor를 남겨 다음 목록 변경 때 다시
  복원한다.
- 같은 timeline에서 viewport가 바뀌어 위치를 유지할 때(같은 방 재연결 등) 진행 중이던 요청의 응답은
  버린다. 대기 anchor를 지우고 `loading`과 `error` 상태는 과거 이력 가용성에 맞는 상태로 되돌려 다음
  요청이 막히지 않게 한다.
- 이전·다음 이력 불러오기가 실패하면 스크롤로는 다시 요청하지 않고 다시 시도 버튼으로만 요청한다.
  viewport가 바뀌거나 재연결로 위치를 유지하면 실패 상태를 풀어 다시 스크롤로 불러올 수 있게 한다.

## 준비 완료와 읽음 보고

- 부모 화면에는 `phase`가 처음 `settled`가 될 때 준비 완료를 알린다. 사용자가 초기 이동을 취소한
  경우에도 그 위치에서 완료로 본다.
- 진입 시 처음에는 로딩 화면이 목록을 덮으므로 사용자 취소는 주로 검색 Context 이동과 과거 이력
  복원 중에 발생한다.
- 읽음 보고는 기존 조건에 `phase=settled`를 추가한다. 이동 중 잠시 하단을 지나는 순간은 읽음으로
  보고하지 않는다.
- 자동 이동은 끝나는 시점의 읽음 조건으로 보고하도록 읽음 보고 함수를 ref로 읽는다.

## 성능 판단: 스크롤마다 하는 DOM 측정

스크롤 위치가 정해진 상태(`phase=settled`)의 scroll 이벤트마다 렌더된 행의 위치를
`getBoundingClientRect`로 읽는다.

- 읽음 위치: 렌더된 메시지마다 본문(`[data-message-bubble]`) 아래끝을 읽어 화면 안에 들어온 가장 아래
  순번을 찾는다.
- 맨 위 메시지 캡처: 이동한 대화에서 재연결 복원에 쓸 맨 위 행과 offset을 기억한다. 행마다 위치를 한
  번만 읽는다.

가상화로 렌더되는 행은 보이는 행과 위아래 overscan 10개 정도라 방의 메시지 수와 관계없이 측정 대상이
늘지 않는다.

### 측정 결과 (2026-10-26)

- 조건: Chromium, production 빌드, CPU 6배 감속, 메시지 60개 방, wheel 입력으로 위아래 60회 스크롤
- 방법: Chromium trace에서 scroll `EventDispatch` 시간과 그 안의 `Layout`·`UpdateLayoutTree`(강제
  레이아웃)를 집계한다. 측정 코드를 끈 빌드와 각각 4회씩 비교했다.

| 화면        | scroll 이벤트 처리 중앙값 | 측정 코드를 끈 빌드 | 측정 코드의 몫 |
| ----------- | ------------------------- | ------------------- | -------------- |
| 실시간 목록 | 2.7~2.9ms                 | 1.1~1.3ms           | 약 1.5ms       |
| 이동한 대화 | 2.4~2.6ms                 | 1.3~1.6ms           | 약 1.1ms       |

- 강제 레이아웃은 모든 측정에서 0이었다. scroll 이벤트 시점에는 레이아웃이 이미 계산되어 있어 위치를
  읽는 비용만 든다.
- 50ms를 넘는 긴 작업은 측정당 0~1개였다. dev 서버에서는 개발용 React 때문에 긴 작업이 많이 잡히므로
  production 빌드에서 잰다.

### 판단

- 6배 감속에서도 측정 코드는 scroll 이벤트당 약 1~1.5ms로 한 프레임(16.7ms)의 10% 안쪽이라 지금은
  바꾸지 않는다.
- scroll 이벤트는 브라우저가 렌더링 단계에서 한 프레임에 한 번 보내므로 requestAnimationFrame으로
  묶어도 얻는 것이 거의 없다.
- 바꿔야 할 때의 후보
  - 맨 위 메시지 캡처는 스크롤이 멈췄을 때만 필요하므로 `scrollend`로 옮긴다. Safari는 26.2부터
    지원하므로 그 이전 iOS WebView에는 debounce 대체가 필요하다.
  - 읽음 위치는 본문 아래끝에 높이 0인 표식을 두고 IntersectionObserver로 바꾼다. 읽음 계산을 이벤트
    방식으로 다시 설계해야 하고 `phase=settled` 조건과 다시 맞춰야 한다.
- 한계: CPU 감속은 실제 저사양 기기와 같지 않고, iOS(WebKit)는 이 방법으로 재지 못했다. 짧은 텍스트
  메시지 기준이라 첨부·미리보기처럼 무거운 행은 반영되지 않았다.

### 다시 볼 조건

- 저사양 Android WebView 실기기에서 스크롤 중 긴 작업이나 프레임 누락이 잡힐 때
- 행 DOM이 무거워지거나(첨부·미리보기 등) overscan을 늘릴 때
- iOS에서 스크롤 버벅임이 보고될 때

### 다시 재는 방법

`e2e/chat-scroll-performance.spec.ts`로 같은 조건을 재현한다. 평소 e2e에서는 skip되고
`CHAT_SCROLL_PERF_PHASE`를 줄 때만 실행된다. production 빌드에서는 로컬 E2E 로그인이 막혀 있어 방
준비와 측정을 서버를 바꿔 두 단계로 실행한다.

1. `CHAT_SCROLL_PERF_PHASE=setup pnpm test:e2e e2e/chat-scroll-performance.spec.ts`로 dev 서버에서
   메시지 60개 방과 로그인 쿠키를 준비한다.
2. `pnpm --filter @app/web build` 후 `pnpm --filter @app/web exec next start --port 3000`으로
   production 서버를 띄운다. Chat API CORS가 3000번 origin만 허용하므로 포트를 바꾸지 않는다.
3. `CHAT_SCROLL_PERF_PHASE=measure pnpm test:e2e e2e/chat-scroll-performance.spec.ts`로 잰다. 이미 떠
   있는 production 서버를 그대로 쓴다. 결과는 `e2e/.artifacts/chat-scroll-performance/`에 JSON으로
   남는다. 감속 배율은 `CHAT_SCROLL_PERF_CPU`로 바꾼다.

측정 코드를 끈 빌드와 비교하려면 `ChatMessageViewport`의 `handleScroll`에서 읽음 보고와 맨 위 메시지
캡처 호출을 잠시 빼고 다시 빌드해 같은 방을 잰다.

## 진행 순서

1. 순수 계산 분리 (완료): 추가 메시지 감지와 anchor 캡처·탐색을 함수로 분리하고 단위 테스트를
   붙인다. 동작은 바꾸지 않는다.
2. 위치 모델 도입 (완료): reducer와 단위 테스트를 만들고 `viewportPositionRef`를 쓰는 경로를
   이벤트로 바꾼다. 작업 소유권과 사용자 입력 판단을 함께 도입한다.
3. 책임별 hook 분리 (완료): 읽음 보고, 과거 이력, 최신 추종을 위치 모델 위의 hook으로 나눈다.

각 단계는 effect 선언 순서와 트리거 의존성을 의도적으로 바꾸는 경우에만 바꾸며, 바꾼 이유를
커밋에 남긴다.

## 검증

단계마다 다음 e2e를 변경 전후로 실행한다.

- `e2e/chat-message-viewport.spec.ts`
- `e2e/chat-message-viewport-history.spec.ts`
- `e2e/chat-room-entry-navigation.spec.ts`
- `e2e/chat-message-history-pagination.spec.ts`
- `e2e/chat-message-search.spec.ts`

`e2e/chat-message-viewport.spec.ts`는 최신 이동이 예약된 직후 사용자가 스크롤하면 이동을 멈추고
그 위치를 유지하는지 확인한다. WebKit e2e 설정은 CSS smoke만 실행하므로 이 spec들은 chromium으로
검증한다.

## 범위 밖

- 재입장 시 읽은 위치로 바로 이동하는 `afterSequence` 기반 진입 흐름은 이 문서에서 다루지 않는다.
  `docs/architecture/chat-room-unread-entry.md`에 둔다.
- 가상화 라이브러리 교체와 행 높이 추정값 조정은 다루지 않는다.
