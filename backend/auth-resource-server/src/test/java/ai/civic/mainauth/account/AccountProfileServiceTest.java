package ai.civic.mainauth.account;

import static org.assertj.core.api.Assertions.assertThat;

import ai.civic.mainauth.auth.AccessCredentialTestFactory;
import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class AccountProfileServiceTest extends PostgresIntegrationTest {
    @Autowired AccountProfileService profiles;
    @Autowired AccessCredentialTestFactory credentials;
    @Autowired JdbcTemplate jdbc;

    @Test
    void adminWithoutQuestionnaireResponsesUsesTheActiveSchemaForUpdates() {
        var userId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        var credential = credentials.issue(userId);

        var updated = profiles.update(credential.user(), "en", "detailed");

        assertThat(updated.preferredLanguage()).isEqualTo("en");
        assertThat(updated.ragAnswerDetail()).isEqualTo("detailed");
        assertThat(jdbc.queryForObject("""
                select count(*) from questionnaire_responses r
                join questionnaire_schemas s on s.id = r.schema_id
                where r.user_id = ? and r.active and s.active_for_new_signup
                """, Integer.class, userId)).isEqualTo(2);
    }

    @Test
    void concurrentProfileUpdatesLeaveOneActiveVersionPerQuestion() throws Exception {
        var email = "profile-concurrent-" + UUID.randomUUID() + "@example.test";
        var userId = createParticipant(email);
        var credential = credentials.issue(userId);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                ready.countDown();
                start.await();
                return profiles.update(credential.user(), "en", null);
            });
            var second = executor.submit(() -> {
                ready.countDown();
                start.await();
                return profiles.update(credential.user(), "ko", null);
            });
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
        }

        assertThat(jdbc.queryForObject("""
                select count(*) from questionnaire_responses
                where user_id = ? and question_key = 'preferred_language' and active
                """, Integer.class, userId)).isOne();
        assertThat(jdbc.queryForObject("""
                select count(distinct response_version) from questionnaire_responses
                where user_id = ? and question_key = 'preferred_language'
                """, Integer.class, userId)).isEqualTo(2);
    }

    @Test
    void activeUserCanReadAndUpdateProfileThroughAccessTokenIdentity() {
        var email = "profile-" + UUID.randomUUID() + "@example.test";
        var userId = createParticipant(email);
        var credential = credentials.issue(userId);

        var updated = profiles.update(credential.user(), "en", "detailed");

        assertThat(updated.userId()).isEqualTo(userId);
        assertThat(updated.email()).isEqualTo(email);
        assertThat(updated.preferredLanguage()).isEqualTo("en");
        assertThat(updated.ragAnswerDetail()).isEqualTo("detailed");
    }

    private UUID createParticipant(String email) {
        var userId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", userId);
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'PARTICIPANT'
                """, userId);
        return userId;
    }
}
