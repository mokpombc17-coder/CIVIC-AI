package ai.civic.mainauth.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;
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
                order by created_at for update skip locked limit 1
        """, (rs, rowNum) -> new Delivery(
                rs.getObject("id", UUID.class), rs.getString("event_type"), rs.getString("recipient"),
                rs.getString("payload"), rs.getInt("attempt_count")));
        if (rows.isEmpty()) return false;
        var delivery = rows.getFirst();
        jdbc.update("update notification_outbox set leased_until = now() + interval '30 seconds' where id = ?",
                delivery.id());
        try {
            JsonNode payload = json.readTree(delivery.payload());
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

    private record Delivery(UUID id, String eventType, String recipient, String payload, int attemptCount) {}
}
