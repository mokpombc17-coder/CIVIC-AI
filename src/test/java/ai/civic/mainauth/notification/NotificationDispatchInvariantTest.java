package ai.civic.mainauth.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class NotificationDispatchInvariantTest extends PostgresIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;

    private VerificationCodeProtector protector;
    private SmtpNotificationService smtp;
    private SignupMailDispatcher dispatcher;
    private TransactionTemplate transactions;

    @BeforeEach
    void setUp() {
        jdbc.update("delete from notification_outbox");
        jdbc.update("delete from auth_challenges");
        protector = new VerificationCodeProtector("notification-dispatch-test-key");
        smtp = mock(SmtpNotificationService.class);
        dispatcher = new SignupMailDispatcher(jdbc, new ObjectMapper(), protector, smtp);
        transactions = new TransactionTemplate(transactionManager);
    }

    @Test
    void expiredChallengeNotificationIsRetiredWithoutRevealingOrSendingItsCode() {
        var challengeId = insertChallenge("PASSWORD_RESET", "expired@example.com", true, false);
        insertNotification(challengeId, "PASSWORD_RESET", "expired@example.com", "123456");
        corruptProtectedCode();

        assertThat(dispatchOne()).isTrue();

        verifyNoInteractions(smtp);
        assertThat(retiredCode()).isEqualTo("CHALLENGE_STALE");
    }

    @Test
    void consumedChallengeNotificationIsRetiredWithoutSendingItsCode() {
        var challengeId = insertChallenge("REACTIVATION", "consumed@example.com", false, true);
        insertNotification(challengeId, "REACTIVATION", "consumed@example.com", "123456");
        corruptProtectedCode();

        assertThat(dispatchOne()).isTrue();

        verifyNoInteractions(smtp);
        assertThat(retiredCode()).isEqualTo("CHALLENGE_STALE");
    }

    @Test
    void currentMatchingChallengeIsLockedAndDelivered() {
        var challengeId = insertChallenge("PASSWORD_RESET", "valid@example.com", false, false);
        insertNotification(challengeId, "PASSWORD_RESET", "valid@example.com", "654321");

        assertThat(dispatchOne()).isTrue();

        verify(smtp).sendChallenge("valid@example.com", "654321", "PASSWORD_RESET");
        assertThat(jdbc.queryForObject(
                "select delivered_at is not null from notification_outbox", Boolean.class)).isTrue();
    }

    @Test
    void dispatcherLocksChallengeBeforeItsNotificationRow() throws Exception {
        var challengeId = insertChallenge("PASSWORD_RESET", "ordered@example.com", false, false);
        insertNotification(challengeId, "PASSWORD_RESET", "ordered@example.com", "654321");

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var challengeLock = connection.prepareStatement(
                    "select id from auth_challenges where id = ? for update")) {
                challengeLock.setObject(1, challengeId);
                challengeLock.executeQuery();
            }
            var dispatch = executor.submit(this::dispatchOne);

            org.assertj.core.api.Assertions.assertThatThrownBy(
                            () -> dispatch.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var notificationLock = connection.prepareStatement(
                    "select id from notification_outbox for update nowait")) {
                assertThat(notificationLock.executeQuery().next()).isTrue();
            }
            connection.commit();

            assertThat(dispatch.get(10, TimeUnit.SECONDS)).isTrue();
        }
    }

    private boolean dispatchOne() {
        return Boolean.TRUE.equals(transactions.execute(status -> dispatcher.dispatchOne()));
    }

    private UUID insertChallenge(
            String purpose, String recipient, boolean expired, boolean consumed) {
        return jdbc.queryForObject("""
                insert into auth_challenges(
                    flow_hash, purpose, target_identity, code_hash, expires_at, consumed_at
                ) values (gen_random_bytes(32), ?, ?, gen_random_bytes(32),
                          case when ? then now() - interval '1 second'
                               else now() + interval '10 minutes' end,
                          case when ? then now() else null end)
                returning id
                """, UUID.class, purpose, recipient, expired, consumed);
    }

    private void insertNotification(
            UUID challengeId, String purpose, String recipient, String code) {
        var payload = new ObjectMapper().createObjectNode()
                .put("challenge_id", challengeId.toString())
                .put("protected_code", protector.protect(code));
        jdbc.update("""
                insert into notification_outbox(event_type, recipient, payload)
                values (?, ?, ?::jsonb)
                """, purpose, recipient, payload.toString());
    }

    private String retiredCode() {
        return jdbc.queryForObject("""
                select last_error_code from notification_outbox
                where delivered_at is not null
                """, String.class);
    }

    private void corruptProtectedCode() {
        jdbc.update("""
                update notification_outbox
                set payload = jsonb_set(payload, '{protected_code}', '"invalid"'::jsonb)
                """);
    }
}
