package ai.civic.mainauth.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.auth.AuthenticationException;
import ai.civic.mainauth.auth.SessionService;
import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class AccountProfileServiceTest extends PostgresIntegrationTest {
    @Autowired AccountProfileService profiles;
    @Autowired JdbcTemplate jdbc;
    @Autowired SessionService sessions;

    @Test
    void adminWithoutQuestionnaireResponsesUsesTheActiveSchemaForUpdates() {
        var userId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        var now = Instant.now();
        var session = new SessionService.SessionView(
                userId, SessionService.SessionRole.HIGHEST_ADMIN, "ACTIVE", 0,
                now.plusSeconds(60), now.plusSeconds(120), now, false);
        var issued = sessions.issue(userId, SessionService.SessionRole.HIGHEST_ADMIN);

        var updated = profiles.update(issued.sessionId(), session, "en", "detailed");

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
        var userId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", userId);
        var now = Instant.now();
        var session = new SessionService.SessionView(
                userId, SessionService.SessionRole.PARTICIPANT, "ACTIVE", 0,
                now.plusSeconds(60), now.plusSeconds(120), now, false);
        var issued = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                ready.countDown();
                start.await();
                return profiles.update(issued.sessionId(), session, "en", null);
            });
            var second = executor.submit(() -> {
                ready.countDown();
                start.await();
                return profiles.update(issued.sessionId(), session, "ko", null);
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
    void profileUpdateRejectsASessionRevokedWhileWaitingForTheUserLock() throws Exception {
        var email = "profile-revoked-" + UUID.randomUUID() + "@example.test";
        var userId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", userId);
        var issued = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        var session = sessions.require(issued.sessionId());

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var update = executor.submit(() -> profiles.update(
                    issued.sessionId(), session, "en", null));

            assertThatThrownBy(() -> update.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var revoke = connection.prepareStatement("""
                        update sessions set revoked_at = now(), revocation_reason = 'PASSWORD_CHANGED'
                        where user_id = ? and revoked_at is null
                    """)) {
                revoke.setObject(1, userId);
                revoke.executeUpdate();
            }
            connection.commit();

            assertThatThrownBy(() -> update.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }

        assertThat(jdbc.queryForObject("""
                select count(*) from questionnaire_responses
                where user_id = ? and question_key = 'preferred_language'
                """, Integer.class, userId)).isZero();
    }

    @Test
    void profileUpdateWaitsForLogoutAndRejectsTheRevokedSession() throws Exception {
        var email = "profile-logout-race-" + UUID.randomUUID() + "@example.test";
        var userId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", userId);
        var issued = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        var session = sessions.require(issued.sessionId());

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("""
                    select session_hash from sessions
                    where user_id = ? and revoked_at is null for update
                    """)) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }

            var update = executor.submit(
                    () -> profiles.update(issued.sessionId(), session, "en", null));
            assertThatThrownBy(() -> update.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var revoke = connection.prepareStatement("""
                    update sessions set revoked_at = now(), revocation_reason = 'LOGOUT'
                    where user_id = ? and revoked_at is null
                    """)) {
                revoke.setObject(1, userId);
                assertThat(revoke.executeUpdate()).isOne();
            }
            connection.commit();

            assertThatThrownBy(() -> update.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }

        assertThat(jdbc.queryForObject("""
                select count(*) from questionnaire_responses
                where user_id = ? and question_key = 'preferred_language'
                """, Integer.class, userId)).isZero();
    }
}
