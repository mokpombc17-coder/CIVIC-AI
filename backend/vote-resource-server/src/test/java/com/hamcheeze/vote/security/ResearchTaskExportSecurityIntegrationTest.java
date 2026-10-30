package com.hamcheeze.vote.security;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.research.ResearchTaskExportDataReader;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "vote.security.local-admin-api-enabled=false",
        "vote.survey.bootstrap.enabled=false",
        "vote.persona.enabled=false",
        "vote.persona.provider=none",
        "vote.task.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.prediction.enabled=false",
        "vote.task.prediction.provider=none"
})
@AutoConfigureMockMvc
@ActiveProfiles({"prod", "test"})
@Import({
        TestcontainersConfiguration.class,
        ResearchTaskExportSecurityIntegrationTest.JwtTestConfiguration.class
})
class ResearchTaskExportSecurityIntegrationTest {

    private static final UUID MISSING_TASK_ID = new UUID(0, 999);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ResearchTaskExportDataReader dataReader;

    @Test
    void requiresDedicatedResearchExportScope() throws Exception {
        String path = "/api/v1/research/tasks/"
                + MISSING_TASK_ID + "/exports";

        mockMvc.perform(post(path))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        mockMvc.perform(post(path)
                        .with(jwt()
                                .jwt(token -> token.subject("admin-a"))
                                .authorities(new SimpleGrantedAuthority(
                                        VoteScopes.authority(
                                                VoteScopes.TASKS_ADMIN)))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        mockMvc.perform(post(path)
                        .with(jwt()
                                .jwt(token -> token.subject("researcher-a"))
                                .authorities(new SimpleGrantedAuthority(
                                        VoteScopes.authority(
                                                VoteScopes
                                                        .RESEARCH_EXPORT)))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("RESEARCH_TASK_EXPORT_NOT_FOUND"));
    }

    @Test
    void researchDataQuerySupportsTasksWithoutResponses() {
        assertThat(dataReader.findParticipants(
                new TaskId(MISSING_TASK_ID))).isEmpty();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class JwtTestConfiguration {

        @Bean
        JwtDecoder jwtDecoder() {
            return mock(JwtDecoder.class);
        }
    }
}
