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
        assertThat(jdbc.queryForObject(
                "select pg_has_role(current_user, 'civic_audit_insert_only', 'MEMBER')",
                Boolean.class)).isTrue();
        assertThat(privilege("audit_events", "INSERT")).isTrue();
        assertThat(privilege("audit_events", "SELECT")).isFalse();
        assertThat(columnPrivilege("audit_events", "id", "SELECT")).isTrue();
        assertThat(columnPrivilege("audit_events", "payload", "SELECT")).isFalse();
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

    private boolean columnPrivilege(String table, String column, String privilege) {
        return jdbc.queryForObject(
                "select has_column_privilege('civic_audit_insert_only', ?, ?, ?)",
                Boolean.class, table, column, privilege);
    }
}
