package ai.civic.mainauth.privacy;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PrivacyOperatorCommandTest {
    @Test
    void rejectsExpiredUnverifiedMismatchedOrDirectDeleteExecution() {
        var command = new PrivacyOperatorCommand();
        var now = Instant.parse("2026-08-11T12:00:00Z");
        assertThatThrownBy(() -> command.validate(new PrivacyOperatorCommand.Request(
                "evidence", UUID.randomUUID(), Set.of("ACCOUNT"), false, now.plusSeconds(60), false), now))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> command.validate(new PrivacyOperatorCommand.Request(
                "evidence", UUID.randomUUID(), Set.of("ACCOUNT"), true, now.minusSeconds(1), false), now))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> command.validate(new PrivacyOperatorCommand.Request(
                "evidence", UUID.randomUUID(), Set.of("ACCOUNT"), true, now.plusSeconds(60), true), now))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
