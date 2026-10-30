# Survey Consent Acceptance Design

## Goal

Add one authenticated Main/Auth API that records a logged-in user's survey-sensitive-information consent and returns a durable consent receipt. The persisted record must be sufficient for a separately specified Vote integration to verify the receipt's owner, survey round, and policy version later.

## Scope

This change includes:

- `POST /api/v1/me/consent-acceptances` in `civic-main-auth`.
- A database-managed allowlist of accepted document code and version pairs.
- A receipt ledger containing the authenticated user, document code and version, survey round, client click time, server acceptance time, idempotency key, and request fingerprint.
- Idempotent replay and conflicting-key detection.
- Migration, controller, persistence, concurrency, authentication, browser-boundary, and JSON-contract tests.

This change does not include:

- A Vote-to-Auth receipt verification endpoint or its service-authentication contract.
- Vote Server request DTO changes.
- Frontend calls or UI changes.
- New legal-document content, text, hashes, or paths not supplied in the request.

## Public API Contract

### Request

```http
POST /api/v1/me/consent-acceptances
Idempotency-Key: <canonical UUID>
X-CSRF-Token: <access-token-bound CSRF value>
Content-Type: application/json
Cookie: civic_ai_access_token=<access JWT>
```

```json
{
  "documentCode": "SENSITIVE_INFORMATION_CONSENT",
  "documentVersion": "2026-09-04",
  "roundId": "00000000-0000-0000-0000-000000000001",
  "clientClickedAt": "2026-09-04T03:10:20.123Z"
}
```

The request field names are explicitly annotated as camelCase because Main/Auth otherwise applies a global snake_case Jackson policy.

The API derives `user_id` only from the verified access token's `sub`. It never accepts a user identifier from the request. The token must identify an active current account. The mutation must also pass Main/Auth's existing CSRF, exact-origin, same-origin fetch-site, JSON content-type, and public-Authorization rejection rules.

`Idempotency-Key` must be a lowercase canonical UUID string. `roundId` must be a UUID and `clientClickedAt` must be a JSON timestamp parseable as `Instant`. No additional past/future time-window rule is introduced because none was specified.

### Response

Both a first successful insert and a matching idempotent replay return `201 Created` with exactly:

```json
{
  "consentReceiptId": "00000000-0000-0000-0000-000000000002",
  "acceptedAt": "2026-09-04T03:10:21.456Z"
}
```

The response field names are explicitly annotated as camelCase. A replay returns the original `consentReceiptId` and original server-generated `acceptedAt`; it does not add a `replayed` field.

### Rejections

- Missing or invalid login cookie: `401` through the existing authentication handler.
- Missing/malformed header, malformed body, inactive/unknown document pair, or failed browser/CSRF boundary: `400` using the existing Problem Details format.
- Reuse of the same user's idempotency key for a different canonical request: `409` using the existing Problem Details format.
- No endpoint reveals whether another user used the same idempotency key or owns a receipt.

## Policy Allowlist

Migration `V22__survey_consent_acceptance_receipts.sql` creates `consent_acceptance_policies` with a composite primary key of `document_code` and `document_version`, plus an `active` flag and timestamps. The migration inserts exactly one active pair:

- `SENSITIVE_INFORMATION_CONSENT`
- `2026-09-04`

The service accepts only active rows. Supporting another pair requires an explicit migration that inserts or activates that exact pair. This avoids trusting policy identifiers supplied only by the client.

This table is an API allowlist, not a substitute for a legal-document registry. It therefore does not invent a document body, hash, or path.

## Receipt Ledger

The same migration creates `consent_acceptances` with:

- `consent_receipt_id uuid primary key`
- `user_id uuid not null` referencing `users(id)` with delete restricted
- `document_code varchar(64) not null`
- `document_version varchar(100) not null`
- `round_id uuid not null`
- `client_clicked_at timestamptz not null`
- `accepted_at timestamptz not null`
- `idempotency_key uuid not null`
- `request_sha256 char(64) not null`
- `created_at timestamptz not null`
- A composite foreign key from document code/version to the policy allowlist
- A unique constraint on `(user_id, idempotency_key)`

The application exposes no update or delete operation for receipts. It does not reuse the signup-oriented `consent_evidence` table because that table's `user_id + document_code + document_version` uniqueness cannot represent round-bound receipts and has a different lifecycle.

## Idempotency and Concurrency

The canonical request fingerprint is lowercase SHA-256 over this UTF-8 sequence:

```text
documentCode + "\n" +
documentVersion + "\n" +
roundId.toString() + "\n" +
clientClickedAt.toString()
```

UUIDs and `Instant` are parsed before fingerprinting, so semantically equal timestamp representations resolve to the same canonical `Instant.toString()` value. The accepted-at value and receipt ID are not part of the fingerprint.

Within one database transaction, the service:

1. Verifies the requested document pair is active.
2. Generates a receipt UUID and captures `acceptedAt` from a UTC `Clock`.
3. Executes `INSERT ... ON CONFLICT (user_id, idempotency_key) DO NOTHING`.
4. Returns the generated receipt when the insert wins.
5. Otherwise reloads the existing row for that user and key.
6. Returns the existing receipt when fingerprints match.
7. Throws a conflict when fingerprints differ.

The database unique constraint is the concurrency authority. A different idempotency key is a different logical operation and may create another receipt even if its body matches an earlier request; no unstated natural-key deduplication is added.

## Components

- `ConsentAcceptanceController`: HTTP contract, access-cookie authentication, CSRF/browser mutation boundary, canonical idempotency-key parsing, and exact camelCase DTOs.
- `ConsentAcceptanceService`: policy validation, canonical fingerprinting, transactional insert/replay/conflict behavior, and server time generation.
- `ConsentAcceptanceConflictException`: maps conflicting idempotency reuse to `409`.
- `ConsentAcceptanceValidationException`: maps unsupported policy pairs and malformed domain inputs to `400` without overloading signup validation semantics.
- `ApiExceptionHandler`: adds the two consent-specific error mappings while retaining the existing Problem Details shape.
- Flyway `V22`: creates and seeds the policy allowlist and receipt ledger.

## Tests

Implementation follows red-green-refactor. Tests must demonstrate:

- V22 creates both tables, the composite policy foreign key, and the user-scoped idempotency uniqueness, and seeds only the supplied active pair.
- An active logged-in user can create a receipt and the database stores the access-token subject, exact round and policy identifiers, exact client instant, server instant, key, and fingerprint.
- A matching retry returns the original receipt and accepted time without adding a row.
- Concurrent matching retries return one receipt and leave one row.
- The same user's key with a changed document/version, round, or client instant returns `409`.
- The same idempotency UUID may be used independently by two users.
- Unsupported document code/version pairs return `400` and persist nothing.
- Missing/invalid authentication and invalid CSRF/origin/fetch-site boundaries are rejected.
- Request and response JSON remain camelCase despite the global snake_case policy, and the successful body contains exactly the two specified fields.
- The full Gradle test suite remains green.

## Delivery

Repository delivery follows the user's explicit PR request: preserve unrelated `.DS_Store`, publish the feature branch, complete an independent PR review, and merge only after the reviewed head passes the full suite.
