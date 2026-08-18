package ai.civic.mainauth.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.auth.SessionCookieFactory;
import ai.civic.mainauth.auth.SessionService;
import ai.civic.mainauth.support.PostgresIntegrationTest;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class PrivacyAdminControllerTest extends PostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired SessionService sessions;
    UUID subjectId;
    SessionService.IssuedSession administrator;

    @BeforeEach
    void prepareUsers() {
        jdbc.update("delete from privacy_results");
        jdbc.update("delete from privacy_command_outbox");
        jdbc.update("delete from privacy_operations");
        var administratorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        jdbc.update("update credentials set must_change_password = false where user_id = ?", administratorId);
        administrator = sessions.issue(administratorId, SessionService.SessionRole.HIGHEST_ADMIN);
        var subjectEmail = "privacy-subject-" + UUID.randomUUID() + "@example.test";
        subjectId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, subjectEmail, subjectEmail);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", subjectId);
    }

    @Test
    void highestAdministratorCanValidateAndStartPrivacyDeletion() throws Exception {
        var started = mvc.perform(post("/api/v1/admin/privacy-operations")
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, administrator.sessionId()))
                        .header("X-CSRF-Token", administrator.csrfToken())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "external_request_evidence_id":"operator-evidence-1",
                                  "subject_id":"%s",
                                  "scopes":["ACCOUNT","RAG"]
                                }
                                """.formatted(subjectId)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.operation_id").isString())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn();

        var operationId = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(started.getResponse().getContentAsString())
                .path("operation_id").asText();
        mvc.perform(get("/api/v1/admin/privacy-operations/{operationId}", operationId)
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, administrator.sessionId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.operation_id").value(operationId))
                .andExpect(jsonPath("$.status").value("PENDING"));

        assertThat(jdbc.queryForObject("""
                select count(*) from privacy_operations
                where external_request_evidence_id = 'operator-evidence-1'
                  and subject_id = ? and request_verified
                """, Integer.class, subjectId)).isOne();
        assertThat(jdbc.queryForObject("""
                select count(*) from privacy_command_outbox o
                join privacy_operations p on p.id = o.operation_id
                where p.external_request_evidence_id = 'operator-evidence-1'
                """, Integer.class)).isEqualTo(2);
    }

    @Test
    void privacyDeletionRequiresHighestAdministratorCsrfAndSameOrigin() throws Exception {
        var participant = sessions.issue(subjectId, SessionService.SessionRole.PARTICIPANT);
        var body = """
                {"external_request_evidence_id":"operator-evidence-denied",
                 "subject_id":"%s","scopes":["ACCOUNT"]}
                """.formatted(subjectId);

        mvc.perform(post("/api/v1/admin/privacy-operations")
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, participant.sessionId()))
                        .header("X-CSRF-Token", participant.csrfToken())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/privacy-operations")
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, administrator.sessionId()))
                        .header("X-CSRF-Token", "wrong-token")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/admin/privacy-operations")
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, administrator.sessionId()))
                        .header("X-CSRF-Token", administrator.csrfToken())
                        .header("Origin", "https://evil.example")
                        .header("Sec-Fetch-Site", "cross-site")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());

        assertThat(jdbc.queryForObject(
                "select count(*) from privacy_operations where external_request_evidence_id = 'operator-evidence-denied'",
                Integer.class)).isZero();
    }

    @Test
    void privacyDeletionRejectsEvidenceIdsBeyondTheDurableColumnLimit() throws Exception {
        mvc.perform(post("/api/v1/admin/privacy-operations")
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, administrator.sessionId()))
                        .header("X-CSRF-Token", administrator.csrfToken())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"external_request_evidence_id":"%s",
                                 "subject_id":"%s","scopes":["ACCOUNT"]}
                                """.formatted("x".repeat(256), subjectId)))
                .andExpect(status().isBadRequest());

        assertThat(jdbc.queryForObject(
                "select count(*) from privacy_operations where subject_id = ?",
                Integer.class, subjectId)).isZero();
    }

    @Test
    void demotedHighestAdministratorCannotEnqueueAnInflightPrivacyDeletion() throws Exception {
        var actorEmail = "privacy-racing-admin-" + UUID.randomUUID() + "@example.test";
        var actorId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'ADMIN_CREATED', 'ACTIVE', now()) returning id
                """, UUID.class, actorEmail, actorEmail);
        jdbc.update("insert into credentials(user_id, password_hash, must_change_password) values (?, 'test-hash', false)",
                actorId);
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'SUPER_ADMIN'
                """, actorId);
        var actor = sessions.issue(actorId, SessionService.SessionRole.HIGHEST_ADMIN);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement(
                    "select id from roles where code = 'SUPER_ADMIN' for update")) {
                lock.executeQuery();
            }
            var response = executor.submit(() -> mvc.perform(post("/api/v1/admin/privacy-operations")
                            .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, actor.sessionId()))
                            .header("X-CSRF-Token", actor.csrfToken())
                            .header("Origin", "https://localhost")
                            .header("Sec-Fetch-Site", "same-origin")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"external_request_evidence_id":"operator-evidence-race",
                                     "subject_id":"%s","scopes":["ACCOUNT"]}
                                    """.formatted(subjectId)))
                    .andReturn().getResponse().getStatus());

            org.assertj.core.api.Assertions.assertThatThrownBy(
                            () -> response.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var demote = connection.prepareStatement("""
                    update user_roles set revoked_at = now()
                    where user_id = ? and revoked_at is null
                      and role_id = (select id from roles where code = 'SUPER_ADMIN')
                    """)) {
                demote.setObject(1, actorId);
                demote.executeUpdate();
            }
            connection.commit();

            assertThat(response.get(10, TimeUnit.SECONDS)).isEqualTo(403);
        }

        assertThat(jdbc.queryForObject("""
                select count(*) from privacy_operations
                where external_request_evidence_id = 'operator-evidence-race'
                """, Integer.class)).isZero();
    }

    @Test
    void missingPrivacyOperationReturnsNotFound() throws Exception {
        mvc.perform(get("/api/v1/admin/privacy-operations/{operationId}", UUID.randomUUID())
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, administrator.sessionId())))
                .andExpect(status().isNotFound());
    }
}
