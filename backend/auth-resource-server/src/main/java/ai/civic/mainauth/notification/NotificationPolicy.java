package ai.civic.mainauth.notification;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;

public final class NotificationPolicy {
    private static final Set<String> AUTOMATIC = Set.of("SIGNUP_EMAIL_VERIFICATION");

    public boolean canDeliver(int previousAttemptCount) {
        return previousAttemptCount >= 0 && previousAttemptCount < 3;
    }

    public Duration retryDelay(int failedAttemptNumber) {
        return switch (failedAttemptNumber) {
            case 1 -> Duration.ofSeconds(30);
            case 2 -> Duration.ofMinutes(2);
            default -> Duration.ofMinutes(5);
        };
    }

    public boolean canResend(int sentInCurrentHour, Instant lastSentAt, Instant now) {
        if (sentInCurrentHour >= 5) return false;
        return lastSentAt == null || !lastSentAt.plusSeconds(60).isAfter(now);
    }

    public boolean automaticRetryAllowed(String challengePurpose) {
        return AUTOMATIC.contains(challengePurpose);
    }
}
