package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationManualRequest;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAttempt;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationGatewayResult;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRun;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRunClaim;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationAttemptRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationAdminViewRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationManualRequestRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRunRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRunHistoryRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapRevisionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationStatus;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.hamcheeze.vote.task.TaskTestFixtures.singleQuestion;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class OpinionMapGenerationJpaAdapterIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-09-11T03:00:00Z");

    @Autowired
    private OpinionMapGenerationRepository generations;

    @Autowired
    private OpinionMapGenerationAdminViewRepository adminViews;

    @Autowired
    private OpinionMapGenerationManualRequestRepository manualRequests;

    @Autowired
    private TaskRepository tasks;

    @Autowired
    private OpinionMapGenerationRunRepository runs;

    @Autowired
    private OpinionMapGenerationRunHistoryRepository runHistories;

    @Autowired
    private OpinionMapGenerationAttemptRepository attempts;

    @Autowired
    private OpinionMapRevisionRepository revisions;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void insertsIdempotentlyClaimsAndRestoresTheGeneration() {
        TaskId taskId = new TaskId(new UUID(0, 20));
        OpinionMapGeneration generation = OpinionMapGeneration.pending(
                new OpinionMapGenerationId(new UUID(0, 21)),
                taskId,
                1,
                "a".repeat(64),
                "task-result-prompt/v1",
                NOW);
        OpinionMapGeneration duplicate = OpinionMapGeneration.pending(
                new OpinionMapGenerationId(new UUID(0, 22)),
                taskId,
                1,
                "a".repeat(64),
                "task-result-prompt/v1",
                NOW.plusSeconds(1));

        assertThat(generations.insertIfAbsent(generation)).isTrue();
        assertThat(generations.insertIfAbsent(duplicate)).isFalse();
        OpinionMapGeneration claimed = generations
                .findNextDispatchableForUpdate(NOW)
                .orElseThrow();
        UUID claimId = new UUID(0, 23);
        assertThat(claimed.claim(
                claimId, NOW, Duration.ofSeconds(60), 3)).isTrue();
        generations.save(claimed);
        assertThat(claimed.succeed(
                claimId, "{\"status\":\"ok\"}", NOW.plusSeconds(1)))
                .isTrue();
        generations.save(claimed);

        assertThat(generations.findByTaskResult(taskId, 1))
                .get()
                .satisfies(restored -> {
                    assertThat(restored.id()).isEqualTo(generation.id());
                    assertThat(restored.status())
                            .isEqualTo(OpinionMapGenerationStatus.AVAILABLE);
                    assertThat(restored.attemptCount()).isEqualTo(1);
                    assertThat(restored.outputJson())
                            .isEqualTo("{\"status\":\"ok\"}");
                });
    }

    @Test
    void listsUnavailableGenerationAndRecordsManualRetry() {
        Task task = Task.draft(
                new TaskId(UUID.randomUUID()),
                "실패한 과업",
                "설명",
                List.of(singleQuestion()),
                NOW);
        tasks.save(task);
        OpinionMapGeneration generation = OpinionMapGeneration.pending(
                new OpinionMapGenerationId(UUID.randomUUID()),
                task.id(),
                1,
                "b".repeat(64),
                "task-result-prompt/v1",
                NOW);
        generations.insertIfAbsent(generation);
        UUID claimId = UUID.randomUUID();
        generation.claim(claimId, NOW, Duration.ofSeconds(60), 1);
        generation.fail(
                claimId,
                "PROVIDER_TIMEOUT",
                true,
                1,
                Duration.ofSeconds(30),
                NOW.plusSeconds(5));
        generations.save(generation);

        assertThat(adminViews.findUnavailable(Optional.empty(), 10))
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.taskId()).isEqualTo(task.id());
                    assertThat(row.taskTitle()).isEqualTo("실패한 과업");
                    assertThat(row.lastErrorCode())
                            .isEqualTo("PROVIDER_TIMEOUT");
                    assertThat(row.failedAt()).isEqualTo(NOW.plusSeconds(5));
                });

        manualRequests.insert(new OpinionMapGenerationManualRequest(
                UUID.randomUUID(),
                generation.id(),
                OpinionMapGenerationManualRequest.Action.RETRIED,
                generation.attemptCount(),
                generation.lastErrorCode(),
                "admin-a",
                NOW.plusSeconds(10)));
        generation.scheduleManualRetry(NOW.plusSeconds(10));
        generations.save(generation);

        assertThat(adminViews.findUnavailable(Optional.empty(), 10))
                .isEmpty();
    }

    @Test
    void recordsRegenerationAttemptUsageAndRevisionAdditively() {
        OpinionMapGeneration generation = OpinionMapGeneration.pending(
                new OpinionMapGenerationId(UUID.randomUUID()),
                new TaskId(UUID.randomUUID()),
                1,
                "c".repeat(64),
                "task-result-prompt/v1",
                NOW);
        generations.insertIfAbsent(generation);
        OpinionMapGenerationRun run = runs.enqueueRegeneration(
                generation.id(), "admin-a", "regen-test",
                NOW.plusSeconds(1));
        OpinionMapGenerationRunClaim claim = runs.claimNextRegeneration(
                        NOW.plusSeconds(2),
                        Duration.ofSeconds(60),
                        3)
                .orElseThrow();
        OpinionMapGenerationAttempt attempt =
                new OpinionMapGenerationAttempt(
                        UUID.randomUUID(),
                        run.runId(),
                        claim.attemptNumber(),
                        "openrouter",
                        "openai/gpt-5.6-luna",
                        NOW.plusSeconds(2));
        attempts.insert(attempt);
        OpinionMapGenerationGatewayResult result =
                new OpinionMapGenerationGatewayResult(
                        mock(OpinionMapOptionExplanationV1.class),
                        "openrouter",
                        "openai/gpt-5.6-luna",
                        "openai/gpt-5.6-luna-20260901",
                        "gen-test",
                        "req-test",
                        120L,
                        45L,
                        165L,
                        20L,
                        5L,
                        new BigDecimal("0.00042"),
                        "USD",
                        "stop",
                        200);
        attempts.completeSuccess(
                attempt.attemptId(),
                result,
                NOW.plusSeconds(3),
                1000);
        assertThat(runs.completeSuccess(
                run.runId(), claim.claimId(), NOW.plusSeconds(3))).isTrue();
        revisions.insertAiRevision(
                generation,
                run.runId(),
                "{\"status\":\"COMPLETED\"}",
                result,
                NOW.plusSeconds(3));

        assertThat(jdbc.queryForMap("""
                        SELECT requested_model,
                               response_model,
                               prompt_tokens,
                               completion_tokens,
                               total_tokens,
                               cost
                        FROM opinion_map_generation_attempts
                        WHERE attempt_id = ?
                        """, attempt.attemptId()))
                .containsEntry(
                        "requested_model", "openai/gpt-5.6-luna")
                .containsEntry(
                        "response_model",
                        "openai/gpt-5.6-luna-20260901")
                .containsEntry("prompt_tokens", 120L)
                .containsEntry("completion_tokens", 45L)
                .containsEntry("total_tokens", 165L);
        assertThat(jdbc.queryForObject("""
                        SELECT count(*)
                        FROM opinion_map_revisions
                        WHERE run_id = ?
                        """, Integer.class, run.runId())).isEqualTo(1);
        assertThat(runHistories.findByTaskId(generation.taskId()))
                .singleElement()
                .satisfies(history -> {
                    assertThat(history.runId()).isEqualTo(run.runId());
                    assertThat(history.status())
                            .isEqualTo(
                                    OpinionMapGenerationRun.Status.AVAILABLE);
                    assertThat(history.attempts())
                            .singleElement()
                            .satisfies(storedAttempt -> {
                                assertThat(storedAttempt.requestedModel())
                                        .isEqualTo("openai/gpt-5.6-luna");
                                assertThat(storedAttempt.promptTokens())
                                        .isEqualTo(120L);
                                assertThat(storedAttempt.completionTokens())
                                        .isEqualTo(45L);
                            });
                });
    }

    @Test
    void manualRetryStartsANewRunSoAttemptNumbersCanRestart() {
        OpinionMapGeneration generation = OpinionMapGeneration.pending(
                new OpinionMapGenerationId(UUID.randomUUID()),
                new TaskId(UUID.randomUUID()),
                1,
                "d".repeat(64),
                "task-result-prompt/v1",
                NOW);
        generations.insertIfAbsent(generation);

        UUID firstClaim = UUID.randomUUID();
        generation.claim(
                firstClaim, NOW, Duration.ofSeconds(60), 1);
        generations.save(generation);
        UUID firstRun = runs.startInitialAttempt(
                generation,
                firstClaim,
                1,
                NOW,
                Duration.ofSeconds(60));
        attempts.insert(new OpinionMapGenerationAttempt(
                UUID.randomUUID(),
                firstRun,
                1,
                "openrouter",
                "openai/gpt-5.6-luna",
                NOW));
        generation.fail(
                firstClaim,
                "PROVIDER_TIMEOUT",
                true,
                1,
                Duration.ofSeconds(30),
                NOW.plusSeconds(1));
        generations.save(generation);
        runs.synchronizeInitial(firstRun, generation);

        generation.scheduleManualRetry(NOW.plusSeconds(2));
        generations.save(generation);
        OpinionMapGenerationRun retryRun = runs.enqueueManualRetry(
                generation.id(), "admin-a", NOW.plusSeconds(2));
        UUID retryClaim = UUID.randomUUID();
        generation.claim(
                retryClaim,
                NOW.plusSeconds(3),
                Duration.ofSeconds(60),
                3);
        generations.save(generation);
        UUID claimedRetryRun = runs.startInitialAttempt(
                generation,
                retryClaim,
                1,
                NOW.plusSeconds(3),
                Duration.ofSeconds(60));
        attempts.insert(new OpinionMapGenerationAttempt(
                UUID.randomUUID(),
                claimedRetryRun,
                1,
                "openrouter",
                "openai/gpt-5.6-luna",
                NOW.plusSeconds(3)));

        assertThat(claimedRetryRun).isEqualTo(retryRun.runId());
        assertThat(jdbc.queryForObject("""
                        SELECT count(*)
                        FROM opinion_map_generation_attempts
                        WHERE attempt_number = 1
                          AND run_id IN (?, ?)
                        """, Integer.class, firstRun, claimedRetryRun))
                .isEqualTo(2);
    }
}
