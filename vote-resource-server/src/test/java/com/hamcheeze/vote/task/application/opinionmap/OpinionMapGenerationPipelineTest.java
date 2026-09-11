package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationGateway;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultForLlmRenderer.RenderedTaskResultForLlm;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.application.result.MyTaskOpinionMap;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaSummary;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.GenerationStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.OptionSummary;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1Assembler;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.application.result.TaskResultViewVerificationService;
import com.hamcheeze.vote.task.application.result.VerifiedTaskResultView;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationStatus;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OpinionMapGenerationPipelineTest {

    private static final TaskId TASK_ID = new TaskId(new UUID(0, 10));
    private static final Instant NOW =
            Instant.parse("2026-09-11T02:00:00Z");
    private static final String SOURCE_HASH = "b".repeat(64);

    @Test
    void generatesStoresAndProjectsTheSelectedOptionsExplanation() {
        InMemoryGenerationRepository repository =
                new InMemoryGenerationRepository();
        OpinionMapGenerationPolicy policy = policy();
        ObjectMapper objectMapper = new ObjectMapper();
        OpinionMapGenerationStateService states =
                new OpinionMapGenerationStateService(
                        repository,
                        policy,
                        objectMapper,
                        Clock.fixed(NOW, ZoneOffset.UTC));
        VerifiedTaskResultView verified = verifiedResult(SOURCE_HASH);
        TaskResultViewVerificationService verification = mock(
                TaskResultViewVerificationService.class);
        when(verification.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(verified));
        AtomicReference<OpinionMapGenerationRequest> received =
                new AtomicReference<>();
        OpinionMapGenerationGateway gateway = request -> {
            received.set(request);
            return completed(request.input());
        };
        OpinionMapGenerationWorker worker = new OpinionMapGenerationWorker(
                states,
                verification,
                new TaskResultForLlmV1Assembler(),
                export -> new RenderedTaskResultForLlm(
                        "task-result-jsonl", "c".repeat(64)),
                () -> "opinion-map-prompt",
                gateway,
                policy);

        assertThat(states.enqueue(verified.manifest())).isTrue();
        assertThat(worker.executeOne()).isTrue();

        OpinionMapGeneration stored = repository
                .findByTaskResult(TASK_ID, 1)
                .orElseThrow();
        assertThat(stored.status())
                .isEqualTo(OpinionMapGenerationStatus.AVAILABLE);
        assertThat(stored.attemptCount()).isEqualTo(1);
        assertThat(stored.outputJson()).contains(
                OpinionMapOptionExplanationV1.SCHEMA_VERSION);
        assertThat(received.get().inputJsonl())
                .isEqualTo("task-result-jsonl");
        assertThat(received.get().prompt())
                .isEqualTo("opinion-map-prompt");

        MyTaskOpinionMap result = new OpinionMapResultQueryService(
                repository, objectMapper).findForTask(TASK_ID, 1, 2);
        assertThat(result.status())
                .isEqualTo(MyTaskOpinionMap.Status.AVAILABLE);
        assertThat(result.sameChoice().body()).isEqualTo("same-O2");
        assertThat(result.otherChoices().body()).isEqualTo("other-O2");
    }

    @Test
    void makesGenerationUnavailableWhenTheFinalizedInputChanged() {
        InMemoryGenerationRepository repository =
                new InMemoryGenerationRepository();
        OpinionMapGenerationPolicy policy = policy();
        OpinionMapGenerationStateService states =
                new OpinionMapGenerationStateService(
                        repository,
                        policy,
                        new ObjectMapper(),
                        Clock.fixed(NOW, ZoneOffset.UTC));
        VerifiedTaskResultView enqueued = verifiedResult(SOURCE_HASH);
        VerifiedTaskResultView changed = verifiedResult("d".repeat(64));
        TaskResultViewVerificationService verification = mock(
                TaskResultViewVerificationService.class);
        when(verification.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(changed));
        OpinionMapGenerationWorker worker = new OpinionMapGenerationWorker(
                states,
                verification,
                new TaskResultForLlmV1Assembler(),
                export -> new RenderedTaskResultForLlm(
                        "unused", "e".repeat(64)),
                () -> "prompt",
                request -> completed(request.input()),
                policy);

        states.enqueue(enqueued.manifest());
        worker.executeOne();

        OpinionMapGeneration stored = repository
                .findByTaskResult(TASK_ID, 1)
                .orElseThrow();
        assertThat(stored.status())
                .isEqualTo(OpinionMapGenerationStatus.UNAVAILABLE);
        assertThat(stored.lastErrorCode())
                .isEqualTo("OPINION_MAP_INPUT_CHANGED");
    }

    private static OpinionMapGenerationPolicy policy() {
        return new OpinionMapGenerationPolicy(
                true,
                "task-result-prompt/v1",
                Duration.ofSeconds(30),
                3,
                Duration.ofSeconds(10),
                Duration.ofSeconds(60),
                5);
    }

    private static OpinionMapOptionExplanationV1 completed(
            TaskResultForLlmV1 input
    ) {
        List<OptionSummary> summaries = input.options().stream()
                .map(option -> new OptionSummary(
                        option.key(),
                        new AreaSummary(
                                AreaStatus.AVAILABLE,
                                List.of(option.key()),
                                "same-" + option.key()),
                        new AreaSummary(
                                AreaStatus.AVAILABLE,
                                input.options().stream()
                                        .map(TaskResultForLlmV1.OptionData::key)
                                        .filter(key -> !key.equals(option.key()))
                                        .toList(),
                                "other-" + option.key())))
                .toList();
        return new OpinionMapOptionExplanationV1(
                OpinionMapOptionExplanationV1.SCHEMA_VERSION,
                input.taskId().value(),
                input.resultVersion(),
                GenerationStatus.COMPLETED,
                null,
                summaries);
    }

    private static VerifiedTaskResultView verifiedResult(String hash) {
        TaskResultViewV1 view = new TaskResultViewV1(
                1,
                NOW.minusSeconds(60),
                TaskClosureType.DEADLINE_REACHED,
                new TaskData("정책 선택", "정책 배경"),
                new QuestionData(
                        TaskQuestionType.SINGLE_CHOICE,
                        "어떤 정책을 선택하시겠습니까?",
                        null),
                List.of(
                        new OptionData(1, "첫 번째 정책"),
                        new OptionData(2, "두 번째 정책")),
                List.of(
                        new ResponseData(
                                1, 1, "검증된 절차가 필요합니다.",
                                TaskReasonSource.USER_WRITTEN),
                        new ResponseData(
                                2, 2, "신속한 추진이 필요합니다.",
                                TaskReasonSource.USER_WRITTEN)));
        TaskResultManifest manifest = new TaskResultManifest(
                TASK_ID,
                1,
                TaskResultViewV1.SCHEMA_VERSION,
                NOW.minusSeconds(60),
                2,
                hash,
                NOW.minusSeconds(60));
        return new VerifiedTaskResultView(
                manifest,
                view,
                new RenderedTaskResultView("verified", hash));
    }

    private static final class InMemoryGenerationRepository
            implements OpinionMapGenerationRepository {

        private final Map<OpinionMapGenerationId, OpinionMapGeneration> rows =
                new LinkedHashMap<>();

        @Override
        public boolean insertIfAbsent(OpinionMapGeneration generation) {
            boolean exists = rows.values().stream().anyMatch(row ->
                    row.taskId().equals(generation.taskId())
                            && row.resultVersion()
                            == generation.resultVersion());
            if (exists) {
                return false;
            }
            rows.put(generation.id(), generation);
            return true;
        }

        @Override
        public OpinionMapGeneration save(OpinionMapGeneration generation) {
            rows.put(generation.id(), generation);
            return generation;
        }

        @Override
        public Optional<OpinionMapGeneration> findByIdForUpdate(
                OpinionMapGenerationId generationId
        ) {
            return Optional.ofNullable(rows.get(generationId));
        }

        @Override
        public Optional<OpinionMapGeneration> findByTaskResult(
                TaskId taskId,
                int resultVersion
        ) {
            return rows.values().stream()
                    .filter(row -> row.taskId().equals(taskId)
                            && row.resultVersion() == resultVersion)
                    .findFirst();
        }

        @Override
        public Optional<OpinionMapGeneration> findNextDispatchableForUpdate(
                Instant dueAt
        ) {
            return rows.values().stream()
                    .filter(row -> row.isDispatchableAt(dueAt))
                    .findFirst();
        }
    }
}
