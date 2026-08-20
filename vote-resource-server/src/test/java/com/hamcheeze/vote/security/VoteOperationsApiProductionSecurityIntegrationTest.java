package com.hamcheeze.vote.security;

import com.hamcheeze.vote.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "vote.security.local-admin-api-enabled=true",
        "vote.survey.bootstrap.enabled=false",
        "vote.survey.persona.enabled=false",
        "vote.survey.persona.provider=none",
        "vote.task.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.prediction.enabled=false",
        "vote.task.prediction.provider=none"
})
@AutoConfigureMockMvc
@ActiveProfiles({"prod", "test"})
@Import({
        TestcontainersConfiguration.class,
        VoteOperationsApiProductionSecurityIntegrationTest.JwtTestConfiguration.class
})
class VoteOperationsApiProductionSecurityIntegrationTest {

    private static final String PATH =
            "/api/v1/operations/survey/outbox-events/"
                    + UUID.fromString(
                    "00000000-0000-0000-0000-000000000001")
                    + "/replays";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void operationsReplayIsAvailableInProductionOnlyWithDedicatedScope()
            throws Exception {
        mockMvc.perform(post(PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"복구\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post(PATH)
                        .with(jwt()
                                .jwt(token -> token.subject("user-a"))
                                .authorities(new SimpleGrantedAuthority(
                                        "SCOPE_" + VoteScopes.SURVEYS_READ)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"복구\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post(PATH)
                        .with(jwt()
                                .jwt(token -> token.subject("operator-a"))
                                .authorities(new SimpleGrantedAuthority(
                                        "SCOPE_" + VoteScopes
                                                .SURVEY_OUTBOX_REPLAYS_WRITE)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"복구\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(
                        "SURVEY_RESPONSE_SUBMITTED_EVENT_NOT_FOUND"));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class JwtTestConfiguration {

        @Bean
        JwtDecoder jwtDecoder() {
            return mock(JwtDecoder.class);
        }
    }
}
