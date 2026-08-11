package ai.civic.mainauth.audit;

import static org.assertj.core.api.Assertions.assertThat;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class AuditWorkerBoundaryTest extends PostgresIntegrationTest {
    @Autowired JdbcTemplate jdbc;

    @Test
    void auditRoleCanOnlyInsertAuditEvents() {
        assertThat(privilege("audit_events", "INSERT")).isTrue();
        assertThat(privilege("audit_events", "SELECT")).isFalse();
        assertThat(privilege("audit_events", "UPDATE")).isFalse();
        assertThat(privilege("audit_events", "DELETE")).isFalse();
        assertThat(privilege("users", "SELECT")).isFalse();
        assertThat(privilege("users", "INSERT")).isFalse();
    }

    private boolean privilege(String table, String privilege) {
        return jdbc.queryForObject(
                "select has_table_privilege('civic_audit_insert_only', ?, ?)",
                Boolean.class, table, privilege);
    }
}
