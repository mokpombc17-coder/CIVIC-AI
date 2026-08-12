# Super Admin Room 채팅 Export

## 책임 경계

`chat_message_audit_events`는 CREATE/UPDATE/DELETE revision의 canonical
source이고 `chat_room_message_audit_sequences`는 Room별 변경 watermark다.
`chat_messages`는 일반 채팅의 현재 상태일 뿐 Export transcript 원천으로
사용하지 않는다.

FULL은 `(0, capturedWatermark]`의 event를 연속 sequence로 검증하며 재생한다.
메시지별 최종 snapshot만 메모리에 유지하고 전체 revision은 page 단위로
`events.jsonl`에 쓴다. CREATE 없는 UPDATE/DELETE, before 불일치, version gap,
roomSequence 중복, sender identity 변경은 전체 Export를 실패시킨다.

INCREMENTAL은 같은 `roomId + requestedByAdminId`의 최신 SUCCEEDED Job의
watermark를 시작점으로 사용한다. RUNNING/FAILED 또는 다른 관리자의 Job은
checkpoint가 아니다.

## Snapshot 의미

- message/event/transcript: captured Audit Ledger watermark 시점
- room metadata: Export 시작 시 stable-pair로 캡처한 현재 Room
- participant/profile: Export 시작 시 전체 Membership의 현재 snapshot

Audit Event의 `membershipId + userId`가 canonical identity다. Membership이
있으면 userId 일치를 검증하고, 없으면 audit identity 기반 synthetic participant를
생성한다.

## Artifact 생명주기

Export별 UUID workspace를 애플리케이션 전용 temp root 아래 생성한다. 파일과
directory는 가능한 플랫폼에서 각각 0600/0700으로 제한한다. 고정 ASCII entry만
ZIP에 넣고 `.part`를 닫고 검증한 뒤 같은 filesystem에서 `.zip`으로 rename한다.

HTTP body 전체 write와 flush 후에만 Job을 SUCCEEDED로 CAS한다. 전달 실패 또는
성공 상태 저장 실패 Job은 다음 Incremental base가 아니다. 정상·실패 모두
workspace를 즉시 삭제하고 startup 및 scheduled orphan cleanup으로 crash 잔여물을
정리한다. Cleanup은 configured root 밖 경로와 symbolic workspace를 거절한다.

## 보안과 제한

Endpoint는 `chat:audit:exports` scope 전용이다. 일반 Room owner나 participant
권한을 상속하지 않는다. HTML은 모든 값을 escape하고 외부 resource와 JavaScript를
차단하는 CSP를 포함한다. 로그·metric·Job metadata에는 본문, identity 목록,
temp path를 넣지 않는다.

전역 concurrency, Room당 RUNNING unique index, event/message/content/artifact/work
directory/time/disk limit으로 동기식 one-shot 작업의 비용을 제한한다.

v1의 전역 concurrency는 정확히 1이다. Workspace 생성 전 usable disk가
`minFreeDiskBytes + maxWorkDirectoryBytes` 이상인지 확인하며, event 범위 크기는
RUNNING Job 생성 직후 파일 생성 전에 `maxEventsPerExport`와 비교한다. 범위가 너무
크면 Job은 `FAILED/TOO_LARGE`가 되고 workspace는 만들지 않는다.

`maxWorkDirectoryBytes`는 사후 관측값이 아니라 모든 JSON/JSONL/HTML/manifest와
압축 중인 `artifact.part`가 공유하는 실제 byte budget이다. 문자 파일은 UTF-8로
인코딩된 실제 byte를 소비하고, ZIP output은 이 workspace budget과
`maxArtifactBytes`를 동시에 적용한다. 상한 초과 시 write가 즉시 중단되며 `.part`는
완성 artifact로 rename되지 않는다. 같은 generation deadline은 audit page와 event
처리, participant/transcript 출력, manifest, ZIP buffer copy, entry/전체 checksum,
atomic rename 직전까지 적용된다.

Execution은 SUCCEEDED 또는 FAILED 전이를 시도하지 않은 채 닫히면
`DELIVERY_FAILED`로 FAILED 전환을 시도한다. Job metadata 전환, workspace cleanup,
global permit 반환은 서로의 실패로 생략되지 않는다. Micrometer 등록·기록 실패도
Job 상태, HTTP 결과, cleanup, permit에 영향을 주지 않는다. Room/Membership
stable-pair가 제한 횟수 안에 안정화되지 않으면 데이터 손상으로 간주하지 않고
`503 CHAT_EXPORT_UNAVAILABLE`, `retryable=true`로 처리한다.

동기 Servlet 전송 timeout은 배포 계층에서 generation과 최대 전송 시간을 모두
포함해야 한다. 기본 generation 120초, 예상 최대 delivery 120초, grace 30초라면
reverse proxy, load balancer, servlet container의 response/write timeout을 최소
270초 이상으로 정렬한다. 실제 운영값은 네트워크 대역폭과 artifact 상한을 기준으로
확정한다. client disconnect나 write timeout은 `DELIVERY_FAILED`이며 checkpoint를
전진시키지 않고 workspace를 삭제하고 permit을 반환한다.
