package ai.civic.mainauth.audit;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AuditInsertOnlyRepository {
    private final JdbcTemplate jdbc;

    public AuditInsertOnlyRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(UUID id, String type, UUID actor, UUID subject, String payload, Instant occurredAt) {
        jdbc.update("""
                insert into audit_events(id, event_type, actor_user_id, subject_user_id, payload, occurred_at)
                values (?, ?, ?, ?, ?::jsonb, ?) on conflict(id) do nothing
                """, id, type, actor, subject, payload, Timestamp.from(occurredAt));
    }
}
