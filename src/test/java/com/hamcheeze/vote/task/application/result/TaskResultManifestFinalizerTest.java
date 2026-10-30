package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationStateService;
import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultResponseReader;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;

import java.util.List;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.actorId;
import static com.hamcheeze.vote.task.TaskTestFixtures.draftTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.historyId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskResultManifestFinalizerTest {

    @Test
    void rendersClosedResultAndStoresOnlyItsManifest() {
        Task task = draftTask();
        task.openImmediately(
                historyId(1), NOW.plusSeconds(1_000), actorId(),
                null, NOW.plusSeconds(10));
        task.closeEarly(
                historyId(2), actorId(), null, NOW.plusSeconds(20));
        TaskResultResponseReader responses = mock(
                TaskResultResponseReader.class);
        TaskResultViewRenderer renderer = mock(TaskResultViewRenderer.class);
        TaskResultManifestRepository manifests = mock(
                TaskResultManifestRepository.class);
        OpinionMapGenerationStateService opinionMaps = mock(
                OpinionMapGenerationStateService.class);
        when(responses.findByTaskId(task.id())).thenReturn(List.of());
        when(renderer.render(any())).thenReturn(
                new RenderedTaskResultView("jsonl", "b".repeat(64)));
        when(manifests.insert(any())).thenAnswer(invocation ->
                invocation.getArgument(0));
        TaskResultManifestFinalizer finalizer =
                new TaskResultManifestFinalizer(
                        responses,
                        new TaskResultViewV1Assembler(),
                        renderer,
                        manifests,
                        opinionMaps);

        TaskResultManifest manifest = finalizer.finalizeResult(task);

        assertThat(manifest.taskId()).isEqualTo(task.id());
        assertThat(manifest.resultVersion())
                .isEqualTo(TaskResultViewV1.RESULT_VERSION);
        assertThat(manifest.schemaVersion())
                .isEqualTo(TaskResultViewV1.SCHEMA_VERSION);
        assertThat(manifest.closedAt()).isEqualTo(task.closedAt());
        assertThat(manifest.finalizedAt()).isEqualTo(task.closedAt());
        assertThat(manifest.responseCount()).isZero();
        assertThat(manifest.bodySha256()).isEqualTo("b".repeat(64));
        verify(renderer).render(any());
        verify(manifests).insert(manifest);
        verify(opinionMaps).enqueue(manifest);
    }
}
