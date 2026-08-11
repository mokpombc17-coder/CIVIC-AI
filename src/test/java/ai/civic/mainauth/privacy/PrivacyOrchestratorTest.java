package ai.civic.mainauth.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class PrivacyOrchestratorTest extends PostgresIntegrationTest {
    @Autowired PrivacyOperationService privacy;
    @Autowired JdbcTemplate jdbc;

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
}
