# Room 참여자 프로필 목록 Frontend Handoff

## 1. 적용 기준

Backend 기준 branch와 commit은 다음과 같다.

```text
branch: main
commit: f29775a
feat: 일반 참여자용 프로필 목록 확장
```

관련 선행 commit:

```text
606da82 feat: Membership 프로필 도메인 계약 추가
cebb49c feat: Room 참여자 번호 할당 상태 추가
d38e8cc feat: Membership 프로필 영속화 연결
f29775a feat: 일반 참여자용 프로필 목록 확장
```

이번 변경의 목적은 일반 ACTIVE 참여자가 같은 Room의 ACTIVE 참여자와
Room 단위 프로필을 조회할 수 있게 하는 것이다. 신규 endpoint는 추가하지 않고
기존 Room Membership 목록 API를 additive하게 확장했다.

---

## 2. 최종 Endpoint

```http
GET /api/v1/rooms/{roomId}/memberships
    ?status=ACTIVE
    &cursor={cursor}
    &limit=20
```

실제 요청은 한 줄이다.

```http
GET /api/v1/rooms/{roomId}/memberships?status=ACTIVE&limit=20
```

기존 요구 scope와 응답 header를 유지한다.

```text
scope: chat:rooms:read
Cache-Control: no-store
```

`status`를 생략하면 기존과 동일하게 `ACTIVE`가 적용된다.

---

## 3. 조회 권한 변경

### 변경 전

```text
ACTIVE / LEFT / BANNED
→ 모두 Room 방장만 조회 가능
```

### 변경 후

```text
status=ACTIVE
→ 해당 Room의 ACTIVE Membership이면 조회 가능
→ 방장과 일반 참여자 모두 포함

status=LEFT
status=BANNED
→ 기존과 동일하게 Room 방장만 조회 가능
```

오류 계약:

```text
비참여자, LEFT 또는 BANNED 사용자가 status=ACTIVE 조회
→ 403 ACCESS_DENIED

일반 참여자가 status=LEFT 또는 status=BANNED 조회
→ 403 NOT_ROOM_OWNER

존재하지 않는 Room
→ 404 ROOM_NOT_FOUND

잘못된 cursor
→ 400 INVALID_CURSOR
```

일반 참여자 화면에서는 다음 요청만 사용한다.

```http
GET /api/v1/rooms/{roomId}/memberships?status=ACTIVE
```

---

## 4. 응답 변경 전·후

### 변경 전

```json
{
  "items": [
    {
      "membershipId": "membership-02",
      "role": "MEMBER",
      "status": "ACTIVE",
      "joinedAt": "2026-08-10T03:00:00Z",
      "leftAt": null,
      "bannedAt": null,
      "version": 1
    }
  ],
  "nextCursor": null,
  "hasNext": false
}
```

### 변경 후

```json
{
  "items": [
    {
      "membershipId": "membership-02",
      "userLabel": "junseok",
      "displayName": "참여자 2",
      "imageUrl": null,
      "profileVersion": 1,
      "role": "MEMBER",
      "status": "ACTIVE",
      "joinedAt": "2026-08-10T03:00:00Z",
      "leftAt": null,
      "bannedAt": null,
      "version": 1
    }
  ],
  "nextCursor": null,
  "hasNext": false
}
```

participant의 원문 `userId`는 노출하지 않고 화면 표시용 `userLabel`만
제공한다.

---

## 5. 필드 계약과 nullability

| 필드 | 타입 | nullable | 의미 |
| --- | --- | --- | --- |
| `membershipId` | string | 아니요 | Room 범위 participant identity |
| `userLabel` | string | 아니요 | 내부 userId에서 파생한 화면 표시용 label |
| `displayName` | string | 아니요 | Room 단위 표시 이름 |
| `imageUrl` | string | 예 | Room 단위 프로필 이미지 URL |
| `profileVersion` | number | 아니요 | 프로필의 단조 증가 버전 |
| `role` | `OWNER\|MEMBER` | 아니요 | 현재 Membership 역할 |
| `status` | `ACTIVE\|LEFT\|BANNED` | 아니요 | Membership 상태 |
| `joinedAt` | ISO-8601 string | 아니요 | 현재 참여 구간의 참여 시각 |
| `leftAt` | ISO-8601 string | 예 | LEFT 전환 시각 |
| `bannedAt` | ISO-8601 string | 예 | BANNED 전환 시각 |
| `version` | number | 아니요 | Membership 생명주기 버전 |

`userLabel`은 내부 `userId`의 첫 `@` 앞부분이며 `@`가 없으면 전체 값을
사용한다. 이 값은 중복될 수 있으므로 식별자, 권한 판정 또는 React key로
사용하지 않는다. 메시지의 `senderMembershipId`는 목록의 `membershipId`와
매핑하고, 일치하는 ACTIVE 참여자가 없으면 화면에서 `알 수 없음`으로
표시한다.

`displayName`은 앞뒤 공백이 제거된 1~50 Unicode code point 문자열이다.
현재 서버는 사용자 편집 기능 없이 다음 형식으로 생성한다.

```text
방장 최초 생성
→ 참여자 1

첫 신규 참여자
→ 참여자 2

다음 신규 참여자
→ 참여자 3
```

현재 `imageUrl`은 생성 시 `null`이다. 프론트는 `null`일 때 기본 아바타를
표시할 수 있지만, `displayName`이나 `profileVersion`의 fallback을 만들지는 않는다.

`version`과 `profileVersion`은 서로 다른 값이다.

```text
version
→ Membership 상태·역할·재참여 생명주기 버전

profileVersion
→ 표시 이름·이미지 등 프로필 변경 버전
```

현재 프로필 수정 API는 없으므로 `profileVersion`의 초기값은 `1`이다.

---

## 6. Membership와 프로필 안정성

프로필은 Membership과 1:1 관계이며 Membership document 내부에 저장된다.

```text
Membership 생성
→ MembershipProfile 생성

Membership REJOIN
→ 기존 membershipId 재사용
→ 기존 participant number 재사용
→ 기존 displayName/imageUrl/profileVersion 유지
```

예:

```text
참여자 2가 LEAVE
다른 신규 사용자가 JOIN
→ 신규 사용자는 참여자 3

기존 참여자 2가 REJOIN
→ 다시 참여자 2
→ membershipId도 기존 값 유지
```

Room의 participant number allocator는 감소하지 않으며 이미 할당한 번호를
다른 Membership에 재사용하지 않는다. 내부 `participantNumber` 자체는 이번
외부 응답에 노출하지 않고 `displayName`만 제공한다.

---

## 7. Pagination과 캐시

기존 cursor 계약을 변경하지 않았다.

```text
정렬
→ membershipId ASC

cursor
→ opaque token

limit
→ 기본 20, 허용 범위 1~100

criteria
→ status와 cursor가 바인딩됨
```

프론트 권장 cache key:

```text
roomId + status
```

Room topology event를 수신하면 기존 정책대로 ACTIVE participant 목록을
invalidate하고 첫 페이지부터 재조회한다.

```text
ROOM_MEMBER_JOINED
ROOM_MEMBER_REJOINED
ROOM_MEMBER_LEFT
ROOM_MEMBER_BANNED
ROOM_CLOSED
```

현재 프로필 수정 event는 없다.

---

## 8. Frontend 적용 사항

1. Room 참여자 목록 Zod/schema에 다음 필드를 추가한다.

```text
displayName: required string
imageUrl: nullable string
profileVersion: required positive integer
```

2. 일반 참여자 화면에서 다음 API를 호출한다.

```http
GET /api/v1/rooms/{roomId}/memberships?status=ACTIVE
```

3. participant key와 self 판정은 계속 `membershipId`를 사용한다.

```text
participant key
→ membershipId

self
→ participant.membershipId == selfMembershipId
```

4. 사용자 표시에는 `displayName`을 사용하고 `userId` fallback을 추가하지 않는다.

5. `imageUrl == null`이면 프론트 기본 아바타를 표시한다.

6. 방장 관리 화면의 `LEFT/BANNED` 조회와 command target은 기존처럼
   `membershipId`를 사용한다.

7. 새 Backend 적용 후 기존 응답 cache에는 새 필드가 없을 수 있으므로 브라우저
   새로고침과 TanStack Query persisted cache 초기화를 수행한다.

---

## 9. 변경하지 않은 계약

이번 작업에서 다음은 변경하지 않았다.

```text
- endpoint URL
- cursor payload와 version
- limit 범위
- Room message senderMembershipId
- Room event payload와 eventVersion
- Read Receipt snapshot/event
- memberships/me 응답
- Room detail myMembership 응답
- ban/unban/ownership targetMembershipId
- 프로필 수정 API
```

메시지, Room event, Read Receipt participant와 참여자 프로필 목록은 모두
동일한 `membershipId`를 사용한다.

---

## 10. Backend schema와 데이터 초기화

최종 내부 schema:

```text
MongoRoomDocument schemaVersion: 6
MongoMembershipDocument schemaVersion: 3
MembershipProfile: Membership document의 required embedded document
```

기존 로컬 DB에는 Membership profile과 Room participant number allocator가 없으므로
runtime fallback이나 migration을 추가하지 않았다.

2026-08-10 검증 전에 다음 데이터베이스를 초기화했다.

```text
Mongo database: chat_local
초기화 전 collections: 10개
초기화 후 collections: 0개
```

그 후 새 Docker 이미지를 빌드하고 서버가 collection과 index를 새 schema로
재생성하도록 했다.

---

## 11. Backend 검증 결과

전체 Gradle 테스트:

```text
./gradlew test
888 tests
0 failures
0 skipped
BUILD SUCCESSFUL
```

Docker/health:

```text
docker compose -f compose.local.yaml up --build -d
GET http://localhost:8082/actuator/health
HTTP 200
status=UP
```

Frontend local smoke:

```text
python3 scripts/frontend-local-smoke.py
15/15 단계 통과
exit code 0
```

smoke에서 다음 신규 계약을 실제 HTTP 환경으로 검증했다.

```text
- 일반 ACTIVE 참여자가 ACTIVE Membership 목록 조회
- owner와 member의 membershipId 모두 포함
- displayName required
- imageUrl nullable
- profileVersion=1
- participant userId 미노출
- Cache-Control: no-store
```

기존 Room/WebSocket/message/unread/read-state/Read Receipt/접근 회수 시나리오도
함께 통과했다.

---

## 12. 후속 범위

다음 기능은 별도 작업이다.

```text
- Membership profile 수정 API
- 실제 계정 프로필에서 displayName/imageUrl 초기 복사
- 프로필 변경 WebSocket event
- 참여자 검색
- 메시지 검색
```

현재 프론트는 서버가 생성한 `참여자 N`과 nullable `imageUrl`만 사용하면 된다.
