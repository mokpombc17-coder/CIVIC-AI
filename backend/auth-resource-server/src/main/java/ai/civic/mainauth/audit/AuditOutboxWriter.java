package ai.civic.mainauth.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AuditOutboxWriter {
    private static final Set<String> SENSITIVE_TERMS = Set.of(
            "password", "cookie", "token", "code", "answer", "smtp", "payload");
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public AuditOutboxWriter(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void append(String eventType, UUID actor, UUID subject, Map<String, ?> data) {
        rejectSensitive(data);
        try {
            jdbc.update("""
                    insert into audit_outbox(event_type, actor_user_id, subject_user_id, payload)
                    values (?, ?, ?, ?::jsonb)
                    """, eventType, actor, subject, json.writeValueAsString(data));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not append audit outbox", exception);
        }
    }

    private void rejectSensitive(Object value) {
        if (value instanceof Map<?, ?> map) {
            for (var entry : map.entrySet()) {
                var key = entry.getKey().toString().toLowerCase(java.util.Locale.ROOT);
                if (SENSITIVE_TERMS.stream().anyMatch(key::contains)) {
                    throw new IllegalArgumentException("Sensitive audit field is forbidden: " + entry.getKey());
                }
                rejectSensitive(entry.getValue());
            }
        } else if (value instanceof Iterable<?> values) {
            values.forEach(this::rejectSensitive);
        }
    }
}
