package ai.civic.mainauth.token;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.auth.SessionCookieFactory;
import ai.civic.mainauth.auth.SessionService;
import ai.civic.mainauth.support.PostgresIntegrationTest;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class InternalTokenControllerTest extends PostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired SessionService sessions;

    @Test
    void passwordRotationRequiredSessionCannotMintRagToken() throws Exception {
        var administratorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        var session = sessions.issue(administratorId, SessionService.SessionRole.HIGHEST_ADMIN);

        mvc.perform(post("/internal/v1/tokens")
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                        .header("X-CSRF-Token", session.csrfToken())
                        .header(InternalTokenController.INTERNAL_SECRET_HEADER,
                                "local-development-internal-client-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"audience":"civic-rag","scopes":["rag:documents:write"]}
                                """))
                .andExpect(status().isForbidden());
    }
}
