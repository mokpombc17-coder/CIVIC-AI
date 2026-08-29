# 관리자 Chat·Vote·Simulation 연동 경계

이 문서는 Frontend2가 현재 실제로 호출하는 관리자 도메인 API만 요약한다. 상세 request·response와
상태 전이는 서버 팀의 `admin-console-domain-api-contract.md`를 원문 계약으로 사용한다.

## 구현된 화면

- Chat `A-CHAT-004..007`: 생성 신청 목록·상세, 카테고리 1~5개를 지정한 승인, 반려,
  카테고리 생성·이름 변경·삭제, 공개 중인 목록 방의 카테고리 전체 교체
- Vote `A-TASK-001..005`: Draft 생성·전체 수정, 예약·즉시 발행, 일정 변경, 종료·취소,
  정량 결과와 JSONL 다운로드
- Simulation `A-SIM-001..007`: Vote 과업 선택, SONA 집계 패널 설정·실행, 상태·취소,
  수동 재설정, 집계 결과와 익명 패널 응답 상세
- Main/Auth `A-HOME-001`: 권한별 승인·실패·마감·공용 지갑 요약과 RAG 문서·Simulation의
  대기/실행 중 작업을 한 목록으로 표시

브라우저는 same-origin `/api/v1/admin/**`만 호출한다. Next.js BFF는 허용한 Chat·Vote path와 method만
각각 `CHAT_INTERNAL_URL`, `VOTE_INTERNAL_URL`로 전달한다. Simulation path는 공개 nginx가 Simulation
Resource Server로 직접 전달한다. 각 Resource Server가 HttpOnly Access Token 쿠키 또는 Bearer와
최종 scope, JWT, Origin/CSRF를 검증한다.

| 영역                                | 서버 business scope        |
| ----------------------------------- | -------------------------- |
| Chat 생성 신청                      | `chat:rooms:approve`       |
| Chat 카테고리 관리·방 카테고리 교체 | `chat:categories:manage`   |
| 기존 방 version 조회                | `chat:rooms:read`          |
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
`chat:rooms:approve` 발급·검사 경로는 현재 계약과 일치한다. 운영 관리자 JWT의 최종 형식과
`chat:categories:manage`·`chat:rooms:read` 발급 계약은 아직 확정 전이므로 Frontend2는 해당 scope를
요구하는 BFF 경계를 표시만 하고 토큰 자체를 해석하거나 임시로 발급하지 않는다. 운영 인증 연동은
Main/Auth 계약 수신 후 마무리한다.

관리 홈의 진행 목록은 `RAG_ADMIN`일 때 RAG 루트 폴더 하위의 `PENDING`·`PROCESSING` 문서를,
`SIMULATION_ADMIN`일 때 `/api/v1/admin/simulation-tasks`의 과업별 최신 실행 중 상태를 읽는다.
브라우저 탭이 보일 때만 10초 간격으로 갱신하며 두 Resource Server를 병렬 조회한다. 한쪽 조회가
실패해도 다른 쪽의 확인된 항목은 유지하고, 내부 ID 대신 과업 제목·파일명·처리 단계·진행률만
목록에 표시한다.

mutation은 자동 재전송하지 않는다. 응답이 불명확하거나 `409`이면 상세를 먼저 다시 조회한다. `429`의
`Retry-After`, Problem Details의 `code`, `violations`, `traceId`를 보존한다. Vote 상세 결과는 JSON으로
변환하지 않고 NDJSON attachment로 전달한다.

Simulation은 `Persona-main/main`에서 이관한 SONA 실행기를 사용하지만 과업 단위 가상 패널의
집계 실행만 소유한다. CIVIC 개별 사용자의 Persona 생성, 사용자별 Task 예측, 해당 데이터 조회는
Simulation Resource Server와 화면 계약에 포함하지 않는다.

## Chat 카테고리 운영 제한

- 관리자용 전체 채팅방 목록·검색 API는 없다. 참여자용 `/api/v1/rooms`에 노출되는
  `ACTIVE + LISTED` 방만 검색·선택하고, 목록 응답의 version으로
  `PUT /api/v1/admin/rooms/{roomId}/categories`를 호출한다. 비공개 또는 목록 비공개 방을
  `roomId`로 직접 조회하는 운영 UI는 제공하지 않는다.
- 카테고리 목록에는 `usageCount`, `inUse`, `deletable`이 없다. 기본 카테고리를 제외하고 삭제를
  시도하며, `409 ROOM_CATEGORY_IN_USE`의 `referencedRoomCount`를 사용자에게 표시한다.
- 카테고리와 Room의 version conflict에서는 로컬 값을 덮어쓰지 않고 최신 리소스를 다시 조회한다.

Chat 활성 방 전체 관리, 관리자 직접 생성, 통계 화면에는 아직 서버 계약이 없다. Chat 서버의 일반
방 API를 관리자 전체 방 검색이나 목록에 노출되지 않는 임의 방 운영 용도로 재사용하지 않는다.
