# 관리자 Chat·Vote 연동 경계

이 문서는 Frontend2가 현재 실제로 호출하는 관리자 도메인 API만 요약한다. 상세 request·response와
상태 전이는 서버 팀의 `admin-console-domain-api-contract.md`를 원문 계약으로 사용한다.

## 구현된 화면

- Chat `A-CHAT-004..006`: 생성 신청 목록·상세, 승인, 반려
- Vote `A-TASK-001..005`: Draft 생성·전체 수정, 예약·즉시 발행, 일정 변경, 종료·취소,
  정량 결과와 JSONL 다운로드

브라우저는 same-origin `/api/v1/admin/**`만 호출한다. Next.js BFF는 허용한 path와 method만 각각
`CHAT_INTERNAL_URL`, `VOTE_INTERNAL_URL`로 전달한다. Access Token은 해석하지 않고 같은 원문을
`civic_ai_access_token` Cookie와 Bearer Authorization에 넣는다. 각 Resource Server가 최종 scope와
JWT를 검증한다.

| 영역           | 서버 business scope  |
| -------------- | -------------------- |
| Chat 생성 신청 | `chat:rooms:approve` |
| Vote 과업      | `vote:tasks:admin`   |

현재 배포 전 필수 조치는 두 가지다. Main/Auth의 `VOTE_ADMIN` scope 목록에 `vote:tasks:admin`을
추가하고, Vote Resource Server의 local profile 전용 `/api/v1/admin/**` gate를 운영에서도 해당
scope를 검사하도록 교체해야 한다. 이 조치 전에는 Frontend 화면이 완성되어도 운영 Vote API가
`403`으로 차단된다. Chat의 `chat:rooms:approve` 발급·검사 경로는 현재 계약과 일치한다.

mutation은 자동 재전송하지 않는다. 응답이 불명확하거나 `409`이면 상세를 먼저 다시 조회한다. `429`의
`Retry-After`, Problem Details의 `code`, `violations`, `traceId`를 보존한다. Vote 상세 결과는 JSON으로
변환하지 않고 NDJSON attachment로 전달한다.

## 아직 서버 계약이 없는 화면

- Chat 활성 방 전체 관리, 관리자 직접 생성, 카테고리, 통계
- Simulation 실행 설정, 패널, 상태, 재실행, 결과

Chat 서버의 일반 방 API는 관리자 전체 방을 조회하거나 비회원 관리자가 임의 방을 운영하는 계약이
아니므로 위 화면에 재사용하지 않는다. `civic-simulation-service`에는 현재 실행 API 구현이 없다.
해당 API가 확정되기 전에는 Frontend가 성공을 가장하거나 임의 request 형식을 만들지 않는다.
