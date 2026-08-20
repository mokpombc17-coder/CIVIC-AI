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
        VoteAdminApiProductionClosedSecurityIntegrationTest.AdminProbeController.class,
        VoteAdminApiProductionClosedSecurityIntegrationTest.JwtTestConfiguration.class
})
class VoteAdminApiProductionClosedSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void deniesAdminApiInProductionEvenWhenTemporaryFlagIsEnabled()
            throws Exception {
        mockMvc.perform(get("/api/v1/admin/security-probe")
                        .with(jwt().jwt(token -> token.subject("user-a"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @RestController
    static class AdminProbeController {

        @GetMapping("/api/v1/admin/security-probe")
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
