package ai.civic.mainauth.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.util.Set;
import java.util.UUID;
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
    void nonexistentPrivacySubjectIsRejectedBeforeAnyCommandIsQueued() {
        assertThatThrownBy(() -> privacy.start(
                "external-missing-42", UUID.randomUUID(), Set.of("ACCOUNT"), true))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not exist");
        assertThat(jdbc.queryForObject(
                "select count(*) from privacy_command_outbox", Integer.class)).isZero();
    }

    @Test
    void workerConsumesMainDeletionCommandAndRecordsItsResult() {
        var subject = createSubject("privacy-worker@example.com");
        var operation = privacy.start("external-worker-42", subject, Set.of("ACCOUNT"), true);

        assertThat(dispatcher.dispatchMainOne()).isTrue();

        assertThat(privacy.status(operation)).isEqualTo("COMPLETE");
        assertThat(jdbc.queryForObject("""
                select count(*) from privacy_command_outbox
                where operation_id = ? and service_code = 'MAIN' and delivered_at is not null
                """, Integer.class, operation)).isOne();
        assertThat(jdbc.queryForObject("select state from users where id = ?", String.class, subject))
                .isEqualTo("DELETED");
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

    private UUID createSubject(String email) {
        var subject = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'hash')", subject);
        return subject;
    }
}
