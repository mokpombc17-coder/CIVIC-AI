package ai.civic.mainauth.worker;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(name = "civic.runtime.mode", havingValue = "worker")
public class AccountStateDispatcher {
    static final String STREAM = "civic.account-state.v1";
    private final JdbcTemplate jdbc;
    private final StringRedisTemplate redis;

    public AccountStateDispatcher(JdbcTemplate jdbc, StringRedisTemplate redis) {
        this.jdbc = jdbc;
        this.redis = redis;
    }

    @Transactional
    public boolean dispatchOne() {
        var rows = jdbc.query("""
                select id, user_id, account_state_version,
                       coalesce(event_payload->>'state',
                           case state when 'DEACTIVATED' then 'INACTIVE' else state end) as state,
                       coalesce(event_payload->>'at', created_at::text) as occurred_at,
                       event_payload::text as payload
                from account_state_outbox
                where delivered_at is null and available_at <= now()
                  and (leased_until is null or leased_until < now())
                order by created_at for update skip locked limit 1
                """, (rs, rowNum) -> new PendingEvent(
                rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getLong("account_state_version"), rs.getString("state"),
                rs.getString("occurred_at"), rs.getString("payload")));
        if (rows.isEmpty()) return false;
        var event = rows.getFirst();
        jdbc.update("""
                update account_state_outbox set leased_until = now() + interval '30 seconds'
                where id = ? and delivered_at is null
                """, event.id());
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("event_id", event.id().toString());
        fields.put("subject_id", event.subjectId().toString());
        fields.put("account_state_version", Long.toString(event.version()));
        fields.put("state", event.state());
        fields.put("occurred_at", event.occurredAt());
        fields.put("payload", event.payload());
        redis.opsForStream().add(StreamRecords.mapBacked(fields).withStreamKey(STREAM));
        jdbc.update("""
                update account_state_outbox set delivered_at = now(), leased_until = null,
                    attempt_count = attempt_count + 1 where id = ?
                """, event.id());
        return true;
    }

    private record PendingEvent(
            UUID id, UUID subjectId, long version, String state, String occurredAt, String payload) {}
}
