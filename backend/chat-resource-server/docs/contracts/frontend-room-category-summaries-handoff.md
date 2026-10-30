# Room 카테고리 표시 정보 Frontend Handoff

## 목적

채팅방 목록 카드, Room inbox 카드, 방 상세 화면에서 카테고리 이름을 별도
카탈로그 조인 없이 표시할 수 있도록 Room 응답에 표시용 카테고리 정보를
추가한다.

필터와 식별에 사용하는 기존 `categoryIds`는 제거하거나 의미를 변경하지 않는다.

## 적용 API

다음 세 응답에 `categorySummaries`를 추가한다.

| Method | Path | 화면 용도 |
|---|---|---|
| `GET` | `/api/v1/rooms` | 공개 채팅방 목록 카드 |
| `GET` | `/api/v1/me/room-inbox` | 내 Room inbox 카드 |
| `GET` | `/api/v1/rooms/{roomId}` | 채팅방 상세 |

세 API는 기존과 동일하게 `chat:rooms:read` scope를 요구한다.

## 응답 계약

각 Room 응답에는 다음 두 필드가 함께 존재한다.

```json
{
  "categoryIds": [
    "00000000-0000-0000-0000-000000000001",
    "11111111-1111-1111-1111-111111111111"
  ],
  "categorySummaries": [
    {
      "categoryId": "00000000-0000-0000-0000-000000000001",
      "name": "정책"
    },
    {
      "categoryId": "11111111-1111-1111-1111-111111111111",
      "name": "지역 현안"
    }
  ]
}
```

### `categoryIds`

- 기존 필드이며 계속 필수다.
- 카테고리 필터, 선택 상태 및 API 요청에는 이 값을 사용한다.
- 카테고리 이름을 ID로 역추론하거나 하드코딩하지 않는다.

### `categorySummaries`

```ts
type RoomCategorySummary = {
  categoryId: string;
  name: string;
};
```

- 항상 존재하는 non-null 배열이다.
- `categoryIds`와 정확히 같은 `categoryId` 집합을 가진다.
- `name`은 Room 생성 당시 snapshot이 아니라 응답 생성 시점의 최신 이름이다.
- 카테고리 이름이 변경되면 다음 Room 조회부터 변경된 이름이 반환된다.
- 배열 순서는 UI 계약이 아니다. 필요한 경우 프론트에서 `name` 기준으로 정렬한다.
- 한 Room의 카테고리는 최소 1개, 최대 5개이므로 summary도 1~5개다.

## 공개 방 목록 예시

```http
GET /api/v1/rooms?categoryId=00000000-0000-0000-0000-000000000001&limit=20
```

```json
{
  "items": [
    {
      "roomId": "room-01",
      "name": "정책 토론방",
      "description": "정책을 토론합니다.",
      "categoryIds": [
        "00000000-0000-0000-0000-000000000001"
      ],
      "categorySummaries": [
        {
          "categoryId": "00000000-0000-0000-0000-000000000001",
          "name": "정책"
        }
      ],
      "ownerMembershipId": "membership-owner-01",
      "status": "ACTIVE",
      "visibility": "LISTED",
      "joinPolicy": "OPEN",
      "activeMemberCount": 3,
      "createdAt": "2026-08-28T01:00:00Z",
      "version": 7
    }
  ],
  "nextCursor": null,
  "hasNext": false
}
```

목록 query와 cursor 계약은 바뀌지 않는다. `categoryId` 필터는 계속 ID를
사용한다.

## Room inbox 예시

```http
GET /api/v1/me/room-inbox?limit=20
```

각 `items[]`에 공개 방 목록과 동일한 `categoryIds`, `categorySummaries`가
포함된다. unread count, last message, cursor 등 기존 inbox 필드는 변경되지
않는다.

## 방 상세 예시

```http
GET /api/v1/rooms/{roomId}
```

상세 응답에도 공개 방 목록과 동일한 `categoryIds`, `categorySummaries`가
포함된다. membership과 participation 관련 기존 필드는 변경되지 않는다.

## 프론트엔드 사용 규칙

- 카드 배지 text는 `categorySummaries[].name`을 사용한다.
- 배지 key와 클릭 시 필터 값은 `categorySummaries[].categoryId`를 사용한다.
- `categorySummaries`가 추가된 세 화면은 배지 표시만을 위해
  `GET /api/v1/room-categories`를 추가 호출할 필요가 없다.
- 카테고리 필터 선택지를 구성하는 화면은 기존
  `GET /api/v1/room-categories`를 계속 사용한다.
- 응답 순서 대신 프론트의 표시 정책에 따라 이름순으로 정렬한다.

## 변경하지 않는 계약

- `categoryIds` 필드
- `GET /api/v1/room-categories`
- 공개 방 목록의 `categoryId` query filter
- pagination과 cursor 형식
- Room 생성·승인·카테고리 교체 요청 형식
- `ROOM_SETTINGS_UPDATED` WebSocket event payload
- `GET /api/v1/me/rooms` 응답
- export schema

이 변경은 응답 필드의 additive 변경이며 Mongo Room 및 inbox document에
카테고리 이름을 중복 저장하지 않는다.
