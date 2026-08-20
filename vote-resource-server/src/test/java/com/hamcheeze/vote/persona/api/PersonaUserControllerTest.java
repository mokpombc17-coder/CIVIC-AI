package com.hamcheeze.vote.persona.api;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;
import com.hamcheeze.vote.persona.application.query.CurrentPersonaQueryService;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;
import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.UUID;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PersonaUserControllerTest {

    private final AuthenticatedUserIdResolver userIds =
            mock(AuthenticatedUserIdResolver.class);
    private final CurrentPersonaQueryService currentPersona =
            mock(CurrentPersonaQueryService.class);
    private final Authentication authentication = mock(Authentication.class);

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(userIds.resolve(authentication)).thenReturn("user-a");
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new PersonaUserController(userIds, currentPersona))
                .build();
    }

    @Test
    void exposesReadinessWithoutExternalPersonaId() throws Exception {
        PersonaGeneration generation = PersonaGeneration.pending(
                new PersonaGenerationId(UUID.randomUUID()),
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(UUID.randomUUID()),
                Instant.parse("2026-08-14T00:00:00Z"));
        Instant startedAt = Instant.parse("2026-08-14T00:00:01Z");
        PersonaGenerationClaimToken token =
                new PersonaGenerationClaimToken(UUID.randomUUID());
        generation.claim(token, startedAt, startedAt.plusSeconds(60));
        generation.succeed(
                token,
                new PersonaId("external-persona-secret"),
                Instant.parse("2026-08-14T00:00:02Z"));
        PersonaVersionId versionId = new PersonaVersionId(UUID.randomUUID());
        when(currentPersona.findCurrent(new PersonaUserId("user-a")))
                .thenReturn(CurrentPersonaStatus.from(
                        generation,
                        Optional.of(versionId)));

        mockMvc.perform(get("/api/v1/me/persona-status")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.personaReady").value(true))
                .andExpect(jsonPath("$.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.personaVersionId")
                        .value(versionId.value().toString()))
                .andExpect(jsonPath("$.capabilities[0]").value(
                        "USE_PERSONALIZED_SERVICE"))
                .andExpect(content().string(
                        org.hamcrest.Matchers.not(
                                org.hamcrest.Matchers.containsString(
                                        "external-persona-secret"))));

        verify(currentPersona).findCurrent(new PersonaUserId("user-a"));
    }

    @Test
    void distinguishesManualRetryFromAutomaticRetryWithoutLeakingClaim()
            throws Exception {
        PersonaGeneration generation = PersonaGeneration.pending(
                new PersonaGenerationId(UUID.randomUUID()),
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(UUID.randomUUID()),
                Instant.parse("2026-08-20T00:00:00Z"));
        PersonaGenerationClaimToken token =
                new PersonaGenerationClaimToken(UUID.randomUUID());
        generation.claim(
                token,
                Instant.parse("2026-08-20T00:00:01Z"),
                Instant.parse("2026-08-20T00:01:01Z"));
        generation.fail(
                token,
                "PERSONA_INVALID_RESPONSE",
                Instant.parse("2026-08-20T00:00:02Z"),
                null);
        generation.scheduleManualRetry(
                Instant.parse("2026-08-20T00:02:00Z"));
        when(currentPersona.findCurrent(new PersonaUserId("user-a")))
                .thenReturn(CurrentPersonaStatus.from(
                        generation, Optional.empty()));

        mockMvc.perform(get("/api/v1/me/persona-status")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.retryScheduled").value(true))
                .andExpect(jsonPath("$.retryTrigger").value("MANUAL"))
                .andExpect(jsonPath("$.automaticRetryScheduled")
                        .value(false))
                .andExpect(jsonPath("$.terminalFailure").value(false))
                .andExpect(content().string(
                        org.hamcrest.Matchers.not(
                                org.hamcrest.Matchers.containsString(
                                        "claimToken"))));
    }
}
