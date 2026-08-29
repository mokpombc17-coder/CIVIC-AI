# Admin room conversation export v1 example

이 디렉터리는 관리자용 채팅방 기간별 대화 내역 Export의 예정 계약 예시다.
현재 운영 API가 준비됐음을 의미하지 않으며, 구현 시 최종 OpenAPI와 함께 확정한다.

## API request

```http
POST /api/v1/admin/rooms/11000000-0000-0000-0000-000000000001/conversation-exports
Authorization: Bearer {accessToken}
Content-Type: application/json
Accept: application/zip
```

요청 본문은 `request.json`을 참고한다. 시간 범위는
`[fromInclusive, toExclusive)`이며 두 값 모두 ISO 8601 UTC Instant다.

필수 scope는 `chat:audit:exports`다.

## ZIP entries

- `manifest.json`: 계약 버전, 대상 방, 조회 범위, snapshot과 파일 무결성 정보
- `messages.jsonl`: 기간 내 생성된 메시지의 `toExclusive` 시점 상태
- `message_changes.jsonl`: 기간 내 발생한 생성·수정·삭제 이벤트
- `transcript.html`: 사람이 확인할 수 있는 최종 대화 내역

## Example metrics

이 예시 데이터에서 계산되는 값은 다음과 같다.

- 전체 메시지: 3
- 잔존 메시지: 2
- 삭제 메시지: 1
- 작성자: 3
- 생성 이벤트: 3
- 수정 이벤트: 4
- 삭제 이벤트: 1
- 한 번 이상 수정된 메시지: 3
- 삭제율: 1 / 3 = 33.33%

메시지를 작성하지 않은 참여자 수, 접속·체류 시간, 세션 수, 과거 시점의
정확한 멤버 수는 이 Export만으로 계산할 수 없다.
