package ai.civic.mainauth.admin;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
class AdminUserLabelControllerTest extends PostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired SessionService sessions;

    @Test
    void administratorWithRagPermissionCanResolveOnlyRequestedUserEmailLabels() throws Exception {
        var operatorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        jdbc.update("update credentials set must_change_password = false where user_id = ?", operatorId);
        var session = sessions.issue(operatorId, SessionService.SessionRole.HIGHEST_ADMIN);
        var email = jdbc.queryForObject("select email from users where id = ?", String.class, operatorId);

        mvc.perform(get("/api/v1/admin/user-labels")
                        .queryParam("ids", operatorId.toString(), UUID.randomUUID().toString())
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[*].user_id", hasItem(operatorId.toString())))
                .andExpect(jsonPath("$.items[*].email", hasItem(email)));
    }

    @Test
    void participantCannotResolveAdministratorUserLabels() throws Exception {
        var participantId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        jdbc.update("update credentials set must_change_password = false where user_id = ?", participantId);
        var session = sessions.issue(participantId, SessionService.SessionRole.PARTICIPANT);

        mvc.perform(get("/api/v1/admin/user-labels")
                        .queryParam("ids", participantId.toString())
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId())))
                .andExpect(status().isForbidden());
    }
}
