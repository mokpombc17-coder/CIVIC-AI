# Survey Consent Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, test, review, merge, and deploy the authenticated survey consent receipt API in Main/Auth.

**Architecture:** A dedicated Flyway policy allowlist and receipt ledger back a focused controller/service pair. The access-token subject is the only user identity, PostgreSQL's `(user_id, idempotency_key)` constraint serializes retries, and explicit Jackson annotations preserve the requested camelCase wire contract.

**Tech Stack:** Java 21, Spring Boot 3.5.4, Spring MVC, Spring JDBC, PostgreSQL 16, Flyway, JUnit 5, MockMvc, Testcontainers, Docker Buildx.

**Spec:** `docs/superpowers/specs/2026-09-04-survey-consent-acceptance-design.md`

## Global Constraints

- Only `civic-main-auth` may be modified for this feature; Vote, Frontend, and the receipt-verification API are out of scope.
- The public route is exactly `POST /api/v1/me/consent-acceptances`.
- The request and response property names are exactly the supplied camelCase names despite the application's global snake_case setting.
- Only `SENSITIVE_INFORMATION_CONSENT` with version `2026-09-04` is active initially.
- The authenticated access-token `sub`, never a request field, supplies the stored user ID.
- Matching retries return the original two-field response; conflicting reuse of one user's key returns `409`.
- Preserve the unrelated untracked `.DS_Store`.
- Build one immutable `linux/arm64` image and run `main-auth` and `main-worker` from the same exact reference.

---

### Task 1: Create the policy allowlist and receipt ledger

**Files:**
- Create: `src/main/resources/db/migration/V22__survey_consent_acceptance_receipts.sql`
- Modify: `src/test/java/ai/civic/mainauth/MigrationTest.java`

**Interfaces:**
- Consumes: existing `users(id)` and Flyway migration sequence through V21.
- Produces: `consent_acceptance_policies` and `consent_acceptances`, including composite policy FK and `uq_consent_acceptances_user_idempotency`.

- [ ] **Step 1: Write the failing migration assertions**

Add the two table names to `requiredTables`, then query and assert the single active policy and constraints:

```java
assertThat(actual).contains("consent_acceptance_policies", "consent_acceptances");

try (var policy = connection.prepareStatement("""
        select document_code, document_version from consent_acceptance_policies
        where active order by document_code, document_version
        """)) {
    try (var rows = policy.executeQuery()) {
        assertThat(rows.next()).isTrue();
        assertThat(rows.getString("document_code")).isEqualTo("SENSITIVE_INFORMATION_CONSENT");
        assertThat(rows.getString("document_version")).isEqualTo("2026-09-04");
        assertThat(rows.next()).isFalse();
    }
}
```

Also inspect `pg_constraint` and assert a composite foreign key covering `document_code, document_version` and a user-scoped unique constraint covering `user_id, idempotency_key`.

- [ ] **Step 2: Run the migration test and confirm RED**

Run: `./gradlew test --tests ai.civic.mainauth.MigrationTest --rerun-tasks`

Expected: FAIL because `consent_acceptance_policies` and `consent_acceptances` do not exist.

- [ ] **Step 3: Add V22**

Create the migration with this schema:

```sql
create table consent_acceptance_policies (
    document_code varchar(64) not null,
    document_version varchar(100) not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    deactivated_at timestamptz,
    primary key (document_code, document_version)
);

insert into consent_acceptance_policies(document_code, document_version)
values ('SENSITIVE_INFORMATION_CONSENT', '2026-09-04');

create table consent_acceptances (
    consent_receipt_id uuid primary key,
    user_id uuid not null references users(id) on delete restrict,
    document_code varchar(64) not null,
    document_version varchar(100) not null,
    round_id uuid not null,
    client_clicked_at timestamptz not null,
    accepted_at timestamptz not null,
    idempotency_key uuid not null,
    request_sha256 char(64) not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null default now(),
    constraint fk_consent_acceptances_policy foreign key (document_code, document_version)
        references consent_acceptance_policies(document_code, document_version) on delete restrict,
    constraint uq_consent_acceptances_user_idempotency unique (user_id, idempotency_key)
);

create index ix_consent_acceptances_user_round_policy
    on consent_acceptances(user_id, round_id, document_code, document_version);
```

- [ ] **Step 4: Run the migration test and confirm GREEN**

Run: `./gradlew test --tests ai.civic.mainauth.MigrationTest --rerun-tasks`

Expected: PASS with Flyway applying V22 on a fresh PostgreSQL 16 container.

- [ ] **Step 5: Commit the schema slice**

```bash
git add src/main/resources/db/migration/V22__survey_consent_acceptance_receipts.sql \
  src/test/java/ai/civic/mainauth/MigrationTest.java
git commit -m "feat(auth): add survey consent receipt schema"
```

### Task 2: Implement transactional receipt creation and replay

**Files:**
- Create: `src/main/java/ai/civic/mainauth/consent/ConsentAcceptanceService.java`
- Create: `src/main/java/ai/civic/mainauth/consent/ConsentAcceptanceConflictException.java`
- Create: `src/main/java/ai/civic/mainauth/consent/ConsentAcceptanceValidationException.java`
- Create: `src/test/java/ai/civic/mainauth/consent/ConsentAcceptanceServiceTest.java`

**Interfaces:**
- Consumes: `consent_acceptance_policies`, `consent_acceptances`, and authenticated `UUID userId`.
- Produces: `ConsentAcceptanceService.accept(UUID, UUID, AcceptanceRequest)` returning `ConsentReceipt(UUID consentReceiptId, Instant acceptedAt)`.

- [ ] **Step 1: Write failing service integration tests**

Use a fixed request and literal fingerprint:

```java
var request = new ConsentAcceptanceService.AcceptanceRequest(
        "SENSITIVE_INFORMATION_CONSENT", "2026-09-04",
        UUID.fromString("00000000-0000-0000-0000-000000000001"),
        Instant.parse("2026-09-04T03:10:20.123Z"));
var receipt = service.accept(userId, idempotencyKey, request);
assertThat(jdbc.queryForObject("""
        select request_sha256 from consent_acceptances where consent_receipt_id = ?
        """, String.class, receipt.consentReceiptId()))
        .isEqualTo("932b278432fcda3a0dc2e7323ff6d878d1c188c390748f302dca18deaf11d715");
```

Add separate tests proving matching replay, changed-body conflict, inactive/unknown policy rejection, same key isolation between two users, and two concurrent matching calls leaving one row and returning the same receipt.

- [ ] **Step 2: Run the service test and confirm RED**

Run: `./gradlew test --tests ai.civic.mainauth.consent.ConsentAcceptanceServiceTest --rerun-tasks`

Expected: test compilation FAIL because `ConsentAcceptanceService` and its exceptions do not exist.

- [ ] **Step 3: Implement the minimal transactional service**

Expose these records and method:

```java
public record AcceptanceRequest(
        String documentCode, String documentVersion, UUID roundId, Instant clientClickedAt) {}
public record ConsentReceipt(UUID consentReceiptId, Instant acceptedAt) {}

@Transactional
public ConsentReceipt accept(UUID userId, UUID idempotencyKey, AcceptanceRequest request) {
    requireActivePolicy(request.documentCode(), request.documentVersion());
    var fingerprint = fingerprint(request);
    var candidate = new ConsentReceipt(UUID.randomUUID(), clock.instant());
    var inserted = insert(userId, idempotencyKey, request, fingerprint, candidate);
    if (inserted) return candidate;
    var existing = findExisting(userId, idempotencyKey);
    if (!existing.requestSha256().equals(fingerprint)) {
        throw new ConsentAcceptanceConflictException(
                "Idempotency-Key was already used for a different consent request");
    }
    return new ConsentReceipt(existing.consentReceiptId(), existing.acceptedAt());
}
```

Use `INSERT ... ON CONFLICT (user_id, idempotency_key) DO NOTHING`, a subsequent exact user/key read, `Clock.systemUTC()`, and `MessageDigest.getInstance("SHA-256")` over the spec's four-line canonical UTF-8 value.

- [ ] **Step 4: Run the service test and confirm GREEN**

Run: `./gradlew test --tests ai.civic.mainauth.consent.ConsentAcceptanceServiceTest --rerun-tasks`

Expected: PASS, including the concurrent retry case.

- [ ] **Step 5: Commit the service slice**

```bash
git add src/main/java/ai/civic/mainauth/consent \
  src/test/java/ai/civic/mainauth/consent/ConsentAcceptanceServiceTest.java
git commit -m "feat(auth): record idempotent survey consent receipts"
```

### Task 3: Expose the exact authenticated camelCase API

**Files:**
- Create: `src/main/java/ai/civic/mainauth/consent/ConsentAcceptanceController.java`
- Create: `src/test/java/ai/civic/mainauth/consent/ConsentAcceptanceControllerTest.java`
- Modify: `src/main/java/ai/civic/mainauth/config/ApiExceptionHandler.java`

**Interfaces:**
- Consumes: access-token cookie, `X-CSRF-Token`, canonical `Idempotency-Key`, browser metadata, and `ConsentAcceptanceService.accept`.
- Produces: `201 {"consentReceiptId":"...","acceptedAt":"..."}`, `400`, `401`, and `409` contracts.

- [ ] **Step 1: Write failing MockMvc contract tests**

Create a participant with `AccessCredentialTestFactory`, then test the exact happy-path body:

```java
mvc.perform(post("/api/v1/me/consent-acceptances")
        .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
        .header("X-CSRF-Token", credential.csrfToken())
        .header("Idempotency-Key", idempotencyKey.toString())
        .header("Origin", "https://localhost")
        .header("Sec-Fetch-Site", "same-origin")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
                {"documentCode":"SENSITIVE_INFORMATION_CONSENT",
                 "documentVersion":"2026-09-04",
                 "roundId":"00000000-0000-0000-0000-000000000001",
                 "clientClickedAt":"2026-09-04T03:10:20.123Z"}
                """))
    .andExpect(status().isCreated())
    .andExpect(jsonPath("$.consentReceiptId").isString())
    .andExpect(jsonPath("$.acceptedAt").isString())
    .andExpect(jsonPath("$.consent_receipt_id").doesNotExist())
    .andExpect(jsonPath("$.accepted_at").doesNotExist());
```

Add tests for replay equality and one row, changed-body `409`, unsupported pair `400`, missing/malformed/noncanonical key `400`, missing cookie `401`, invalid CSRF `400`, wrong origin/fetch-site `400`, and snake_case request property rejection.

- [ ] **Step 2: Run the controller test and confirm RED**

Run: `./gradlew test --tests ai.civic.mainauth.consent.ConsentAcceptanceControllerTest --rerun-tasks`

Expected: FAIL with `404` because the route does not exist.

- [ ] **Step 3: Implement controller and exception mappings**

Use explicit wire names:

```java
record CreateRequest(
        @JsonProperty("documentCode") @NotBlank @Size(max = 64) String documentCode,
        @JsonProperty("documentVersion") @NotBlank @Size(max = 100) String documentVersion,
        @JsonProperty("roundId") @NotNull UUID roundId,
        @JsonProperty("clientClickedAt") @NotNull Instant clientClickedAt) {}

record CreateResponse(
        @JsonProperty("consentReceiptId") UUID consentReceiptId,
        @JsonProperty("acceptedAt") Instant acceptedAt) {}
```

Authenticate with `AuthenticatedUserService.require(accessToken)`, validate the CSRF token with `CsrfService.matches`, apply `BrowserRequestPolicy.requireAuthenticatedMutation`, parse and round-trip-compare the idempotency UUID, call the service with `user.userId()`, and return `ResponseEntity.status(201)`.

Map `ConsentAcceptanceValidationException` to the existing `400 Request rejected` shape and `ConsentAcceptanceConflictException` to `409 Request conflict`.

- [ ] **Step 4: Run controller and service tests and confirm GREEN**

Run: `./gradlew test --tests 'ai.civic.mainauth.consent.*' --rerun-tasks`

Expected: PASS with exact camelCase response and all security/idempotency cases.

- [ ] **Step 5: Commit the API slice**

```bash
git add src/main/java/ai/civic/mainauth/consent/ConsentAcceptanceController.java \
  src/main/java/ai/civic/mainauth/config/ApiExceptionHandler.java \
  src/test/java/ai/civic/mainauth/consent/ConsentAcceptanceControllerTest.java
git commit -m "feat(auth): expose survey consent acceptance API"
```

### Task 4: Verify, review, and publish the PR

**Files:**
- Modify only if a verified test or review finding requires it: files introduced in Tasks 1-3.

**Interfaces:**
- Consumes: completed feature branch and the design checklist.
- Produces: pushed branch, reviewed GitHub PR, and merged commit on `origin/main`.

- [ ] **Step 1: Run fresh full verification**

Run: `./gradlew clean test`

Expected: `BUILD SUCCESSFUL` with zero failed tests.

- [ ] **Step 2: Inspect the complete diff and migration history**

Run:

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
./gradlew flywayInfo
```

If the project does not configure the Gradle Flyway plugin, replace the last command with the already-passing Testcontainers `MigrationTest` and record that limitation rather than adding a plugin.

- [ ] **Step 3: Push and create the PR**

```bash
git push -u origin feat/survey-consent-acceptance-20260904
gh pr create --base main --head feat/survey-consent-acceptance-20260904 \
  --title "feat: add survey consent acceptance receipts" \
  --body-file /tmp/civic-main-auth-consent-pr.md
```

The PR body states the exact API, policy pair, idempotency behavior, test command/result, excluded Vote verification API, and deployment/migration notes.

- [ ] **Step 4: Review the GitHub PR head independently**

Read `gh pr diff`, check mergeability and required checks, and audit authentication, user ownership, policy trust, idempotency concurrency, JSON casing, Flyway safety, error mapping, and secret/log exposure. Fix findings on the feature branch and repeat `./gradlew clean test` before approval.

- [ ] **Step 5: Merge only a passing, current head**

```bash
consent_pr_number=$(gh pr view --json number --jq .number)
gh pr merge "$consent_pr_number" --merge --delete-branch
git switch main
git pull --ff-only
```

Expected: GitHub reports the PR merged and local `main` resolves to the merged commit.

### Task 5: Deploy one immutable image and prove the public API

**Files:**
- No repository source changes. Server-side deployment state changes are limited to the existing Main/Auth release and the exact-path edge route when authorized by the workspace allowlist.

**Interfaces:**
- Consumes: merged `origin/main` SHA and existing server-side secrets/Compose configuration.
- Produces: `main-auth` and `main-worker` on one recorded image digest, Flyway V22 applied, exact public route reachable, and rollback evidence retained.

- [ ] **Step 1: Capture pre-deployment evidence**

Record remote `main`, merged SHA, running container image IDs, Compose project/config paths, current Flyway version/checksums, health/restart/OOM state, and previous rollback image without printing secrets.

- [ ] **Step 2: Build and validate the immutable arm64 image off-server**

Build from the merged SHA using Docker Buildx with `--platform linux/arm64`, SHA tag, and OCI revision/source labels. Inspect the resulting platform and digest. If registry push is unavailable, save a checksummed image archive and verify the checksum after transfer.

- [ ] **Step 3: Validate migration and Compose cutover**

Compare production Flyway history with V1-V22, validate fully merged Compose, run V22 before cutover, and update both `main-auth` and `main-worker` to the same exact image reference. Use `docker compose up -d --no-build`; do not build on the target server.

- [ ] **Step 4: Add only the explicit edge route when needed and allowed**

Route `/api/v1/me/consent-acceptances` to Main/Auth without changing Vote-owned `/api/v1/me/*`. Validate and reload the candidate edge configuration with automatic restoration on failure. If that file is owned by a non-allowlisted repository, stop before mutation and request the required explicit repository approval.

- [ ] **Step 5: Run post-deployment smoke and rollback checks**

Verify container health/restarts/OOM, V22, discovery/JWKS, unauthenticated `401`, and an authenticated create/replay/conflict flow through the public origin using an already authorized account. Verify the rollback command and retain the previous immutable image reference. Report any missing authenticated proof explicitly instead of treating unauthenticated reachability as end-to-end completion.
