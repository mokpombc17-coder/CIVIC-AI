package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.opinionmap.AdminOpinionMapGenerationView.Status;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.GenerationStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.OptionSummary;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaSummary;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryQueryService;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1.OptionCount;
import com.hamcheeze.vote.task.application.result.TaskResultViewIntegrityException;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.actorId;
import static com.hamcheeze.vote.task.TaskTestFixtures.historyId;
import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.optionId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OpinionMapGenerationAdminDetailQueryServiceTest {

    private final TaskRepository tasks = mock(TaskRepository.class);
    private final TaskResultManifestRepository manifests =
            mock(TaskResultManifestRepository.class);
    private final TaskResultSummaryQueryService summaries =
            mock(TaskResultSummaryQueryService.class);
    private final OpinionMapGenerationRepository generations =
            mock(OpinionMapGenerationRepository.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    private OpinionMapGenerationAdminDetailQueryService service;

    @BeforeEach
    void setUp() {
        service = new OpinionMapGenerationAdminDetailQueryService(
                tasks,
                manifests,
                summaries,
                generations,
                new OpinionMapGenerationOutputReader(objectMapper),
                policy(true));
    }

    @Test
    void returnsNotEligibleWithoutReadingAResult() {
        Task task = openTask();
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));

        var view = service.findByTaskId(task.id()).orElseThrow();

        assertThat(view.status()).isEqualTo(Status.NOT_ELIGIBLE);
        assertThat(view.resultVersion()).isNull();
        assertThat(view.canGenerate()).isFalse();
        assertThat(view.options()).allSatisfy(option -> {
            assertThat(option.responseCount()).isNull();
            assertThat(option.sameChoice()).isNull();
            assertThat(option.otherChoices()).isNull();
        });
        verifyNoInteractions(manifests, summaries, generations);
    }

    @Test
    void returnsNotCreatedForHistoricalResultWithoutManifest() {
        Task task = closedTask();
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(manifests.findByTaskId(task.id())).thenReturn(Optional.empty());

        var view = service.findByTaskId(task.id()).orElseThrow();

        assertThat(view.status()).isEqualTo(Status.NOT_CREATED);
        assertThat(view.resultVersion()).isNull();
        assertThat(view.canGenerate()).isTrue();
        assertThat(view.options()).extracting(
                        AdminOpinionMapGenerationView.OptionView::content)
                .containsExactly("A", "B");
        assertThat(view.options()).extracting(
                        AdminOpinionMapGenerationView.OptionView::responseCount)
                .containsOnlyNulls();
        verifyNoInteractions(summaries, generations);
    }

    @Test
    void returnsCountsWhenManifestExistsButGenerationDoesNot() {
        Task task = closedTask();
        TaskResultManifest manifest = manifest(task);
        TaskResultSummaryV1 summary = summary();
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(manifests.findByTaskId(task.id()))
                .thenReturn(Optional.of(manifest));
        when(summaries.findByTaskId(task.id()))
                .thenReturn(Optional.of(summary));
        when(generations.findByTaskResult(task.id(), 1))
                .thenReturn(Optional.empty());

        var view = service.findByTaskId(task.id()).orElseThrow();

        assertThat(view.status()).isEqualTo(Status.NOT_CREATED);
        assertThat(view.resultVersion()).isEqualTo(1);
        assertThat(view.canGenerate()).isTrue();
        assertThat(view.options()).extracting(
                        AdminOpinionMapGenerationView.OptionView::responseCount)
                .containsExactly(2, 0);
    }

    @Test
    void returnsEveryOptionSummaryForAvailableGeneration() throws Exception {
        Task task = closedTask();
        TaskResultManifest manifest = manifest(task);
        OpinionMapOptionExplanationV1 output = output(task);
        OpinionMapGeneration generation = available(task, manifest, output);
        stubFinalized(task, manifest, generation);

        var view = service.findByTaskId(task.id()).orElseThrow();

        assertThat(view.status()).isEqualTo(Status.AVAILABLE);
        assertThat(view.canGenerate()).isFalse();
        assertThat(view.canRetry()).isFalse();
        assertThat(view.options()).hasSize(2);
        assertThat(view.options().getFirst()).satisfies(option -> {
            assertThat(option.optionId()).isEqualTo(optionId(1));
            assertThat(option.content()).isEqualTo("A");
            assertThat(option.responseCount()).isEqualTo(2);
            assertThat(option.sameChoice().body()).isEqualTo("same-A");
            assertThat(option.otherChoices().status())
                    .isEqualTo(
                            AdminOpinionMapGenerationView.AreaStatus.NO_RESPONSES);
            assertThat(option.otherChoices().body()).isNull();
        });
        assertThat(view.options().get(1)).satisfies(option -> {
            assertThat(option.optionId()).isEqualTo(optionId(2));
            assertThat(option.responseCount()).isZero();
            assertThat(option.sameChoice().status())
                    .isEqualTo(
                            AdminOpinionMapGenerationView.AreaStatus.NO_RESPONSES);
            assertThat(option.sameChoice().body()).isNull();
            assertThat(option.otherChoices().body()).isEqualTo("other-B");
        });
    }

    @Test
    void mapsInvalidStoredOutputToResultViewIntegrityFailure() {
        Task task = closedTask();
        TaskResultManifest manifest = manifest(task);
        OpinionMapGeneration generation = pending(task, manifest);
        UUID claimId = new UUID(0, 72);
        generation.claim(
                claimId, task.closedAt(), Duration.ofSeconds(90), 3);
        generation.succeed(
                claimId, "not-json", task.closedAt().plusSeconds(5));
        stubFinalized(task, manifest, generation);

        assertThatThrownBy(() -> service.findByTaskId(task.id()))
                .isInstanceOf(TaskResultViewIntegrityException.class)
                .hasCauseInstanceOf(IllegalStateException.class);
    }

    @Test
    void returnsRetryCapabilityForUnavailableGeneration() {
        Task task = closedTask();
        TaskResultManifest manifest = manifest(task);
        OpinionMapGeneration generation = unavailable(task, manifest);
        stubFinalized(task, manifest, generation);

        var view = service.findByTaskId(task.id()).orElseThrow();

        assertThat(view.status()).isEqualTo(Status.UNAVAILABLE);
        assertThat(view.attemptCount()).isEqualTo(1);
        assertThat(view.lastErrorCode()).isEqualTo("PROVIDER_TIMEOUT");
        assertThat(view.canRetry()).isTrue();
        assertThat(view.options()).allSatisfy(option -> {
            assertThat(option.sameChoice()).isNull();
            assertThat(option.otherChoices()).isNull();
        });
    }

    private void stubFinalized(
            Task task,
            TaskResultManifest manifest,
            OpinionMapGeneration generation
    ) {
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(manifests.findByTaskId(task.id()))
                .thenReturn(Optional.of(manifest));
        when(summaries.findByTaskId(task.id()))
                .thenReturn(Optional.of(summary()));
        when(generations.findByTaskResult(task.id(), 1))
                .thenReturn(Optional.of(generation));
    }

    private OpinionMapGeneration available(
            Task task,
            TaskResultManifest manifest,
            OpinionMapOptionExplanationV1 output
    ) throws Exception {
        OpinionMapGeneration generation = pending(task, manifest);
        UUID claimId = new UUID(0, 70);
        generation.claim(
                claimId, task.closedAt(), Duration.ofSeconds(90), 3);
        generation.succeed(
                claimId,
                objectMapper.writeValueAsString(output),
                task.closedAt().plusSeconds(5));
        return generation;
    }

    private static OpinionMapGeneration unavailable(
            Task task,
            TaskResultManifest manifest
    ) {
        OpinionMapGeneration generation = pending(task, manifest);
        UUID claimId = new UUID(0, 71);
        generation.claim(
                claimId, task.closedAt(), Duration.ofSeconds(90), 1);
        generation.fail(
                claimId,
                "PROVIDER_TIMEOUT",
                true,
                1,
                Duration.ofSeconds(30),
                task.closedAt().plusSeconds(5));
        return generation;
    }

    private static OpinionMapGeneration pending(
            Task task,
            TaskResultManifest manifest
    ) {
        return OpinionMapGeneration.pending(
                new OpinionMapGenerationId(new UUID(0, 60)),
                task.id(),
                manifest.resultVersion(),
                manifest.bodySha256(),
                "task-result-prompt/v1",
                task.closedAt());
    }

    private static OpinionMapOptionExplanationV1 output(Task task) {
        return new OpinionMapOptionExplanationV1(
                OpinionMapOptionExplanationV1.SCHEMA_VERSION,
                task.id().value(),
                1,
                GenerationStatus.COMPLETED,
                null,
                List.of(
                        new OptionSummary(
                                "O1",
                                new AreaSummary(
                                        AreaStatus.AVAILABLE,
                                        List.of("O1"),
                                        "same-A"),
                                new AreaSummary(
                                        AreaStatus.NO_RESPONSES,
                                        List.of(),
                                        null)),
                        new OptionSummary(
                                "O2",
                                new AreaSummary(
                                        AreaStatus.NO_RESPONSES,
                                        List.of(),
                                        null),
                                new AreaSummary(
                                        AreaStatus.AVAILABLE,
                                        List.of("O1"),
                                        "other-B"))));
    }

    private static TaskResultSummaryV1 summary() {
        return new TaskResultSummaryV1(
                TaskResultSummaryV1.SCHEMA_VERSION,
                1,
                2,
                List.of(
                        new OptionCount("O1", "A", 2),
                        new OptionCount("O2", "B", 0)));
    }

    private static TaskResultManifest manifest(Task task) {
        return new TaskResultManifest(
                task.id(),
                1,
                "task-result-view/v1",
                task.closedAt(),
                2,
                "a".repeat(64),
                task.closedAt());
    }

    private static Task closedTask() {
        Task task = openTask();
        task.closeEarly(
                historyId(30), actorId(), "테스트 종료",
                NOW.plusSeconds(20));
        return task;
    }

    private static OpinionMapGenerationPolicy policy(boolean enabled) {
        return new OpinionMapGenerationPolicy(
                enabled,
                "task-result-prompt/v1",
                Duration.ofSeconds(60),
                3,
                Duration.ofSeconds(30),
                Duration.ofSeconds(90),
                10);
    }
}
