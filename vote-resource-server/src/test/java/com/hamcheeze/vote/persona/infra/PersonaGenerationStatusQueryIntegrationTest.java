package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "vote.persona.enabled=false")
@ActiveProfiles({"local", "test"})
@Import(TestcontainersConfiguration.class)
class PersonaGenerationStatusQueryIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-08-20T00:00:00Z");

    @Autowired
    private PersonaGenerationRepository generations;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    @AfterEach
    void reset() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    persona_generation_retry_requests,
                    persona_generation_attempts,
                    persona_versions,
                    persona_generations
                CASCADE
                """);
    }

    @Test
    void reportsBacklogStaleLeaseRetryWaitTerminalFailureAndAges() {
        generations.insert(pending(NOW.minusSeconds(120)));

        PersonaGeneration stale = pending(NOW.minusSeconds(90));
        stale.claim(token(), NOW.minusSeconds(60), NOW.minusSeconds(1));
        generations.insert(stale);

        PersonaGeneration retryWait = pending(NOW.minusSeconds(50));
        PersonaGenerationClaimToken retryToken = token();
        retryWait.claim(retryToken, NOW.minusSeconds(40),
                NOW.plusSeconds(20));
        retryWait.fail(retryToken, "PERSONA_REMOTE_TIMEOUT",
                NOW.minusSeconds(30), NOW.plusSeconds(10));
        generations.insert(retryWait);

        PersonaGeneration terminal = pending(NOW.minusSeconds(30));
        PersonaGenerationClaimToken terminalToken = token();
        terminal.claim(terminalToken, NOW.minusSeconds(20),
                NOW.plusSeconds(40));
        terminal.fail(terminalToken, "PERSONA_INVALID_RESPONSE",
                NOW.minusSeconds(10), null);
        generations.insert(terminal);

        PersonaGenerationStatusQuery query =
                new PersonaGenerationStatusQuery(
                        jdbcTemplate,
                        Clock.fixed(NOW, ZoneOffset.UTC),
                        Duration.ZERO);

        assertThat(query.snapshot()).isEqualTo(
                new PersonaGenerationStatusQuery.Snapshot(
                        1, 1, 1, 1, 1, 4, 120, 60));
    }

    private static PersonaGeneration pending(Instant createdAt) {
        return PersonaGeneration.pending(
                new PersonaGenerationId(UUID.randomUUID()),
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(UUID.randomUUID()),
                createdAt);
    }

    private static PersonaGenerationClaimToken token() {
        return new PersonaGenerationClaimToken(UUID.randomUUID());
    }
}
