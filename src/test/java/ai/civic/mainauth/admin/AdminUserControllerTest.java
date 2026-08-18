package ai.civic.mainauth.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class AdminUserControllerTest extends PostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired SessionService sessions;

    @Test
    void unknownUserReturnsNotFoundInsteadOfServerError() throws Exception {
        var administratorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        jdbc.update("update credentials set must_change_password = false where user_id = ?", administratorId);
        var session = sessions.issue(administratorId, SessionService.SessionRole.HIGHEST_ADMIN);

        mvc.perform(get("/api/v1/admin/users/{userId}", UUID.randomUUID())
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId())))
                .andExpect(status().isNotFound());
    }
}
