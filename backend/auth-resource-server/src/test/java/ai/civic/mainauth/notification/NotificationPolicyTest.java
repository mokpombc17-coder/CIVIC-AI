package ai.civic.mainauth.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class NotificationPolicyTest {
    private final NotificationPolicy policy = new NotificationPolicy();

    @Test
    void backgroundDeliveryAllowsOnlyThreeTotalAttemptsWithBoundedBackoff() {
        assertThat(policy.canDeliver(0)).isTrue();
        assertThat(policy.canDeliver(1)).isTrue();
        assertThat(policy.canDeliver(2)).isTrue();
        assertThat(policy.canDeliver(3)).isFalse();
        assertThat(policy.retryDelay(1)).isEqualTo(Duration.ofSeconds(30));
        assertThat(policy.retryDelay(2)).isEqualTo(Duration.ofMinutes(2));
    }

    @Test
    void explicitVerificationResendIsMinuteSpacedAndHourlyBounded() {
        var now = Instant.parse("2026-08-11T12:00:00Z");
        assertThat(policy.canResend(0, null, now)).isTrue();
        assertThat(policy.canResend(1, now.minusSeconds(59), now)).isFalse();
        assertThat(policy.canResend(4, now.minusSeconds(60), now)).isTrue();
        assertThat(policy.canResend(5, now.minusSeconds(60), now)).isFalse();
    }

    @Test
    void nonSignupChallengesNeverCreateAutomaticRetry() {
        assertThat(policy.automaticRetryAllowed("SIGNUP_EMAIL_VERIFICATION")).isTrue();
        assertThat(policy.automaticRetryAllowed("TWO_FACTOR")).isFalse();
        assertThat(policy.automaticRetryAllowed("PASSWORD_RESET")).isFalse();
        assertThat(policy.automaticRetryAllowed("REACTIVATION")).isFalse();
    }
}
