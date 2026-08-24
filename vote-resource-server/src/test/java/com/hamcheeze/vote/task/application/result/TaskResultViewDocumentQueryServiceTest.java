package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaskResultViewDocumentQueryServiceTest {

    private static final TaskId TASK_ID = new TaskId(
            new UUID(0, 1));
    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-24T00:00:00Z");
    private static final String HASH = "a".repeat(64);

    @Mock
    private TaskResultManifestRepository manifests;

    @Mock
    private TaskResultViewQueryService views;

    @Mock
    private TaskResultViewRenderer renderer;

    private TaskResultViewDocumentQueryService service;

    @BeforeEach
    void setUp() {
        service = new TaskResultViewDocumentQueryService(
                new TaskResultViewVerificationService(
                        manifests, views, renderer));
    }

    @Test
    void returnsOnlyARecalculatedDocumentMatchingItsManifest() {
        TaskResultViewV1 view = view();
        when(manifests.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(manifest(HASH, 0)));
        when(views.findByTaskId(TASK_ID)).thenReturn(Optional.of(view));
        when(renderer.render(view)).thenReturn(
                new RenderedTaskResultView("jsonl\n", HASH));

        TaskResultViewDocument document = service.findByTaskId(TASK_ID)
                .orElseThrow();

        assertThat(document.resultVersion()).isEqualTo(1);
        assertThat(document.schemaVersion())
                .isEqualTo(TaskResultViewV1.SCHEMA_VERSION);
        assertThat(document.closedAt()).isEqualTo(CLOSED_AT);
        assertThat(document.responseCount()).isZero();
        assertThat(document.bodySha256()).isEqualTo(HASH);
        assertThat(document.content()).isEqualTo("jsonl\n");
    }

    @Test
    void anUnfinalizedTaskHasNoResultDocument() {
        when(manifests.findByTaskId(TASK_ID)).thenReturn(Optional.empty());

        assertThat(service.findByTaskId(TASK_ID)).isEmpty();

        verifyNoInteractions(views, renderer);
    }

    @Test
    void rejectsARecalculatedBodyDifferentFromTheManifest() {
        TaskResultViewV1 view = view();
        when(manifests.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(manifest(HASH, 0)));
        when(views.findByTaskId(TASK_ID)).thenReturn(Optional.of(view));
        when(renderer.render(view)).thenReturn(
                new RenderedTaskResultView("changed\n", "b".repeat(64)));

        assertThatThrownBy(() -> service.findByTaskId(TASK_ID))
                .isInstanceOf(TaskResultViewIntegrityException.class)
                .hasMessageContaining("bodySha256 does not match");
    }

    @Test
    void rejectsResponseCountDriftBeforeReturningContent() {
        TaskResultViewV1 view = view();
        when(manifests.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(manifest(HASH, 1)));
        when(views.findByTaskId(TASK_ID)).thenReturn(Optional.of(view));

        assertThatThrownBy(() -> service.findByTaskId(TASK_ID))
                .isInstanceOf(TaskResultViewIntegrityException.class)
                .hasMessageContaining("responseCount does not match");
        verifyNoInteractions(renderer);
    }

    @Test
    void treatsAMissingFinalizedTaskAsIntegrityFailure() {
        when(manifests.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(manifest(HASH, 0)));
        when(views.findByTaskId(TASK_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findByTaskId(TASK_ID))
                .isInstanceOf(TaskResultViewIntegrityException.class)
                .hasMessageContaining("finalized task does not exist");
        verifyNoInteractions(renderer);
    }

    private static TaskResultManifest manifest(
            String hash,
            int responseCount
    ) {
        return new TaskResultManifest(
                TASK_ID,
                TaskResultViewV1.RESULT_VERSION,
                TaskResultViewV1.SCHEMA_VERSION,
                CLOSED_AT,
                responseCount,
                hash,
                CLOSED_AT);
    }

    private static TaskResultViewV1 view() {
        return new TaskResultViewV1(
                TaskResultViewV1.RESULT_VERSION,
                CLOSED_AT,
                TaskClosureType.EARLY_CLOSED,
                new TaskData("결과 과업", null),
                new QuestionData(
                        TaskQuestionType.SINGLE_CHOICE,
                        "어떤 선택지를 선호하나요?",
                        null),
                List.of(new OptionData(1, "첫 번째")),
                List.of());
    }
}
