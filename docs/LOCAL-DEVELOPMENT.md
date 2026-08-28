# CIVIC Main/Auth 로컬 실행 가이드

이 문서는 저장소를 처음 받은 개발자가 별도 DB 설치나 비밀번호 해시 생성 없이 Main/Auth를 `http://localhost:8080`에서 실행하는 방법을 설명합니다.

## 1. 필요한 프로그램

- Git
- JDK 21 이상
- Docker Desktop 또는 Docker Engine과 Docker Compose v2
- `curl`

버전을 확인합니다.

```bash
git --version
java -version
docker version
docker compose version
curl --version
```

`docker version`에 Client와 Server가 모두 출력되어야 합니다. Server가 나오지 않으면 Docker Desktop 또는 Docker Engine을 먼저 실행합니다. Gradle은 저장소의 Wrapper가 자동으로 내려받으므로 별도로 설치하지 않습니다.

Windows에서는 Docker Desktop과 WSL2 터미널 사용을 권장합니다.

## 2. 저장소 받기

```bash
git clone https://github.com/Ham-n-Cheeze/civic-main-auth.git
cd civic-main-auth
```

비공개 저장소이므로 GitHub 접근 권한이 필요합니다. 최초 실행 시 GitHub, Docker Hub, `services.gradle.org`, Maven Central에 접근할 수 있어야 합니다.

## 3. 한 명령으로 실행

```bash
./dev-local.sh
```

이 명령은 다음 작업을 자동으로 수행합니다.

1. PostgreSQL 16.9와 Redis 7.4 이미지를 준비합니다.
2. 두 컨테이너를 `127.0.0.1`에만 연결하고 health가 정상일 때까지 기다립니다.
3. `local` Spring 프로필로 Main/Auth를 빌드하고 `8080`에서 실행합니다.
4. 빈 PostgreSQL에 Flyway migration을 적용합니다.
5. 로컬 관리자 1개와 사용자 10개를 자동 생성합니다.

최초 실행은 Docker 이미지, Gradle과 Java 의존성을 내려받기 때문에 시간이 더 걸릴 수 있습니다. 다음 로그가 출력되면 준비가 끝난 것입니다.

```text
Started MainAuthApplication
Local development accounts are ready: admin@dev.civic.test and user01-user10@dev.civic.test
```

`local` 프로필의 기본값은 다음과 같습니다.

| 항목 | 기본값 |
| --- | --- |
| Main/Auth | `http://localhost:8080` |
| PostgreSQL | `localhost:5432/civic_main` |
| Redis | `localhost:6379` |
| Issuer | `http://localhost:8080` |
| Browser origin | `http://localhost:8080` |
| Secure Cookie | 비활성화, 로컬 HTTP 전용 |
| SMTP health check | 비활성화 |

로컬 계정 시더는 JDBC 주소의 host가 `localhost`, `127.0.0.1` 또는 `::1`일 때만 동작합니다. 실수로 원격 DB를 지정하면 계정을 만들지 않고 실행을 중단합니다.

## 4. 자동 생성 계정

| 구분 | 이메일 | 비밀번호 | 권한 |
| --- | --- | --- | --- |
| 관리자 | `admin@dev.civic.test` | `CivicDevAdmin!2026` | `SUPER_ADMIN`과 모든 관리 permission |
| 사용자 | `user01@dev.civic.test` | `CivicDevUser!2026` | `PARTICIPANT` |
| 사용자 | `user02@dev.civic.test` | `CivicDevUser!2026` | `PARTICIPANT` |
| 사용자 | `user03@dev.civic.test` | `CivicDevUser!2026` | `PARTICIPANT` |
| 사용자 | `user04@dev.civic.test` | `CivicDevUser!2026` | `PARTICIPANT` |
| 사용자 | `user05@dev.civic.test` | `CivicDevUser!2026` | `PARTICIPANT` |
| 사용자 | `user06@dev.civic.test` | `CivicDevUser!2026` | `PARTICIPANT` |
| 사용자 | `user07@dev.civic.test` | `CivicDevUser!2026` | `PARTICIPANT` |
| 사용자 | `user08@dev.civic.test` | `CivicDevUser!2026` | `PARTICIPANT` |
| 사용자 | `user09@dev.civic.test` | `CivicDevUser!2026` | `PARTICIPANT` |
| 사용자 | `user10@dev.civic.test` | `CivicDevUser!2026` | `PARTICIPANT` |

관리자에게는 다음 permission이 모두 부여됩니다.

- `RAG_ADMIN`
- `CHAT_ADMIN`
- `VOTE_ADMIN`
- `SIMULATION_ADMIN`

계정은 `ACTIVE`, 이메일 인증 완료, 비밀번호 변경 불필요 상태로 만들어집니다. 시더는 없는 계정과 권한만 추가하므로 재시작해도 개발자가 변경한 비밀번호나 계정 상태를 덮어쓰지 않습니다.

이 계정과 비밀번호는 로컬 개발 전용이며 운영이나 공유 개발 서버에서 사용하면 안 됩니다.

## 5. 실행 확인

별도 터미널에서 health와 OpenID 정보를 확인합니다.

```bash
curl --fail --silent --show-error http://localhost:8080/actuator/health
curl --fail --silent --show-error http://localhost:8080/actuator/health/readiness
curl --fail --silent --show-error http://localhost:8080/.well-known/openid-configuration
curl --fail --silent --show-error http://localhost:8080/.well-known/jwks.json
```

health와 readiness는 모두 `"status":"UP"`이어야 합니다. discovery의 issuer는 `http://localhost:8080`, JWKS에는 `kty`가 `RSA`인 키가 있어야 합니다.

다음 예시는 macOS 터미널에서 브라우저 없이 로그인하고, HttpOnly 쿠키로 발급된 JWT를
추출한 뒤 같은 cookie jar로 `/me`를 호출합니다. 로그인 응답 본문은 없으며 성공하면
`204 No Content`와 `civic_ai_access_token` 쿠키가 반환됩니다.

관리자 JWT를 발급받습니다.

```bash
export CIVIC_AUTH_URL="http://localhost:8080"
export CIVIC_ADMIN_COOKIE_JAR="$(mktemp "${TMPDIR:-/tmp}/civic-main-auth-admin.XXXXXX")"

curl --fail --silent --show-error \
  --output /dev/null \
  --write-out 'admin login: HTTP %{http_code}\n' \
  --cookie-jar "$CIVIC_ADMIN_COOKIE_JAR" \
  --header "Origin: $CIVIC_AUTH_URL" \
  --header 'Sec-Fetch-Site: same-origin' \
  --header 'Content-Type: application/json' \
  --data '{"email":"admin@dev.civic.test","password":"CivicDevAdmin!2026"}' \
  "$CIVIC_AUTH_URL/api/v1/auth/login"

export CIVIC_ADMIN_JWT="$(awk -F '\t' '$6 == "civic_ai_access_token" { print $7 }' "$CIVIC_ADMIN_COOKIE_JAR")"
test -n "$CIVIC_ADMIN_JWT" || { echo '관리자 JWT를 찾지 못했습니다.' >&2; exit 1; }
printf 'admin JWT: %s\n' "$CIVIC_ADMIN_JWT"

curl --fail --silent --show-error \
  --cookie "$CIVIC_ADMIN_COOKIE_JAR" \
  "$CIVIC_AUTH_URL/api/v1/auth/me"
```

`admin login: HTTP 204`가 출력되어야 합니다. `/me` 응답의 role은 `HIGHEST_ADMIN`,
`must_change_password`는 `false`이며 네 가지 관리 permission이 모두 포함되어야 합니다.

일반 사용자 JWT도 같은 방식으로 발급받습니다.

```bash
export CIVIC_USER_COOKIE_JAR="$(mktemp "${TMPDIR:-/tmp}/civic-main-auth-user01.XXXXXX")"

curl --fail --silent --show-error \
  --output /dev/null \
  --write-out 'user01 login: HTTP %{http_code}\n' \
  --cookie-jar "$CIVIC_USER_COOKIE_JAR" \
  --header "Origin: $CIVIC_AUTH_URL" \
  --header 'Sec-Fetch-Site: same-origin' \
  --header 'Content-Type: application/json' \
  --data '{"email":"user01@dev.civic.test","password":"CivicDevUser!2026"}' \
  "$CIVIC_AUTH_URL/api/v1/auth/login"

export CIVIC_USER_JWT="$(awk -F '\t' '$6 == "civic_ai_access_token" { print $7 }' "$CIVIC_USER_COOKIE_JAR")"
test -n "$CIVIC_USER_JWT" || { echo '사용자 JWT를 찾지 못했습니다.' >&2; exit 1; }
printf 'user01 JWT: %s\n' "$CIVIC_USER_JWT"

curl --fail --silent --show-error \
  --cookie "$CIVIC_USER_COOKIE_JAR" \
  "$CIVIC_AUTH_URL/api/v1/auth/me"
```

`user01 login: HTTP 204`가 출력되어야 하며 `/me` 응답의 role은 `PARTICIPANT`여야 합니다.
추출한 `CIVIC_ADMIN_JWT`와 `CIVIC_USER_JWT`는 Chat, Vote, RAG 같은 Resource Server를
`Authorization: Bearer <JWT>` 방식으로 호출할 때 사용합니다. Main/Auth의 `/me`, `/csrf`
등 브라우저 공개 API는 cookie-only 경로이므로 `Authorization` 헤더를 받지 않습니다.

JWT는 비밀번호와 같은 자격 증명이므로 터미널 출력이나 cookie jar를 공유하거나 저장소에
커밋하지 마세요. Access JWT의 기본 유효 시간은 15분입니다. 확인이 끝나면 임시 파일과
환경변수를 정리할 수 있습니다.

```bash
rm -f "$CIVIC_ADMIN_COOKIE_JAR" "$CIVIC_USER_COOKIE_JAR"
unset CIVIC_ADMIN_COOKIE_JAR CIVIC_USER_COOKIE_JAR CIVIC_ADMIN_JWT CIVIC_USER_JWT
```

## 6. 종료와 재실행

Main/Auth만 종료하려면 실행 중인 터미널에서 `Ctrl+C`를 누릅니다. PostgreSQL과 Redis 데이터는 유지됩니다.

PostgreSQL과 Redis 컨테이너까지 종료하려면 다음 명령을 실행합니다.

```bash
./dev-local.sh down
```

다시 실행할 때도 같은 명령 하나만 사용합니다.

```bash
./dev-local.sh
```

Docker volume에 DB와 Redis 데이터가 남아 있으므로 migration과 계정 시딩은 멱등하게 동작합니다.

## 7. 로컬 DB 완전 초기화

다음 명령은 이 프로젝트의 로컬 PostgreSQL·Redis volume과 그 안의 데이터를 복구할 수 없게 삭제합니다. 다른 Compose 프로젝트에는 영향을 주지 않지만 필요한 로컬 데이터가 없는지 먼저 확인하세요.

```bash
./dev-local.sh reset
```

그 후 `./dev-local.sh`를 실행하면 빈 DB에 migration과 테스트 계정 생성이 다시 수행됩니다.

## 8. 포트가 이미 사용 중인 경우

새 컴퓨터에서는 기본 포트 사용을 권장합니다. 다른 서비스가 이미 포트를 사용한다면 일시적으로 다음처럼 변경할 수 있습니다.

```bash
CIVIC_LOCAL_SERVER_PORT=18080 \
CIVIC_LOCAL_POSTGRES_PORT=15432 \
CIVIC_LOCAL_REDIS_PORT=16379 \
./dev-local.sh
```

스크립트는 변경된 서버 포트에 맞춰 issuer와 browser origin도 자동으로 설정합니다.

기본 `8080` 연동이 필요하다면 기존 `8080` 프로세스를 종료한 뒤 환경변수 없이 실행합니다.

## 9. 프론트엔드 연동

Postman, `curl` 또는 다른 서버가 Auth를 직접 호출할 때의 base URL은 `http://localhost:8080`입니다.

브라우저 프론트엔드가 `http://localhost:3000`에서 실행된다면 브라우저가 `8080`을 직접 호출하면 안 됩니다. 프론트엔드 BFF 또는 reverse proxy가 Auth 요청을 `localhost:8080`으로 전달하고 브라우저에는 같은 origin으로 보여야 합니다.

이 경우 다음처럼 실행합니다.

```bash
CIVIC_ISSUER=http://localhost:3000 \
CIVIC_BROWSER_ORIGIN=http://localhost:3000 \
./dev-local.sh
```

Auth의 listen 포트는 계속 `8080`이며 browser origin과 issuer만 프론트엔드의 공개 주소가 됩니다. 프록시는 여러 `Set-Cookie` 헤더, Cookie와 `Authorization` 헤더를 임의로 합치거나 변환하지 않아야 합니다.

필요한 프록시 경로는 다음과 같습니다.

- `/.well-known/*`
- `/api/v1/auth/*`
- `/api/v1/account/*`
- `/api/v1/signup/*`
- `/api/v1/admin/*`

## 10. 메일과 worker 범위

이 최소 실행 구성에는 SMTP 서버가 포함되지 않습니다. 따라서 기본 로그인, 토큰, 관리자 권한과 계정 API는 테스트할 수 있지만 이메일 인증, 비밀번호 재설정, 2FA 메일은 별도 SMTP 설정 없이는 동작하지 않습니다.

기본 `8080` 실행과 로그인 테스트에는 worker도 필요하지 않습니다. 큐 기반 메일, outbox 전파와 보존 기간 정리 작업을 검증할 때만 별도 worker 실행과 SMTP 구성을 준비합니다.

## 11. 자동 테스트

Docker가 실행 중이면 다음 명령으로 전체 테스트를 실행합니다.

```bash
./gradlew test
```

Testcontainers가 테스트 전용 PostgreSQL과 Redis를 자동 생성합니다. `./dev-local.sh`가 만든 로컬 데이터는 테스트에 사용되지 않습니다.

인증 및 Resource Server 연동의 전체 계약은 [CIVIC-MAIN-AUTH-LOGIN-CONTEXT.md](./CIVIC-MAIN-AUTH-LOGIN-CONTEXT.md)를 함께 확인하세요.
