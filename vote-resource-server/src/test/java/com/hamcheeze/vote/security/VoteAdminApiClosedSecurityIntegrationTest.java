package com.hamcheeze.vote.security;

import com.hamcheeze.vote.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "vote.security.local-admin-api-enabled=false",
        "vote.survey.bootstrap.enabled=false"
})
@AutoConfigureMockMvc
@ActiveProfiles({"local", "test"})
@Import({
        TestcontainersConfiguration.class,
        VoteAdminApiClosedSecurityIntegrationTest.AdminProbeController.class
})
class VoteAdminApiClosedSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void deniesAdminApiWhenLocalTemporaryAccessIsDisabled()
            throws Exception {
        mockMvc.perform(get("/api/v1/admin/security-probe")
                        .with(jwt().jwt(jwt -> jwt.subject("user-a"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @Test
    void deniesTaskResultViewWhenLocalAdminApiIsDisabled()
            throws Exception {
        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/result-view",
                        UUID.randomUUID())
                        .with(jwt().jwt(jwt -> jwt.subject("user-a"))))
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
}
