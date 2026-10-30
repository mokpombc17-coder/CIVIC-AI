# 채팅 도메인 퍼블리싱 기준

## 1차 범위

Figma `CIVIC.AI-Wire-Flow`의 다음 모바일 노드를 기준으로 한다.

- 채팅방 목록: `48:24230`
- 목록 위 채팅방 상세 bottom sheet: `48:24323`
- 채팅방: `48:24450`
- 채팅방 진입 오류: `48:24777`

전역 하단 내비게이션은 채팅 도메인 퍼블리싱 범위에 포함하지 않는다. 채팅방 상세는
별도 route가 아니라 목록 화면 위 backdrop과 bottom sheet로 표현한다.

## 확정된 목록 정책

- 검색 대상은 사용자가 직접 참여할 수 있는 공개 방이다.
- 검색 결과가 비면 `참여 가능한 방이 없습니다.`를 표시한다.
- 참여 중인 방의 `전체`와 `안읽음`은 현재 클라이언트에 누적된 방 목록 안에서 필터링한다.
- 생성 control 문구는 현재 계약이 유지되는 동안 `채팅방 생성`을 사용한다.
- unread count는 기존 Room inbox 응답을 사용해 디자인에 additive하게 표시한다.

## 최대 정원 임시 정책

서버는 현재 `activeMemberCount`를 제공하지만 Room별 최대 정원은 제공하지 않는다. 퍼블리싱
중에는 `TEMPORARY_CHAT_ROOM_MEMBER_LIMIT = 50`을 사용한다. UI는 직접 숫자 `50`을
하드코딩하지 않고 `getChatRoomMemberCountPresentation()` 결과를 렌더링한다.

백엔드 계약에 최대 정원 필드가 추가되면 해당 값을 presentation helper의 `memberLimit`으로
전달한 뒤 임시 상수를 제거한다.

## 채팅 전용 시각 토큰

Figma Dev Mode에서 반복 확인한 값을 `.chat-publishing-surface` CSS 변수로 관리한다.
이 토큰은 채팅 도메인 안에서만 사용하며 전역 제품 디자인 시스템으로 확장하지 않는다.

| 용도                      | 값                       |
| ------------------------- | ------------------------ |
| 기본 텍스트               | `#121417`                |
| 보조 텍스트               | `#59616b`                |
| 주요 동작                 | `#266ef5`                |
| 강조 텍스트               | `#0a4fd1`                |
| 테두리                    | `#ccd1d6`                |
| 연한 파란 배경            | `#edf2ff`                |
| 연한 중립 배경            | `#edf2f7`                |
| backdrop                  | `rgba(18, 20, 23, 0.56)` |
| control/card/panel radius | `6px / 8px / 12px`       |
| 기본 control 높이         | `48px`                   |

화면 퍼블리싱 단계에서 가장 가까운 채팅 surface에 `.chat-publishing-surface`를 적용하고,
하위 표현 컴포넌트가 이 변수를 사용한다.
