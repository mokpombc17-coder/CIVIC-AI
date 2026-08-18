package ai.civic.mainauth.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(name = "civic.runtime.mode", havingValue = "worker")
public class SignupMailDispatcher {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final VerificationCodeProtector protector;
    private final SmtpNotificationService smtp;
    private final NotificationPolicy policy = new NotificationPolicy();

    public SignupMailDispatcher(
            JdbcTemplate jdbc, ObjectMapper json, VerificationCodeProtector protector,
            SmtpNotificationService smtp) {
        this.jdbc = jdbc;
        this.json = json;
        this.protector = protector;
        this.smtp = smtp;
    }

    @Transactional
    public boolean dispatchOne() {
        var rows = jdbc.query("""
                select id, event_type, recipient, payload::text, attempt_count
                from notification_outbox
                where event_type in (
                    'SIGNUP_EMAIL_VERIFICATION', 'PASSWORD_RESET', 'TWO_FACTOR',
                    'TWO_FACTOR_ENABLE', 'REACTIVATION'
                  )
                  and delivered_at is null and available_at <= now()
                  and ((event_type = 'SIGNUP_EMAIL_VERIFICATION' and attempt_count < 3)
                    or (event_type <> 'SIGNUP_EMAIL_VERIFICATION' and attempt_count = 0))
                  and (leased_until is null or leased_until < now())
                order by created_at limit 1
        """, (rs, rowNum) -> new Delivery(
                rs.getObject("id", UUID.class), rs.getString("event_type"), rs.getString("recipient"),
                rs.getString("payload"), rs.getInt("attempt_count")));
        if (rows.isEmpty()) return false;
        var candidate = rows.getFirst();
        JsonNode payload = null;
        try {
            payload = json.readTree(candidate.payload());
        } catch (Exception ignored) {
            // Malformed challenge payloads are retired after locking the outbox row below.
        }
        var currentChallenge = payload != null && isCurrentChallenge(payload, candidate);
        var locked = jdbc.query("""
                select id, event_type, recipient, payload::text, attempt_count
                from notification_outbox
                where id = ? and delivered_at is null and available_at <= now()
                  and ((event_type = 'SIGNUP_EMAIL_VERIFICATION' and attempt_count < 3)
                    or (event_type <> 'SIGNUP_EMAIL_VERIFICATION' and attempt_count = 0))
                  and (leased_until is null or leased_until < now())
                for update
                """, (rs, rowNum) -> new Delivery(
                rs.getObject("id", UUID.class), rs.getString("event_type"),
                rs.getString("recipient"), rs.getString("payload"), rs.getInt("attempt_count")),
                candidate.id());
        if (locked.isEmpty()) return true;
        var delivery = locked.getFirst();
        jdbc.update("update notification_outbox set leased_until = now() + interval '30 seconds' where id = ?",
                delivery.id());
        if (!currentChallenge) {
            jdbc.update("""
                    update notification_outbox set delivered_at = now(), leased_until = null,
                        last_error_code = 'CHALLENGE_STALE' where id = ?
                    """, delivery.id());
            return true;
        }
        try {
            var code = protector.reveal(payload.path("protected_code").asText());
            if ("SIGNUP_EMAIL_VERIFICATION".equals(delivery.eventType())) {
                smtp.sendSignupVerification(delivery.recipient(), code);
            } else {
                smtp.sendChallenge(delivery.recipient(), code, delivery.eventType());
            }
            jdbc.update("""
                    update notification_outbox set delivered_at = now(), leased_until = null,
                        attempt_count = attempt_count + 1 where id = ?
                    """, delivery.id());
        } catch (Exception exception) {
            var attempt = delivery.attemptCount() + 1;
            var next = policy.automaticRetryAllowed(delivery.eventType())
                    ? Instant.now().plus(policy.retryDelay(attempt)) : Instant.now();
            jdbc.update("""
                    update notification_outbox set leased_until = null, attempt_count = ?,
                        available_at = ?, last_error_code = 'SMTP_DELIVERY_FAILED' where id = ?
                    """, attempt, Timestamp.from(next), delivery.id());
        }
        return true;
    }

    private boolean isCurrentChallenge(JsonNode payload, Delivery delivery) {
        UUID challengeId;
        try {
            challengeId = UUID.fromString(payload.path("challenge_id").asText());
        } catch (IllegalArgumentException exception) {
            return false;
        }
        return !jdbc.query("""
                select id from auth_challenges
                where id = ? and purpose = ?
                  and lower(btrim(target_identity)) = lower(btrim(?))
                  and consumed_at is null and expires_at > now()
                for update
                """, (rs, rowNum) -> rs.getObject("id", UUID.class),
                challengeId, delivery.eventType(), delivery.recipient()).isEmpty();
    }

    private record Delivery(UUID id, String eventType, String recipient, String payload, int attemptCount) {}
}
