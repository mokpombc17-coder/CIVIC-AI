# 관리자 Chat·Vote·Simulation 연동 경계

이 문서는 Frontend2가 현재 실제로 호출하는 관리자 도메인 API만 요약한다. 상세 request·response와
상태 전이는 서버 팀의 `admin-console-domain-api-contract.md`를 원문 계약으로 사용한다.

## 구현된 화면

- Chat `A-CHAT-001..002`, `A-CHAT-004..009`: 상태·공개 범위를 포함한 전체 방 목록·검색,
  관리자 즉시 종료, 기간별 대화 ZIP Export 기반 방 상세·통계·원본 다운로드, 생성 신청 목록·상세,
  카테고리 1~5개를 지정한 승인·반려, 카테고리 생성·이름 변경·삭제와 방 카테고리 전체 교체
- Vote `A-TASK-001..005`: Draft 생성·전체 수정, 예약·즉시 발행, 일정 변경, 종료·취소,
  정량 결과와 JSONL 다운로드
- Simulation `A-SIM-001..007`: Vote 과업 선택, SONA 집계 패널 설정·실행, 상태·취소,
  수동 재설정, 집계 결과와 익명 패널 응답 상세
- Main/Auth `A-HOME-001`: 권한별 승인·실패·마감·공용 지갑 요약, 검토 화면으로 바로 연결되는 Chat
  승인 대기 목록과 RAG 문서·Simulation의 대기/실행 중 작업을 표시

브라우저는 same-origin `/api/v1/admin/**`만 호출한다. Next.js BFF는 허용한 Chat·Vote path와 method만
각각 `CHAT_INTERNAL_URL`, `VOTE_INTERNAL_URL`로 전달한다. Simulation path는 공개 nginx가 Simulation
Resource Server로 직접 전달한다. 각 Resource Server가 HttpOnly Access Token 쿠키 또는 Bearer와
최종 scope, JWT, Origin/CSRF를 검증한다.

| 영역                                | 서버 business scope        |
| ----------------------------------- | -------------------------- |
| Chat 생성 신청                      | `chat:rooms:approve`       |
| Chat 채팅방 즉시 종료               | `chat:rooms:approve`       |
| Chat 관리자 전체 방 목록            | `chat:categories:manage`   |
| Chat 카테고리 관리·방 카테고리 교체 | `chat:categories:manage`   |
| 기존 방 version 조회                | `chat:rooms:read`          |
| Chat 기간별 대화 Export             | `chat:audit:exports`       |
| Vote 과업                           | `vote:tasks:admin`         |
| 과업 집계 시뮬레이션 조회           | `simulation:tasks:read`    |
| 과업 집계 시뮬레이션 실행·취소      | `simulation:tasks:run`     |
| 시뮬레이션 지갑·정책·사용량 조회    | `simulation:billing:read`  |
| 시뮬레이션 쿠폰·정책 변경           | `simulation:billing:write` |

Main/Auth는 `VOTE_ADMIN`에 `vote:tasks:admin`, `SIMULATION_ADMIN`에
`simulation:tasks:read`·`simulation:tasks:run`·`simulation:billing:read`·
`simulation:billing:write`을 발급한다. Simulation 과업 선택 화면은
Simulation 서버의 읽기 전용 `/api/v1/admin/simulation-tasks/**`를 호출한다. Simulation 서버가
Vote의 기존 과업 조회 계약을 내부에서 사용하므로 브라우저의 `SIMULATION_ADMIN` 토큰을 Vote 관리자
BFF에 직접 전달하지 않는다. Vote 저장소의 API와 권한 정책은 변경하지 않는다. Chat의
`chat:rooms:approve`·`chat:categories:manage`·`chat:rooms:read` 발급·검사 경로는 현재 계약과
일치한다. Frontend2는 필요한 scope를 BFF 경계에 표시하지만 토큰 자체를 해석하거나 임시로 발급하지
않는다.

관리 홈의 진행 목록은 `RAG_ADMIN`일 때 RAG 루트 폴더 하위의 `PENDING`·`PROCESSING` 문서를,
`SIMULATION_ADMIN`일 때 `/api/v1/admin/simulation-tasks`의 과업별 최신 실행 중 상태를 읽는다.
브라우저 탭이 보일 때만 10초 간격으로 갱신하며 두 Resource Server를 병렬 조회한다. 한쪽 조회가
실패해도 다른 쪽의 확인된 항목은 유지하고, 내부 ID 대신 과업 제목·파일명·처리 단계·진행률만
목록에 표시한다.

mutation은 자동 재전송하지 않는다. 채팅방 종료는 매 요청마다 새 UUID `Idempotency-Key`를 전송하고,
응답 성공 또는 연결 단절 뒤 `GET /api/v1/admin/rooms`에서 `CLOSED` 상태를 다시 확인한다. 응답이
불명확하거나 `409`이면 최신 상태를 먼저 다시 조회한다. `429`의 `Retry-After`, Problem Details의
`code`, `violations`, `traceId`를 보존한다. Vote 상세 결과는 JSON으로 변환하지 않고 NDJSON
attachment로 전달한다.

Simulation은 `Persona-main/main`에서 이관한 SONA 실행기를 사용하지만 과업 단위 가상 패널의
집계 실행만 소유한다. CIVIC 개별 사용자의 Persona 생성, 사용자별 Task 예측, 해당 데이터 조회는
Simulation Resource Server와 화면 계약에 포함하지 않는다.

## Chat 방·카테고리 운영

- 채팅방 운영·분석 화면은 `GET /api/v1/admin/rooms`로 `ACTIVE`·`CLOSED`,
  `LISTED`·`UNLISTED` 방을 검색하고 상태로 필터링한다. 카테고리 교체 화면은 참여자용
  `/api/v1/rooms`의 `ACTIVE + LISTED` 방과 그 목록 응답의 version을 사용해
  `PUT /api/v1/admin/rooms/{roomId}/categories`를 호출한다.
- `POST /api/v1/admin/rooms/{roomId}/commands/close`는 body 없이 UUID `Idempotency-Key`를
  전송한다. 성공 시 관리자 목록에서 `CLOSED`를 확인하며, 참여자가 남아 있어도 즉시 종료하므로
  `ROOM_HAS_OTHER_ACTIVE_MEMBERS`는 최신 서버 계약 위반으로 안내한다.
- 카테고리 목록에는 `usageCount`, `inUse`, `deletable`이 없다. 기본 카테고리를 제외하고 삭제를
  시도하며, `409 ROOM_CATEGORY_IN_USE`의 `referencedRoomCount`를 사용자에게 표시한다.
- 카테고리와 Room의 version conflict에서는 로컬 값을 덮어쓰지 않고 최신 리소스를 다시 조회한다.

Chat 관리자 직접 생성에는 아직 서버 계약이 없다. 대화 상세와 통계는
`POST /api/v1/admin/rooms/{roomId}/conversation-exports`의 v1 ZIP을 요청한 뒤 `manifest.json`,
`messages.jsonl`, `message_changes.jsonl`을 검증·분석한다.
