# CIVIC-AI

시민이 자료를 살펴보고, 토론하고, 투표로 의견을 더하는 AI 기반 시민 참여 플랫폼의 소스 코드입니다.
한국언론진흥재단의 지원을 받아 개발되었습니다.

## 구성

| 폴더 | 역할 |
| --- | --- |
| `frontend/landing-auth` | 홈, 로그인·회원가입, 계정, 관리자 화면 (Next.js) |
| `frontend/chat-vote-survey` | 토론방, 투표, 설문 화면 (Next.js) |
| `backend/auth-resource-server` | 계정·인증, 관리자 권한 (Spring Boot) |
| `backend/chat-resource-server` | 토론방과 실시간 메시지 (Spring Boot) |
| `backend/vote-resource-server` | 투표, 설문 (Spring Boot) |

## 로컬에서 전체 실행

### 필요한 프로그램

- Docker와 Docker Compose v2 (실행 중이어야 합니다)
- JDK 21
- Node.js 24
- pnpm 11 또는 corepack
- curl, Git, Bash

처음 실행할 때는 이미지와 의존성을 받고 빌드하므로 몇 분 걸립니다. macOS와 Linux 기준이며,
Windows에서는 WSL2 안에서 실행하세요.

### 실행

```bash
./scripts/local/stack.sh up
```

준비가 끝나면 다음 주소로 접속합니다.

| 항목 | 주소 |
| --- | --- |
| 서비스 | http://localhost:3000 |
| 수신 메일 확인 (회원가입·비밀번호 재설정 인증 코드) | http://localhost:18025 |

로컬 전용 테스트 계정이 자동으로 만들어집니다.

| 구분 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 관리자 | `admin@dev.civic.test` | `CivicDevAdmin!2026` |
| 사용자 | `user01@dev.civic.test` ~ `user10@dev.civic.test` | `CivicDevUser!2026` |

이 계정과 비밀번호는 공개된 값이므로 실제 서비스에서 사용하면 안 됩니다. 로그인 쿠키가 `Secure`
속성을 사용하므로 Chrome이나 Edge로 접속하세요. 토론방과 투표는 설문을 완료한 뒤 이용할 수 있습니다.

### 명령

| 명령 | 설명 |
| --- | --- |
| `./scripts/local/stack.sh up` | 빌드하고 전체 서비스를 시작합니다. 소스가 그대로면 빌드를 건너뜁니다. |
| `./scripts/local/stack.sh status` | 서비스 상태를 보여 줍니다. |
| `./scripts/local/stack.sh logs <서비스>` | 로그를 봅니다. `gateway`, `landing`, `community`, `auth`, `auth-worker`, `chat`, `vote` |
| `./scripts/local/stack.sh down` | 모두 종료합니다. 데이터는 유지됩니다. |
| `./scripts/local/stack.sh reset` | 모두 종료하고 로컬 데이터와 빌드 기록을 지웁니다. |

### 포트 변경

사용 중인 포트가 있으면 환경 변수로 바꿉니다. 서비스 주소를 바꾸면 프런트엔드를 다시 빌드합니다.

```bash
CIVIC_LOCAL_PORT=13000 CIVIC_LOCAL_MAIL_UI_PORT=19025 ./scripts/local/stack.sh up
```

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `CIVIC_LOCAL_PORT` | 3000 | 서비스 주소 |
| `CIVIC_LOCAL_MAIL_UI_PORT` | 18025 | 메일 확인 화면 |
| `CIVIC_LOCAL_SMTP_PORT` | 11025 | SMTP |
| `CIVIC_LOCAL_LANDING_PORT`, `CIVIC_LOCAL_COMMUNITY_PORT` | 3100, 3101 | 프런트엔드 |
| `CIVIC_LOCAL_AUTH_PORT`, `CIVIC_LOCAL_AUTH_WORKER_PORT` | 8080, 8081 | 인증 서버, 인증 워커 |
| `CIVIC_LOCAL_CHAT_PORT`, `CIVIC_LOCAL_VOTE_PORT` | 8082, 8083 | 토론방, 투표 서버 |
| `CIVIC_LOCAL_AUTH_DB_PORT`, `CIVIC_LOCAL_VOTE_DB_PORT` | 15432, 15433 | PostgreSQL |
| `CIVIC_LOCAL_REDIS_PORT`, `CIVIC_LOCAL_MONGO_PORT` | 16379, 27117 | Redis, MongoDB |

### 동작 방식

`scripts/local/gateway.mjs`가 하나의 주소로 요청을 받아 경로에 따라 각 서비스로 나눕니다. 운영과 같은
same-origin 검사를 거치도록 프런트엔드는 production 빌드로 실행합니다. 데이터베이스와 메일 서버는
`scripts/local/infra.yaml`로 Docker에서 실행하고, 로그와 실행 상태는 `.local/`에 저장합니다.

로컬 실행은 개발과 체험을 위한 구성입니다. 운영에 배포할 때는 비밀값, 도메인, HTTPS를 별도로
구성해야 합니다.

## RAG, 시뮬레이션, 개인별 페르소나

RAG, 시뮬레이션, 개인별 페르소나 기능은 이 저장소에 포함되어 있지 않습니다. 화면의 AI 메뉴와
시뮬레이션 관리 화면은 해당 서비스 없이 동작하지 않고, 로컬 실행에서 투표의 AI 예상 답변과 페르소나는
테스트용 가짜 응답을 사용합니다.

이 기능들을 사용하고 싶다면 포스트에이아이에 연락해 주세요.

## 라이선스

[Apache License 2.0](LICENSE)
