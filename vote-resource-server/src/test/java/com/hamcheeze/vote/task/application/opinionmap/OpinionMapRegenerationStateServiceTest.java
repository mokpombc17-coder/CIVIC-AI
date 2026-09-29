package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRunRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapRevisionRepository;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaSummary;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.GenerationStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.OptionSummary;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpinionMapRegenerationStateServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-09-29T01:00:00Z");
    private static final UUID RUN_ID = new UUID(0, 31);
    private static final UUID CLAIM_ID = new UUID(0, 32);

    private final OpinionMapGenerationRepository generations =
            mock(OpinionMapGenerationRepository.class);
    private final OpinionMapGenerationRunRepository runs =
            mock(OpinionMapGenerationRunRepository.class);
    private final OpinionMapRevisionRepository revisions =
            mock(OpinionMapRevisionRepository.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    private OpinionMapRegenerationStateService service;

    @BeforeEach
    void setUp() {
        service = new OpinionMapRegenerationStateService(
                generations,
                runs,
                revisions,
                policy(),
                objectMapper,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void expiresExhaustedLeasesBeforeClaimingAnotherRun() {
        when(runs.claimNextRegeneration(
                NOW, Duration.ofSeconds(90), 3))
                .thenReturn(Optional.empty());

        assertThat(service.claimNext()).isEmpty();

        var ordered = inOrder(runs);
        ordered.verify(runs).expireExhaustedRegenerations(NOW, 3);
        ordered.verify(runs).claimNextRegeneration(
                NOW, Duration.ofSeconds(90), 3);
    }

    @Test
    void publishesValidatedRegenerationOnlyAfterTheRunSucceeds() {
        OpinionMapGeneration generation = available();
        OpinionMapGenerationRunClaim claim = claim(generation);
        OpinionMapGenerationGatewayResult result = result();
        when(runs.completeSuccess(RUN_ID, CLAIM_ID, NOW)).thenReturn(true);
        when(generations.findByIdForUpdate(generation.id()))
                .thenReturn(Optional.of(generation));
        when(generations.save(generation)).thenReturn(generation);

        assertThat(service.completeSuccess(claim, result)).isTrue();

        assertThat(generation.outputJson()).contains("new-summary");
        verify(revisions).insertAiRevision(
                generation,
                RUN_ID,
                generation.outputJson(),
                result,
                NOW);
    }

    @Test
    void failedRegenerationDoesNotTouchThePublishedGeneration() {
        OpinionMapGeneration generation = available();
        OpinionMapGenerationRunClaim claim = claim(generation);
        String before = generation.outputJson();
        when(runs.completeFailure(
                RUN_ID,
                CLAIM_ID,
                "PROVIDER_TIMEOUT",
                true,
                3,
                Duration.ofSeconds(30),
                NOW)).thenReturn(true);

        assertThat(service.completeFailure(
                claim, "PROVIDER_TIMEOUT", true)).isTrue();

        assertThat(generation.outputJson()).isEqualTo(before);
        verify(generations, never()).save(any());
        verify(revisions, never()).insertAiRevision(
                any(), any(), any(), any(), any());
    }

    private static OpinionMapGeneration available() {
        OpinionMapGeneration generation = OpinionMapGeneration.pending(
                new OpinionMapGenerationId(new UUID(0, 30)),
                new TaskId(new UUID(0, 40)),
                1,
                "a".repeat(64),
                "task-result-prompt/v1",
                NOW.minusSeconds(120));
        UUID initialClaim = new UUID(0, 41);
        generation.claim(
                initialClaim,
                NOW.minusSeconds(100),
                Duration.ofSeconds(90),
                3);
        generation.succeed(
                initialClaim,
                "{\"summary\":\"old-summary\"}",
                NOW.minusSeconds(90));
        return generation;
    }

    private static OpinionMapGenerationRunClaim claim(
            OpinionMapGeneration generation
    ) {
        return new OpinionMapGenerationRunClaim(
                RUN_ID,
                generation.id(),
                OpinionMapGenerationRun.Trigger.ADMIN_REGENERATE,
                CLAIM_ID,
                1,
                generation.taskId(),
                generation.resultVersion(),
                generation.sourceBodySha256(),
                generation.promptVersion());
    }

    private static OpinionMapGenerationGatewayResult result() {
        OpinionMapOptionExplanationV1 output =
                new OpinionMapOptionExplanationV1(
                        OpinionMapOptionExplanationV1.SCHEMA_VERSION,
                        new UUID(0, 40),
                        1,
                        GenerationStatus.COMPLETED,
                        null,
                        List.of(new OptionSummary(
                                "O1",
                                new AreaSummary(
                                        AreaStatus.AVAILABLE,
                                        List.of("O1"),
                                        "new-summary"),
                                new AreaSummary(
                                        AreaStatus.NO_RESPONSES,
                                        List.of(),
                                        null))));
        return new OpinionMapGenerationGatewayResult(
                output,
                "openrouter",
                "openai/gpt-5.6-luna",
                "openai/gpt-5.6-luna",
                "gen-1",
                "req-1",
                100L,
                20L,
                120L,
                null,
                null,
                null,
                null,
                "stop",
                200);
    }

    private static OpinionMapGenerationPolicy policy() {
        return new OpinionMapGenerationPolicy(
                true,
                "task-result-prompt/v1",
                Duration.ofSeconds(60),
                3,
                Duration.ofSeconds(30),
                Duration.ofSeconds(90),
                10);
    }
}
