package ai.civic.mainauth.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class AppendOnlyAuditTest extends PostgresIntegrationTest {
    @Autowired AuditOutboxWriter writer;
    @Autowired AuditConsumer consumer;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void cleanAuditData() {
        jdbc.execute("truncate table audit_events, audit_outbox");
    }

    @Test
    void businessWriterCreatesOnlyOutboxAndWorkerCopiesIdempotently() {
        writer.append("PERMISSION_CHANGED", null, null, Map.of("permission", "RAG_ADMIN"));
        assertThat(jdbc.queryForObject("select count(*) from audit_outbox", Integer.class)).isOne();
        assertThat(jdbc.queryForObject("select count(*) from audit_events", Integer.class)).isZero();
        assertThat(consumer.consumeOne()).isTrue();
        assertThat(consumer.consumeOne()).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from audit_events", Integer.class)).isOne();
    }

    @Test
    void auditRowsCannotBeUpdatedOrDeletedAndSensitiveFieldsAreRejected() {
        writer.append("SAFE", null, null, Map.of("result", "ok"));
        consumer.consumeOne();
        assertThatThrownBy(() -> jdbc.update("update audit_events set event_type = 'CHANGED'"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("delete from audit_events"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> writer.append("UNSAFE", null, null, Map.of("password", "secret")))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
