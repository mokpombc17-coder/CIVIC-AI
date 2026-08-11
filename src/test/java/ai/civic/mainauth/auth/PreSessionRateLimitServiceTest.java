package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.util.UUID;
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
        for (var attempt = 0; attempt < PreSessionRateLimitService.ATTEMPTS_PER_WINDOW - 1; attempt++) {
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
}
