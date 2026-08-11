package ai.civic.mainauth.signup;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;

@SpringBootTest
@AutoConfigureMockMvc
class SignupControllerContractTest extends PostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;

    @Test
    void startResponseUsesExactOpenApiFieldsAndSecureOpaqueFlowCookie() throws Exception {
        mvc.perform(post("/api/v1/signup/flows")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"contract@example.com\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.flow_id").isString())
                .andExpect(jsonPath("$.expires_at").isString())
                .andExpect(jsonPath("$.questionnaire_version").value("1"))
                .andExpect(jsonPath("$.acceptance_controls.length()").value(2))
                .andExpect(jsonPath("$.initial_acceptance_values").doesNotExist())
                .andExpect(cookie().httpOnly("__Host-civic-auth-flow", true))
                .andExpect(cookie().secure("__Host-civic-auth-flow", true))
                .andExpect(cookie().path("__Host-civic-auth-flow", "/"));
    }

    @Test
    void verificationResendUsesTheBoundFlowAndExplicitRateLimit() throws Exception {
        var started = mvc.perform(post("/api/v1/signup/flows")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"resend@example.com\"}"))
                .andExpect(status().isCreated()).andReturn();
        var flowId = json.readTree(started.getResponse().getContentAsString()).path("flow_id").asText();
        var flowCookie = started.getResponse().getCookie("__Host-civic-auth-flow");

        mvc.perform(post("/api/v1/signup/flows/{flowId}/complete", flowId)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .cookie(flowCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email":"resend@example.com",
                                  "password":"Valid123!",
                                  "preferred_language":"ko",
                                  "rag_answer_detail":"balanced",
                                  "age_14_confirmed":true,
                                  "terms_evidence":{"document_id":"TERMS","document_version":"1","body_sha256":"%s","accepted_at":"2026-08-11T12:00:00Z","path":"/terms"},
                                  "privacy_evidence":{"document_id":"ACCOUNT_RAG_PRIVACY","document_version":"1","body_sha256":"%s","accepted_at":"2026-08-11T12:00:00Z","path":"/privacy"}
                                }
                                """.formatted("a".repeat(64), "b".repeat(64))))
                .andExpect(status().isAccepted());

        jdbc.update("update auth_challenges set last_sent_at = now() - interval '2 minutes'");
        mvc.perform(post("/api/v1/signup/verification/resend")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .cookie(flowCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isAccepted());
    }

    @Test
    void crossSiteSignupMutationIsRejectedBeforeCreatingAFlow() throws Exception {
        mvc.perform(post("/api/v1/signup/flows")
                        .header("Origin", "https://evil.example")
                        .header("Sec-Fetch-Site", "cross-site")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"cross-site@example.com\"}"))
                .andExpect(status().isBadRequest());
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "select count(*) from signup_flows where normalized_email = 'cross-site@example.com'",
                Integer.class)).isZero();
    }
}
