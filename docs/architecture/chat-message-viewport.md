# Chat message viewport 위치 모델

`ChatMessageViewport`는 가상화된 메시지 목록에서 초기 위치, 최신 메시지 추종, 과거 이력
anchor 복원, 읽음 보고를 함께 다룬다. 이 문서는 스크롤 위치를 명시적인 상태 모델로 옮기는
리팩터링의 기준을 기록한다. 구현이 이 문서와 달라지면 문서를 함께 갱신한다.

## 현재 구조의 문제

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

- 단계, 위치, 진행 작업을 분리한 위치 모델을 순수 reducer로 만든다.
- 사용자 스크롤은 scroll 이벤트가 아니라 메시지 목록 안에서 시작된 사용자 입력 신호로 판단한다.
- 초기 이동 중 사용자가 스크롤하면 이동을 멈추고 사용자가 둔 위치를 존중한다.
- 위치 모델은 표시 상태 reducer(`chat-message-viewport-state.ts`)와 분리한다. 위치 모델은 스크롤
  정확성을, 표시 상태 reducer는 새 메시지 개수와 과거 이력 표시 상태를 책임진다.

## 위치 모델

| 축         | 값                                              | 의미                                                |
| ---------- | ----------------------------------------------- | --------------------------------------------------- |
| `phase`    | `waiting`, `positioning`, `settled`             | 목표 대기, 이동 중, 위치 확정                       |
| `position` | `pinned`, `detached`                            | `settled`에서만 의미가 있는 하단 고정 여부          |
| `job`      | `null`, `initial`, `latest`, `anchor`, `resize` | 현재 `scrollTop`을 바꾸는 작업. 한 번에 하나만 존재 |
| `intent`   | `null`, `latest`                                | 문맥이 바뀌어도 유지할 사용자 의도                  |

위치를 바꾸는 코드는 reducer 이벤트를 보내는 경로 하나로 모은다. RAF 실행부는 작업 결과를
이벤트로 알리고 위치를 직접 쓰지 않는다.

### 이벤트

| 이벤트                      | 전이                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `viewport-changed`          | 모든 작업 취소, `phase=waiting`. `intent`는 유지                                          |
| `target-resolved`           | `waiting`에서 `positioning`, `job=initial`. `intent=latest`이면 최신 목표로 대체          |
| `job-settled(isAtEnd)`      | 현재 작업 종료, `phase=settled`, 하단 여부로 `position` 확정. 최신 작업이면 `intent` 해제 |
| `user-scrolled(isAtEnd)`    | 진행 작업 취소, `phase=settled`, 하단 여부로 `position` 갱신                              |
| `messages-appended(source)` | `settled`에서만 추종 규칙 적용. 이동 중에는 표시 상태의 새 메시지 개수만 증가             |
| `latest-requested`          | `intent=latest`. 같은 문맥이면 `job=latest` 시작                                          |
| `older-anchor-captured`     | `settled`에서 `job=anchor` 시작                                                           |
| `viewport-resized`          | 아래 작업 충돌 규칙 적용                                                                  |

`waiting`과 `positioning`에서 들어온 scroll 이벤트는 위치를 바꾸지 않는다.

### 작업 충돌 규칙

| 진행 중          | 새 요청   | 처리                                |
| ---------------- | --------- | ----------------------------------- |
| `initial`        | resize    | 무시하고 초기 이동 완료 후 판단     |
| `latest`         | resize    | `latest` 다시 시작                  |
| `anchor`         | 새 메시지 | 추종하지 않고 새 메시지 개수만 증가 |
| `null`, `pinned` | resize    | `resize` 작업으로 하단 보정         |
| 모든 작업        | 문맥 변경 | 모든 작업 취소 후 `waiting`         |

작업이 끝났을 때 `position=pinned`이고 그 사이 새 메시지가 붙었다면 최신 추종을 이어서 시작한다.

## 사용자 입력 판단

- 메시지 목록 요소 안에서 시작된 `wheel`, `touchstart`, `pointerdown`만 사용자 스크롤 신호로 본다.
- `keydown`은 목록에 focus가 있을 때 스크롤을 일으키는 키만 센다. 방향키, `PageUp`, `PageDown`,
  `Home`, `End`, `Space`가 대상이다.
- composer 입력, 하단 버튼, sheet 안의 입력은 사용자 스크롤로 보지 않는다.
- 사용자 입력 신호 이후의 scroll 이벤트를 `user-scrolled`로 변환한다.

## 준비 완료와 읽음 보고

- 부모 화면에는 `phase`가 처음 `settled`가 될 때 준비 완료를 알린다. 사용자가 초기 이동을 취소한
  경우에도 그 위치에서 완료로 본다.
- 진입 시 처음에는 로딩 화면이 목록을 덮으므로 사용자 취소는 주로 검색 Context 이동과 과거 이력
  복원 중에 발생한다.
- 읽음 보고는 기존 조건에 `phase=settled`를 추가한다. 이동 중 잠시 하단을 지나는 순간은 읽음으로
  보고하지 않는다.

## 진행 순서

1. 순수 계산 분리: 추가 메시지 감지와 anchor 캡처·탐색을 함수로 분리하고 단위 테스트를 붙인다.
   동작은 바꾸지 않는다.
2. 위치 모델 도입: reducer와 단위 테스트를 만들고 `viewportPositionRef`를 쓰는 경로를 이벤트로
   바꾼다. 작업 소유권과 사용자 입력 판단을 함께 도입한다.
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

2단계에는 사용자 입력이 진행 중 작업을 취소하는 시나리오를 단위 테스트와 e2e로 추가한다.

## 범위 밖

- 재입장 시 읽은 위치로 바로 이동하는 `afterSequence` 기반 진입 흐름은 보류한다.
- 가상화 라이브러리 교체와 행 높이 추정값 조정은 다루지 않는다.
