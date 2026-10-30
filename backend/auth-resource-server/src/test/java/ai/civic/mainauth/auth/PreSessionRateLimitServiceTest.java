package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class PreSessionRateLimitServiceTest extends PostgresIntegrationTest {
    @Autowired PreSessionRateLimitService rateLimits;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clearLimitsAndFlows() {
        jdbc.update("delete from pre_session_rate_limits");
        jdbc.update("delete from signup_flows");
    }

    @Test
    void accountAndIpWindowPersistsAcrossEmailAndBoundFlowEndpoints() {
        var email = "limited@example.test";
        for (var attempt = 0; attempt < PreSessionRateLimitService.ACCOUNT_ATTEMPTS_PER_WINDOW - 1; attempt++) {
            rateLimits.checkAndRecord(email, "127.0.0.1");
        }
        var flowId = UUID.randomUUID();
        var schemaId = jdbc.queryForObject(
                "select id from questionnaire_schemas where active_for_new_signup", UUID.class);
        jdbc.update("""
                insert into signup_flows(
                    id, email, normalized_email, questionnaire_schema_id, document_versions, expires_at
                ) values (?, ?, ?, ?, '{}'::jsonb, now() + interval '10 minutes')
                """, flowId, email, email, schemaId);

        assertThatCode(() -> rateLimits.checkAndRecord(flowId.toString(), "127.0.0.1"))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> rateLimits.checkAndRecord(email, "127.0.0.1"))
                .isInstanceOf(RateLimitExceededException.class);
        assertThat(jdbc.queryForObject(
                "select max(attempt_count) from pre_session_rate_limits", Integer.class)).isEqualTo(21);

        assertThatCode(() -> rateLimits.checkAndRecord(email, "127.0.0.2"))
                .doesNotThrowAnyException();
    }

    @Test
    void changingIdentityCannotBypassTheSourceIpWindow() {
        for (var attempt = 0; attempt < PreSessionRateLimitService.SOURCE_IP_ATTEMPTS_PER_WINDOW; attempt++) {
            rateLimits.checkAndRecord("rotated-" + attempt + "@example.test", "127.0.0.3");
        }

        assertThatThrownBy(() -> rateLimits.checkAndRecord(
                "rotated-final@example.test", "127.0.0.3"))
                .isInstanceOf(RateLimitExceededException.class);
        assertThat(jdbc.queryForObject(
                "select max(attempt_count) from pre_session_rate_limits where source_ip = '127.0.0.3'",
                Integer.class)).isEqualTo(PreSessionRateLimitService.SOURCE_IP_ATTEMPTS_PER_WINDOW + 1);
    }

    @Test
    void staleRateLimitRowsAreRemovedDuringTheNextCheck() {
        rateLimits.checkAndRecord("stale@example.test", "127.0.0.4");
        jdbc.update("""
                update pre_session_rate_limits
                set last_attempt_at = now() - interval '25 hours'
                where source_ip = '127.0.0.4'
                """);

        rateLimits.checkAndRecord("fresh@example.test", "127.0.0.5");

        assertThat(jdbc.queryForObject(
                "select count(*) from pre_session_rate_limits where source_ip = '127.0.0.4'",
                Integer.class)).isZero();
    }

    @Test
    void identityRateLimitWriteWaitsForThePrivacyDeletionLock() throws Exception {
        var identity = "privacy-rate-limit@example.test";
        var lockKey = ByteBuffer.wrap(MessageDigest.getInstance("SHA-256")
                .digest(identity.getBytes(StandardCharsets.UTF_8))).getLong();
        try (var executor = Executors.newSingleThreadExecutor();
                var connection = jdbc.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            try (var identityLock = connection.prepareStatement(
                    "select pg_advisory_xact_lock(?)")) {
                identityLock.setLong(1, lockKey);
                identityLock.executeQuery();
            }

            var attempt = executor.submit(
                    () -> rateLimits.checkAndRecord(identity, "127.0.0.6"));
            assertThatThrownBy(() -> attempt.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            assertThat(jdbc.queryForObject("""
                    select count(*) from pre_session_rate_limits
                    where identity_hash = digest(?, 'sha256')
                    """, Integer.class, identity)).isZero();
            connection.rollback();

            assertThatCode(() -> attempt.get(10, TimeUnit.SECONDS)).doesNotThrowAnyException();
        }
    }
}
