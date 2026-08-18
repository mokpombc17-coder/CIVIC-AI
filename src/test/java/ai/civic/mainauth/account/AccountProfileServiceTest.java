package ai.civic.mainauth.account;

import static org.assertj.core.api.Assertions.assertThat;

import ai.civic.mainauth.auth.SessionService;
import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class AccountProfileServiceTest extends PostgresIntegrationTest {
    @Autowired AccountProfileService profiles;
    @Autowired JdbcTemplate jdbc;

    @Test
    void adminWithoutQuestionnaireResponsesUsesTheActiveSchemaForUpdates() {
        var userId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        var now = Instant.now();
        var session = new SessionService.SessionView(
                userId, SessionService.SessionRole.HIGHEST_ADMIN, "ACTIVE", 0,
                now.plusSeconds(60), now.plusSeconds(120), now, false);

        var updated = profiles.update(session, "en", "detailed");

        assertThat(updated.preferredLanguage()).isEqualTo("en");
        assertThat(updated.ragAnswerDetail()).isEqualTo("detailed");
        assertThat(jdbc.queryForObject("""
                select count(*) from questionnaire_responses r
                join questionnaire_schemas s on s.id = r.schema_id
                where r.user_id = ? and r.active and s.active_for_new_signup
                """, Integer.class, userId)).isEqualTo(2);
    }
}
