package ai.civic.mainauth.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class PrivacyOrchestratorTest extends PostgresIntegrationTest {
    @Autowired PrivacyOperationService privacy;
    @Autowired PrivacyCommandDispatcher dispatcher;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void cleanPrivacyOperations() {
        jdbc.update("delete from privacy_results");
        jdbc.update("delete from privacy_command_outbox");
        jdbc.update("delete from privacy_operations");
    }

    @Test
    void verifiedRequestDispatchesMainAndRagAndAggregatesIdempotentResults() {
        var subject = UUID.randomUUID();
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
    void workerConsumesMainDeletionCommandAndRecordsItsResult() {
        var subject = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values ('privacy-worker@example.com', 'privacy-worker@example.com',
                        'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'hash')", subject);
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
}
