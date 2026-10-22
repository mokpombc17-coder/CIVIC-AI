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
- 위치 모델은 표시 상태 reducer(`chat-message-viewport-state.ts`)와 분리한다. 위치 모델은 스크롤
  정확성을, 표시 상태 reducer는 새 메시지 개수와 과거 이력 표시 상태를 책임진다. 표시 상태
  reducer는 위치 사본을 갖지 않는다.

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
- anchor 항목이 목록에 들어오면 `older-anchor-rendered`로 `anchor` 작업을 시작한다.
- 몇 frame 안에 anchor 항목을 찾지 못하면 작업은 끝내되 대기 anchor를 남겨 다음 목록 변경 때 다시
  복원한다.

## 준비 완료와 읽음 보고

- 부모 화면에는 `phase`가 처음 `settled`가 될 때 준비 완료를 알린다. 사용자가 초기 이동을 취소한
  경우에도 그 위치에서 완료로 본다.
- 진입 시 처음에는 로딩 화면이 목록을 덮으므로 사용자 취소는 주로 검색 Context 이동과 과거 이력
  복원 중에 발생한다.
- 읽음 보고는 기존 조건에 `phase=settled`를 추가한다. 이동 중 잠시 하단을 지나는 순간은 읽음으로
  보고하지 않는다.
- 자동 이동은 끝나는 시점의 읽음 조건으로 보고하도록 읽음 보고 함수를 ref로 읽는다.

## 진행 순서

1. 순수 계산 분리 (완료): 추가 메시지 감지와 anchor 캡처·탐색을 함수로 분리하고 단위 테스트를
   붙인다. 동작은 바꾸지 않는다.
2. 위치 모델 도입 (완료): reducer와 단위 테스트를 만들고 `viewportPositionRef`를 쓰는 경로를
   이벤트로 바꾼다. 작업 소유권과 사용자 입력 판단을 함께 도입한다.
3. 책임별 hook 분리: 읽음 보고, 과거 이력, 최신 추종을 위치 모델 위의 hook으로 나눈다.

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

- 재입장 시 읽은 위치로 바로 이동하는 `afterSequence` 기반 진입 흐름은 보류한다.
- 가상화 라이브러리 교체와 행 높이 추정값 조정은 다루지 않는다.
