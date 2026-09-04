package ai.civic.mainauth.consent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class ConsentAcceptanceServiceTest extends PostgresIntegrationTest {
    private static final UUID ROUND_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final Instant CLIENT_CLICKED_AT =
            Instant.parse("2026-09-04T03:10:20.123Z");
    private static final String REQUEST_SHA256 =
            "932b278432fcda3a0dc2e7323ff6d878d1c188c390748f302dca18deaf11d715";

    @Autowired ConsentAcceptanceService service;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void resetReceiptsAndPolicy() {
        jdbc.update("delete from consent_acceptances");
        jdbc.update("""
                update consent_acceptance_policies
                set active = true, deactivated_at = null
                where document_code = 'SENSITIVE_INFORMATION_CONSENT'
                  and document_version = '2026-09-04'
                """);
    }

    @Test
    void recordsTheAuthenticatedUserAndExactConsentEvidence() {
        var userId = createUser();
        var idempotencyKey = UUID.randomUUID();

        var receipt = service.accept(userId, idempotencyKey, validRequest());

        var row = jdbc.queryForMap("""
                select user_id, document_code, document_version, round_id,
                       client_clicked_at, accepted_at, idempotency_key, request_sha256
                from consent_acceptances
                where consent_receipt_id = ?
                """, receipt.consentReceiptId());
        assertThat(row.get("user_id")).isEqualTo(userId);
        assertThat(row.get("document_code")).isEqualTo("SENSITIVE_INFORMATION_CONSENT");
        assertThat(row.get("document_version")).isEqualTo("2026-09-04");
        assertThat(row.get("round_id")).isEqualTo(ROUND_ID);
        assertThat(((java.sql.Timestamp) row.get("client_clicked_at")).toInstant())
                .isEqualTo(CLIENT_CLICKED_AT);
        assertThat(((java.sql.Timestamp) row.get("accepted_at")).toInstant())
                .isEqualTo(receipt.acceptedAt());
        assertThat(row.get("idempotency_key")).isEqualTo(idempotencyKey);
        assertThat(row.get("request_sha256")).isEqualTo(REQUEST_SHA256);
    }

    @Test
    void matchingRetryReturnsTheOriginalReceiptWithoutAnotherRow() {
        var userId = createUser();
        var idempotencyKey = UUID.randomUUID();

        var first = service.accept(userId, idempotencyKey, validRequest());
        var replay = service.accept(userId, idempotencyKey, validRequest());

        assertThat(replay).isEqualTo(first);
        assertThat(receiptCount(userId)).isOne();
    }

    @Test
    void changedRequestWithTheSameUserKeyIsRejected() {
        var userId = createUser();
        var idempotencyKey = UUID.randomUUID();
        service.accept(userId, idempotencyKey, validRequest());
        var changed = new ConsentAcceptanceService.AcceptanceRequest(
                "SENSITIVE_INFORMATION_CONSENT", "2026-09-04",
                UUID.fromString("00000000-0000-0000-0000-000000000099"),
                CLIENT_CLICKED_AT);

        assertThatThrownBy(() -> service.accept(userId, idempotencyKey, changed))
                .isInstanceOf(ConsentAcceptanceConflictException.class)
                .hasMessage("Idempotency-Key was already used for a different consent request");
        assertThat(receiptCount(userId)).isOne();
    }

    @Test
    void changedDocumentCodeWithTheSameUserKeyIsConflictEvenWhenUnknown() {
        var userId = createUser();
        var idempotencyKey = UUID.randomUUID();
        service.accept(userId, idempotencyKey, validRequest());
        var changed = new ConsentAcceptanceService.AcceptanceRequest(
                "OTHER_CONSENT", "2026-09-04", ROUND_ID, CLIENT_CLICKED_AT);

        assertConflict(userId, idempotencyKey, changed);
    }

    @Test
    void changedDocumentVersionWithTheSameUserKeyIsConflictEvenWhenUnknown() {
        var userId = createUser();
        var idempotencyKey = UUID.randomUUID();
        service.accept(userId, idempotencyKey, validRequest());
        var changed = new ConsentAcceptanceService.AcceptanceRequest(
                "SENSITIVE_INFORMATION_CONSENT", "2026-09-05", ROUND_ID, CLIENT_CLICKED_AT);

        assertConflict(userId, idempotencyKey, changed);
    }

    @Test
    void changedClientTimeWithTheSameUserKeyIsRejected() {
        var userId = createUser();
        var idempotencyKey = UUID.randomUUID();
        service.accept(userId, idempotencyKey, validRequest());
        var changed = new ConsentAcceptanceService.AcceptanceRequest(
                "SENSITIVE_INFORMATION_CONSENT", "2026-09-04", ROUND_ID,
                CLIENT_CLICKED_AT.plusMillis(1));

        assertConflict(userId, idempotencyKey, changed);
    }

    @Test
    void matchingRetryReturnsTheOriginalReceiptAfterPolicyDeactivation() {
        var userId = createUser();
        var idempotencyKey = UUID.randomUUID();
        var first = service.accept(userId, idempotencyKey, validRequest());
        jdbc.update("""
                update consent_acceptance_policies
                set active = false, deactivated_at = now()
                where document_code = 'SENSITIVE_INFORMATION_CONSENT'
                  and document_version = '2026-09-04'
                """);

        assertThat(service.accept(userId, idempotencyKey, validRequest())).isEqualTo(first);
        assertThat(receiptCount(userId)).isOne();
    }

    @Test
    void unknownPolicyPairIsRejectedWithoutPersistence() {
        var userId = createUser();
        var request = new ConsentAcceptanceService.AcceptanceRequest(
                "SENSITIVE_INFORMATION_CONSENT", "2026-09-05", ROUND_ID, CLIENT_CLICKED_AT);

        assertThatThrownBy(() -> service.accept(userId, UUID.randomUUID(), request))
                .isInstanceOf(ConsentAcceptanceValidationException.class)
                .hasMessage("Consent document code and version are not active");
        assertThat(receiptCount(userId)).isZero();
    }

    @Test
    void inactivePolicyPairIsRejectedWithoutPersistence() {
        var userId = createUser();
        jdbc.update("""
                update consent_acceptance_policies
                set active = false, deactivated_at = now()
                where document_code = 'SENSITIVE_INFORMATION_CONSENT'
                  and document_version = '2026-09-04'
                """);

        assertThatThrownBy(() -> service.accept(userId, UUID.randomUUID(), validRequest()))
                .isInstanceOf(ConsentAcceptanceValidationException.class)
                .hasMessage("Consent document code and version are not active");
        assertThat(receiptCount(userId)).isZero();
    }

    @Test
    void identicalIdempotencyKeysAreIndependentBetweenUsers() {
        var firstUser = createUser();
        var secondUser = createUser();
        var idempotencyKey = UUID.randomUUID();

        var first = service.accept(firstUser, idempotencyKey, validRequest());
        var second = service.accept(secondUser, idempotencyKey, validRequest());

        assertThat(second.consentReceiptId()).isNotEqualTo(first.consentReceiptId());
        assertThat(receiptCount(firstUser)).isOne();
        assertThat(receiptCount(secondUser)).isOne();
    }

    @Test
    void concurrentMatchingRetriesReturnOneReceipt() throws Exception {
        var userId = createUser();
        var idempotencyKey = UUID.randomUUID();
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                ready.countDown();
                start.await();
                return service.accept(userId, idempotencyKey, validRequest());
            });
            var second = executor.submit(() -> {
                ready.countDown();
                start.await();
                return service.accept(userId, idempotencyKey, validRequest());
            });
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            assertThat(first.get(10, TimeUnit.SECONDS))
                    .isEqualTo(second.get(10, TimeUnit.SECONDS));
        }
        assertThat(receiptCount(userId)).isOne();
    }

    @Test
    void concurrentDifferentRequestsWithTheSameUserKeyCreateOneAndConflictOne()
            throws Exception {
        var userId = createUser();
        var idempotencyKey = UUID.randomUUID();
        var changed = new ConsentAcceptanceService.AcceptanceRequest(
                "SENSITIVE_INFORMATION_CONSENT", "2026-09-04",
                UUID.fromString("00000000-0000-0000-0000-000000000099"),
                CLIENT_CLICKED_AT);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                ready.countDown();
                start.await();
                return service.accept(userId, idempotencyKey, validRequest());
            });
            var second = executor.submit(() -> {
                ready.countDown();
                start.await();
                return service.accept(userId, idempotencyKey, changed);
            });
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            var firstFailure = executionFailure(first);
            var secondFailure = executionFailure(second);
            assertThat(java.util.stream.Stream.of(firstFailure, secondFailure)
                            .filter(ConsentAcceptanceConflictException.class::isInstance)
                            .count())
                    .isOne();
            assertThat(java.util.stream.Stream.of(firstFailure, secondFailure)
                            .filter(java.util.Objects::isNull)
                            .count())
                    .isOne();
        }
        assertThat(receiptCount(userId)).isOne();
    }

    private ConsentAcceptanceService.AcceptanceRequest validRequest() {
        return new ConsentAcceptanceService.AcceptanceRequest(
                "SENSITIVE_INFORMATION_CONSENT", "2026-09-04", ROUND_ID, CLIENT_CLICKED_AT);
    }

    private UUID createUser() {
        var email = "consent-" + UUID.randomUUID() + "@example.test";
        return jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now())
                returning id
                """, UUID.class, email, email);
    }

    private int receiptCount(UUID userId) {
        return jdbc.queryForObject(
                "select count(*) from consent_acceptances where user_id = ?",
                Integer.class, userId);
    }

    private void assertConflict(
            UUID userId,
            UUID idempotencyKey,
            ConsentAcceptanceService.AcceptanceRequest changed) {
        assertThatThrownBy(() -> service.accept(userId, idempotencyKey, changed))
                .isInstanceOf(ConsentAcceptanceConflictException.class)
                .hasMessage("Idempotency-Key was already used for a different consent request");
        assertThat(receiptCount(userId)).isOne();
    }

    private Throwable executionFailure(java.util.concurrent.Future<?> future) throws Exception {
        try {
            future.get(10, TimeUnit.SECONDS);
            return null;
        } catch (ExecutionException exception) {
            return exception.getCause();
        }
    }
}
