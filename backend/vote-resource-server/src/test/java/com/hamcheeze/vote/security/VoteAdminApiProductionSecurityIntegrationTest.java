package com.hamcheeze.vote.security;

import com.hamcheeze.vote.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

import static org.mockito.Mockito.mock;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "vote.security.local-admin-api-enabled=true",
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
        VoteAdminApiProductionSecurityIntegrationTest.AdminProbeController.class,
        VoteAdminApiProductionSecurityIntegrationTest.JwtTestConfiguration.class
})
class VoteAdminApiProductionSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void deniesNonTaskAdminApiInProductionEvenWithTaskAdminScope()
            throws Exception {
        mockMvc.perform(get("/api/v1/admin/security-probe")
                        .with(jwt()
                                .jwt(token -> token.subject("admin-a"))
                                .authorities(new SimpleGrantedAuthority(
                                        VoteScopes.authority(
                                                VoteScopes.TASKS_ADMIN)))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @Test
    void allowsTaskAdminApiInProductionWithTaskAdminScope()
            throws Exception {
        mockMvc.perform(get("/api/v1/admin/tasks/security-probe")
                        .with(jwt()
                                .jwt(token -> token.subject("admin-a"))
                                .authorities(new SimpleGrantedAuthority(
                                        VoteScopes.authority(
                                                VoteScopes.TASKS_ADMIN)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subject").value("admin-a"));

        mockMvc.perform(get(
                        "/api/v1/admin/opinion-map-generations/security-probe")
                        .with(jwt()
                                .jwt(token -> token.subject("admin-a"))
                                .authorities(new SimpleGrantedAuthority(
                                        VoteScopes.authority(
                                                VoteScopes.TASKS_ADMIN)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subject").value("admin-a"));
    }

    @Test
    void deniesTaskAdminApiInProductionWithoutTaskAdminScope()
            throws Exception {
        mockMvc.perform(get("/api/v1/admin/tasks/security-probe")
                        .with(jwt()
                                .jwt(token -> token.subject("user-a"))
                                .authorities(new SimpleGrantedAuthority(
                                        VoteScopes.authority(
                                                VoteScopes.TASKS_READ)))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        mockMvc.perform(get(
                        "/api/v1/admin/opinion-map-generations/security-probe")
                        .with(jwt()
                                .jwt(token -> token.subject("user-a"))
                                .authorities(new SimpleGrantedAuthority(
                                        VoteScopes.authority(
                                                VoteScopes.TASKS_READ)))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @RestController
    static class AdminProbeController {

        @GetMapping({
                "/api/v1/admin/security-probe",
                "/api/v1/admin/tasks/security-probe",
                "/api/v1/admin/opinion-map-generations/security-probe"
        })
        Map<String, String> probe(Authentication authentication) {
            return Map.of("subject", authentication.getName());
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class JwtTestConfiguration {

        @Bean
        JwtDecoder jwtDecoder() {
            return mock(JwtDecoder.class);
        }
    }
}
