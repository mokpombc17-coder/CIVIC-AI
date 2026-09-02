package ai.civic.mainauth.signup;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import ai.civic.mainauth.notification.VerificationCodeProtector;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

@SpringBootTest
@AutoConfigureMockMvc
class SignupControllerContractTest extends PostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired VerificationCodeProtector codeProtector;

    @BeforeEach
    void enablePublicSignupForContractTests() {
        jdbc.update("update feature_gates set enabled = true where gate_key = 'PUBLIC_SIGNUP_ENABLED'");
    }

    @Test
    void disabledPublicSignupGateReturnsServiceUnavailableWithoutCreatingAFlow() throws Exception {
        jdbc.update("update feature_gates set enabled = false where gate_key = 'PUBLIC_SIGNUP_ENABLED'");

        mvc.perform(post("/api/v1/signup/flows")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"disabled@example.com\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString(
                        "PUBLIC_SIGNUP_ENABLED")));

        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "select count(*) from signup_flows where normalized_email = 'disabled@example.com'",
                Integer.class)).isZero();
    }

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
                .andExpect(jsonPath("$.documents.TERMS.document_id").value("TERMS"))
                .andExpect(jsonPath("$.documents.TERMS.document_version").value("2"))
                .andExpect(jsonPath("$.documents.TERMS.body_sha256")
                        .value("50dc88e608395e505f81fb14bd1913fb2266447980e5527a87c0fd4d50c9c6ef"))
                .andExpect(jsonPath("$.documents.TERMS.path").value("/legal/terms/2"))
                .andExpect(jsonPath("$.documents.ACCOUNT_RAG_PRIVACY.document_version").value("2"))
                .andExpect(jsonPath("$.documents.ACCOUNT_RAG_PRIVACY.path")
                        .value("/legal/required-service-information/2"))
                .andExpect(jsonPath("$.acceptance_controls.length()").value(1))
                .andExpect(jsonPath("$.acceptance_controls[0]").value("TERMS"))
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

        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where flow_hash = digest(?, 'sha256') and user_id is null
                """, Integer.class, flowId)).isOne();

        jdbc.update("""
                update auth_challenges set expires_at = now() - interval '1 hour',
                    last_sent_at = now() - interval '2 minutes'
                where flow_hash = digest(?, 'sha256')
                """, flowId);
        mvc.perform(post("/api/v1/signup/verification/resend")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .cookie(flowCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict());

        jdbc.update("""
                update auth_challenges set expires_at = now() + interval '10 minutes',
                    last_sent_at = now() - interval '2 minutes'
                where flow_hash = digest(?, 'sha256')
                """, flowId);
        mvc.perform(post("/api/v1/signup/verification/resend")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .cookie(flowCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
                .andExpect(status().isAccepted())
                .andExpect(cookie().httpOnly("__Host-civic-auth-flow", true))
                .andExpect(cookie().secure("__Host-civic-auth-flow", true))
                .andExpect(cookie().maxAge("__Host-civic-auth-flow", 600));

        var protectedCode = json.readTree(jdbc.queryForObject("""
                select payload::text from notification_outbox
                where recipient = 'resend@example.com'
                order by created_at desc limit 1
                """, String.class)).path("protected_code").asText();
        mvc.perform(post("/api/v1/signup/verification/verify")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .cookie(flowCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "code", codeProtector.reveal(protectedCode)))))
                .andExpect(status().isNoContent())
                .andExpect(cookie().httpOnly("__Host-civic-auth-flow", true))
                .andExpect(cookie().secure("__Host-civic-auth-flow", true))
                .andExpect(cookie().maxAge("__Host-civic-auth-flow", 600));

        mvc.perform(post("/api/v1/signup/flows/{flowId}/complete", flowId)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .cookie(flowCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(completionBody("resend@example.com")))
                .andExpect(status().isCreated())
                .andExpect(cookie().maxAge("__Host-civic-auth-flow", 0));
    }

    @Test
    void verificationRejectsMissingOrNullCodeBeforeHashing() throws Exception {
        for (var body : java.util.List.of("{}", "{\"code\":null}", "{\"code\":\"  \"}")) {
            mvc.perform(post("/api/v1/signup/verification/verify")
                            .header("Origin", "https://localhost")
                            .header("Sec-Fetch-Site", "same-origin")
                            .cookie(new jakarta.servlet.http.Cookie(
                                    "__Host-civic-auth-flow", java.util.UUID.randomUUID().toString()))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void verificationRejectsAnUnknownFlowAsABadRequest() throws Exception {
        mvc.perform(post("/api/v1/signup/verification/verify")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .cookie(new jakarta.servlet.http.Cookie(
                                "__Host-civic-auth-flow", java.util.UUID.randomUUID().toString()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"123456\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Verification flow is invalid"));
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

    private String completionBody(String email) {
        return """
                {
                  "email":"%s",
                  "password":"Valid123!",
                  "preferred_language":"ko",
                  "rag_answer_detail":"balanced",
                  "age_14_confirmed":true,
                  "terms_evidence":{"document_id":"TERMS","document_version":"2","body_sha256":"%s","checked_at":"2026-09-03T12:00:00Z","path":"/legal/terms/2"}
                }
                """.formatted(
                email,
                "50dc88e608395e505f81fb14bd1913fb2266447980e5527a87c0fd4d50c9c6ef");
    }
}
