package ai.civic.mainauth.audit;

import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditConsumer {
    private final JdbcTemplate jdbc;
    private final AuditInsertOnlyRepository sink;

    public AuditConsumer(JdbcTemplate jdbc, AuditInsertOnlyRepository sink) {
        this.jdbc = jdbc;
        this.sink = sink;
    }

    @Transactional
    public boolean consumeOne() {
        var rows = jdbc.query("""
                select id, event_type, actor_user_id, subject_user_id, payload::text, created_at
                from audit_outbox where delivered_at is null
                and (leased_until is null or leased_until < now())
                order by created_at for update skip locked limit 1
                """, (rs, rowNum) -> new Pending(
                rs.getObject("id", UUID.class), rs.getString("event_type"),
                rs.getObject("actor_user_id", UUID.class), rs.getObject("subject_user_id", UUID.class),
                rs.getString("payload"), rs.getTimestamp("created_at").toInstant()));
        if (rows.isEmpty()) return false;
        var event = rows.getFirst();
        sink.insert(event.id(), event.type(), event.actor(), event.subject(), event.payload(), event.occurredAt());
        jdbc.update("update audit_outbox set delivered_at = now(), leased_until = null where id = ?", event.id());
        return true;
    }

    private record Pending(
            UUID id, String type, UUID actor, UUID subject, String payload, Instant occurredAt) {}
}
