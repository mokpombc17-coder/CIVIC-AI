package ai.civic.mainauth.audit;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class AuditInsertOnlyRepository {
    private final JdbcTemplate jdbc;

    public AuditInsertOnlyRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void insert(UUID id, String type, UUID actor, UUID subject, String payload, Instant occurredAt) {
        jdbc.execute("set local role civic_audit_insert_only");
        var restricted = jdbc.queryForObject(
                "select current_role = 'civic_audit_insert_only'", Boolean.class);
        if (!Boolean.TRUE.equals(restricted)) {
            throw new IllegalStateException("Audit insert-only role was not assumed");
        }
        jdbc.update("""
                insert into audit_events(id, event_type, actor_user_id, subject_user_id, payload, occurred_at)
                values (?, ?, ?, ?, ?::jsonb, ?) on conflict(id) do nothing
                """, id, type, actor, subject, payload, Timestamp.from(occurredAt));
    }
}
