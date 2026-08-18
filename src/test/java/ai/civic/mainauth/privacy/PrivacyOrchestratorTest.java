package ai.civic.mainauth.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class PrivacyOrchestratorTest extends PostgresIntegrationTest {
    @Autowired PrivacyOperationService privacy;
    @Autowired PrivacyCommandDispatcher dispatcher;
    @Autowired PrivacyResultDispatcher resultDispatcher;
    @Autowired JdbcTemplate jdbc;
    @Autowired StringRedisTemplate redis;

    @BeforeEach
    void cleanPrivacyOperations() {
        jdbc.update("delete from privacy_results");
        jdbc.update("delete from privacy_command_outbox");
        jdbc.update("delete from privacy_operations");
        redis.delete(PrivacyCommandDispatcher.RAG_COMMAND_STREAM);
        redis.delete(PrivacyResultDispatcher.RESULT_STREAM);
        redis.delete(PrivacyResultDispatcher.RESULT_DEAD_LETTER_STREAM);
    }

    @Test
    void verifiedRequestDispatchesMainAndRagAndAggregatesIdempotentResults() {
        var subject = createSubject("privacy-both@example.com");
        var operation = privacy.start("external-42", subject, Set.of("ACCOUNT", "RAG"), true);
        assertThat(jdbc.queryForObject(
                "select count(*) from privacy_command_outbox where operation_id = ?", Integer.class, operation))
                .isEqualTo(2);
        privacy.recordResult(operation, "MAIN", "COMPLETE", "aggregate-main");
        privacy.recordResult(operation, "MAIN", "COMPLETE", "aggregate-main");
        assertThat(privacy.status(operation)).isEqualTo("PARTIAL");
        privacy.recordResult(operation, "RAG", "COMPLETE", "aggregate-rag");
        assertThat(privacy.status(operation)).isEqualTo("COMPLETE");
        assertThat(jdbc.queryForObject(
                "select count(*) from privacy_results where operation_id = ?", Integer.class, operation))
                .isEqualTo(2);
    }

    @Test
    void concurrentServiceResultsAreSerializedIntoOneCompleteAggregate() throws Exception {
        var subject = createSubject("privacy-concurrent-results@example.com");
        var operation = privacy.start(
                "external-concurrent-results-42", subject, Set.of("ACCOUNT", "RAG"), true);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var main = executor.submit(() -> {
                ready.countDown();
                start.await();
                privacy.recordResult(operation, "MAIN", "COMPLETE", "aggregate-main");
                return null;
            });
            var rag = executor.submit(() -> {
                ready.countDown();
                start.await();
                privacy.recordResult(operation, "RAG", "COMPLETE", "aggregate-rag");
                return null;
            });
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            main.get(10, TimeUnit.SECONDS);
            rag.get(10, TimeUnit.SECONDS);
        }

        assertThat(privacy.status(operation)).isEqualTo("COMPLETE");
        assertThat(jdbc.queryForObject(
                "select count(*) from privacy_results where operation_id = ?", Integer.class, operation))
                .isEqualTo(2);
    }

    @Test
    void nonexistentPrivacySubjectIsRejectedBeforeAnyCommandIsQueued() {
        assertThatThrownBy(() -> privacy.start(
                "external-missing-42", UUID.randomUUID(), Set.of("ACCOUNT"), true))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not exist");
        assertThat(jdbc.queryForObject(
                "select count(*) from privacy_command_outbox", Integer.class)).isZero();
    }

    @Test
    void idempotencyEvidenceMustMatchTheOriginalSubjectAndScopes() {
        var subject = createSubject("privacy-idempotent@example.com");
        var otherSubject = createSubject("privacy-idempotent-other@example.com");
        var operation = privacy.start("external-idempotent-42", subject, Set.of("RAG"), true);

        assertThat(privacy.start("external-idempotent-42", subject, Set.of("RAG"), true))
                .isEqualTo(operation);
        assertThatThrownBy(() -> privacy.start(
                "external-idempotent-42", otherSubject, Set.of("RAG"), true))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not match");
        assertThatThrownBy(() -> privacy.start(
                "external-idempotent-42", subject, Set.of("ACCOUNT", "RAG"), true))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not match");
    }

    @Test
    void concurrentIdempotentStartsReturnOneOperationAndOneCommand() throws Exception {
        var subject = createSubject("privacy-concurrent@example.com");
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                ready.countDown();
                start.await();
                return privacy.start("external-concurrent-42", subject, Set.of("RAG"), true);
            });
            var second = executor.submit(() -> {
                ready.countDown();
                start.await();
                return privacy.start("external-concurrent-42", subject, Set.of("RAG"), true);
            });
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            assertThat(first.get(10, TimeUnit.SECONDS))
                    .isEqualTo(second.get(10, TimeUnit.SECONDS));
        }
        assertThat(jdbc.queryForObject("""
                select count(*) from privacy_operations
                where external_request_evidence_id = 'external-concurrent-42'
                """, Integer.class)).isOne();
        assertThat(jdbc.queryForObject("""
                select count(*) from privacy_command_outbox pco
                join privacy_operations po on po.id = pco.operation_id
                where po.external_request_evidence_id = 'external-concurrent-42'
                """, Integer.class)).isOne();
    }

    @Test
    void resultForAServiceThatWasNotEnqueuedIsRejected() {
        var subject = createSubject("privacy-service-match@example.com");
        var operation = privacy.start("external-service-match-42", subject, Set.of("ACCOUNT"), true);

        assertThatThrownBy(() -> privacy.recordResult(
                operation, "RAG", "COMPLETE", "misrouted-rag-result"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("was not enqueued");
        assertThat(privacy.status(operation)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject(
                "select count(*) from privacy_results where operation_id = ?", Integer.class, operation))
                .isZero();
    }

    @Test
    void workerWaitsForOffHostMainDeletionLedgerBeforeCompletingItsResult() {
        var subject = createSubject("privacy-worker@example.com");
        var operation = privacy.start("external-worker-42", subject, Set.of("ACCOUNT"), true);

        assertThat(dispatcher.dispatchMainOne()).isTrue();

        assertThat(privacy.status(operation)).isEqualTo("PENDING");
        assertThat(redis.opsForStream().size(PrivacyCommandDispatcher.RAG_COMMAND_STREAM)).isZero();
        assertThat(jdbc.queryForObject("""
                select jsonb_exists(command_payload, 'ledger_aggregate_evidence')
                from privacy_command_outbox where operation_id = ? and service_code = 'MAIN'
                """, Boolean.class, operation)).isTrue();

        assertThat(dispatcher.dispatchMainOne()).isTrue();

        var ledgerCommands = redis.opsForStream().range(
                PrivacyCommandDispatcher.RAG_COMMAND_STREAM, Range.unbounded());
        assertThat(ledgerCommands).hasSize(1);
        assertThat(ledgerCommands.getFirst().getValue())
                .containsEntry("operation_id", operation.toString())
                .containsEntry("subject_id", subject.toString())
                .containsEntry("external_request_evidence_id", "external-worker-42")
                .containsEntry("scope", "ACCOUNT_LEDGER")
                .containsEntry("aggregate_evidence", "account_anonymized=1");
        assertThat(String.valueOf(ledgerCommands.getFirst().getValue().get("deletion_version")))
                .isNotBlank();
        assertThat(String.valueOf(ledgerCommands.getFirst().getValue().get("completed_at")))
                .isNotBlank();
        assertThat(jdbc.queryForObject("""
                select count(*) from privacy_command_outbox
                where operation_id = ? and service_code = 'MAIN' and delivered_at is not null
                """, Integer.class, operation)).isOne();
        assertThat(jdbc.queryForObject("select state from users where id = ?", String.class, subject))
                .isEqualTo("DELETED");

        redis.opsForStream().add(StreamRecords.mapBacked(java.util.Map.of(
                "operation_id", operation.toString(),
                "service_code", "MAIN",
                "result_status", "COMPLETE",
                "aggregate_evidence", "account_anonymized=1"
        )).withStreamKey(PrivacyResultDispatcher.RESULT_STREAM));
        assertThat(resultDispatcher.dispatchOne()).isTrue();
        assertThat(privacy.status(operation)).isEqualTo("COMPLETE");
    }

    @Test
    void permanentMainDeletionPolicyFailureIsRecordedWithoutBlockingTheQueue() {
        var subject = jdbc.queryForObject(
                "select id from users where normalized_email = 'bootstrap@example.test'",
                UUID.class);
        var operation = privacy.start(
                "external-last-admin-42", subject, Set.of("ACCOUNT"), true);

        assertThat(dispatcher.dispatchMainOne()).isTrue();

        assertThat(privacy.status(operation)).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("""
                select aggregate_evidence from privacy_results
                where operation_id = ? and service_code = 'MAIN'
                """, String.class, operation)).isEqualTo("deleted=0,policy_blocked=1");
        assertThat(jdbc.queryForObject("""
                select count(*) from privacy_command_outbox
                where operation_id = ? and delivered_at is not null
                """, Integer.class, operation)).isOne();
        assertThat(jdbc.queryForObject(
                "select state from users where id = ?", String.class, subject)).isEqualTo("ACTIVE");
    }

    @Test
    void physicallyRemovedSubjectIsRecordedAsPermanentFailureWithoutPoisoningWorker() {
        var subject = createSubject("privacy-removed-before-worker@example.com");
        var operation = privacy.start(
                "external-removed-before-worker-42", subject, Set.of("ACCOUNT"), true);
        jdbc.update("delete from credentials where user_id = ?", subject);
        jdbc.update("delete from users where id = ?", subject);

        assertThat(dispatcher.dispatchMainOne()).isTrue();

        assertThat(privacy.status(operation)).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("""
                select aggregate_evidence from privacy_results
                where operation_id = ? and service_code = 'MAIN'
                """, String.class, operation)).isEqualTo("deleted=0,subject_missing=1");
        assertThat(jdbc.queryForObject("""
                select count(*) from privacy_command_outbox
                where operation_id = ? and delivered_at is not null
                """, Integer.class, operation)).isOne();
    }

    @Test
    void workerPublishesRagCommandAndConsumesDurableAggregateResult() {
        var subject = createSubject("privacy-rag@example.com");
        var operation = privacy.start("external-rag-42", subject, Set.of("RAG"), true);

        assertThat(dispatcher.dispatchRagOne()).isTrue();
        var commands = redis.opsForStream().range(
                PrivacyCommandDispatcher.RAG_COMMAND_STREAM, Range.unbounded());
        assertThat(commands).hasSize(1);
        assertThat(commands.getFirst().getValue())
                .containsEntry("operation_id", operation.toString())
                .containsEntry("subject_id", subject.toString())
                .containsEntry("scope", "RAG");

        redis.opsForStream().add(StreamRecords.mapBacked(java.util.Map.of(
                "operation_id", operation.toString(),
                "service_code", "RAG",
                "result_status", "COMPLETE",
                "aggregate_evidence", "queries_anonymized=2,citations_deleted=3"
        )).withStreamKey(PrivacyResultDispatcher.RESULT_STREAM));
        assertThat(resultDispatcher.dispatchOne()).isTrue();

        assertThat(privacy.status(operation)).isEqualTo("COMPLETE");
        assertThat(redis.opsForStream().size(PrivacyResultDispatcher.RESULT_STREAM)).isZero();
    }

    @Test
    void permanentlyInvalidResultIsDeadLetteredBeforeTheNextResultIsConsumed() {
        var subject = createSubject("privacy-result-poison@example.com");
        var operation = privacy.start("external-result-poison-42", subject, Set.of("RAG"), true);
        redis.opsForStream().add(StreamRecords.mapBacked(java.util.Map.of(
                "operation_id", "not-a-uuid",
                "service_code", "RAG",
                "result_status", "COMPLETE",
                "aggregate_evidence", "invalid=1"
        )).withStreamKey(PrivacyResultDispatcher.RESULT_STREAM));
        redis.opsForStream().add(StreamRecords.mapBacked(java.util.Map.of(
                "operation_id", operation.toString(),
                "service_code", "RAG",
                "result_status", "COMPLETE",
                "aggregate_evidence", "queries_anonymized=1"
        )).withStreamKey(PrivacyResultDispatcher.RESULT_STREAM));

        assertThat(resultDispatcher.dispatchOne()).isTrue();
        assertThat(redis.opsForStream().size(PrivacyResultDispatcher.RESULT_DEAD_LETTER_STREAM))
                .isOne();
        assertThat(redis.opsForStream().size(PrivacyResultDispatcher.RESULT_STREAM)).isOne();
        assertThat(resultDispatcher.dispatchOne()).isTrue();

        assertThat(privacy.status(operation)).isEqualTo("COMPLETE");
        assertThat(redis.opsForStream().size(PrivacyResultDispatcher.RESULT_STREAM)).isZero();
    }

    @Test
    void resultWithoutAggregateEvidenceIsDeadLetteredAndCannotCompleteTheOperation() {
        var subject = createSubject("privacy-result-no-evidence@example.com");
        var operation = privacy.start("external-result-no-evidence-42", subject, Set.of("RAG"), true);
        redis.opsForStream().add(StreamRecords.mapBacked(java.util.Map.of(
                "operation_id", operation.toString(),
                "service_code", "RAG",
                "result_status", "COMPLETE"
        )).withStreamKey(PrivacyResultDispatcher.RESULT_STREAM));

        assertThat(resultDispatcher.dispatchOne()).isTrue();

        assertThat(privacy.status(operation)).isEqualTo("PENDING");
        assertThat(redis.opsForStream().size(PrivacyResultDispatcher.RESULT_DEAD_LETTER_STREAM))
                .isOne();
        assertThat(redis.opsForStream().size(PrivacyResultDispatcher.RESULT_STREAM)).isZero();
    }

    private UUID createSubject(String email) {
        var subject = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'hash')", subject);
        return subject;
    }
}
