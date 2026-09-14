package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationManualRequestRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.application.result.TaskResultManifestFinalizer;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationStatus;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.actorId;
import static com.hamcheeze.vote.task.TaskTestFixtures.historyId;
import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpinionMapGenerationAdminServiceTest {

    private static final Instant REQUESTED_AT =
            Instant.parse("2026-01-01T00:01:00Z");
    private static final UUID REQUEST_ID = new UUID(0, 90);

    private final TaskRepository tasks = mock(TaskRepository.class);
    private final TaskResultManifestRepository manifests =
            mock(TaskResultManifestRepository.class);
    private final TaskResultManifestFinalizer finalizer =
            mock(TaskResultManifestFinalizer.class);
    private final OpinionMapGenerationStateService state =
            mock(OpinionMapGenerationStateService.class);
    private final OpinionMapGenerationRepository generations =
            mock(OpinionMapGenerationRepository.class);
    private final OpinionMapGenerationManualRequestRepository requests =
            mock(OpinionMapGenerationManualRequestRepository.class);

    private OpinionMapGenerationAdminService service;

    @BeforeEach
    void setUp() {
        service = new OpinionMapGenerationAdminService(
                tasks,
                manifests,
                finalizer,
                state,
                generations,
                requests,
                policy(true),
                Clock.fixed(REQUESTED_AT, ZoneOffset.UTC),
                () -> REQUEST_ID);
        when(generations.save(any(OpinionMapGeneration.class)))
                .thenAnswer(invocation ->
                        (OpinionMapGeneration) invocation.getArgument(0));
        when(requests.insert(any(
                OpinionMapGenerationManualRequest.class)))
                .thenAnswer(invocation ->
                        (OpinionMapGenerationManualRequest)
                                invocation.getArgument(0));
    }

    @Test
    void retriesUnavailableGenerationAndPreservesFailureAudit() {
        Task task = closedTask();
        TaskResultManifest manifest = manifest(task);
        OpinionMapGeneration generation = unavailable(task, manifest);
        when(tasks.findByIdForUpdate(task.id())).thenReturn(Optional.of(task));
        when(manifests.findByTaskId(task.id()))
                .thenReturn(Optional.of(manifest));
        when(generations.findByTaskResultForUpdate(task.id(), 1))
                .thenReturn(Optional.of(generation));

        var execution = service.request(task.id(), "admin-a");

        assertThat(execution.action())
                .isEqualTo(OpinionMapGenerationAdminService.Action.RETRIED);
        assertThat(execution.generation().status())
                .isEqualTo(OpinionMapGenerationStatus.PENDING);
        assertThat(execution.generation().attemptCount()).isZero();
        ArgumentCaptor<OpinionMapGenerationManualRequest> audit =
                ArgumentCaptor.forClass(
                        OpinionMapGenerationManualRequest.class);
        verify(requests).insert(audit.capture());
        assertThat(audit.getValue()).satisfies(request -> {
            assertThat(request.requestId()).isEqualTo(REQUEST_ID);
            assertThat(request.action())
                    .isEqualTo(
                            OpinionMapGenerationManualRequest.Action.RETRIED);
            assertThat(request.previousAttemptCount()).isEqualTo(1);
            assertThat(request.previousErrorCode())
                    .isEqualTo("PROVIDER_TIMEOUT");
            assertThat(request.requestedBy()).isEqualTo("admin-a");
            assertThat(request.requestedAt()).isEqualTo(REQUESTED_AT);
        });
    }

    @Test
    void finalizesAndCreatesGenerationForHistoricalClosedTask() {
        Task task = closedTask();
        TaskResultManifest manifest = manifest(task);
        OpinionMapGeneration generation = pending(task, manifest);
        when(tasks.findByIdForUpdate(task.id())).thenReturn(Optional.of(task));
        when(manifests.findByTaskId(task.id())).thenReturn(Optional.empty());
        when(finalizer.finalizeResult(task)).thenReturn(manifest);
        when(generations.findByTaskResultForUpdate(task.id(), 1))
                .thenReturn(Optional.of(generation));

        var execution = service.request(task.id(), "admin-a");

        assertThat(execution.action())
                .isEqualTo(OpinionMapGenerationAdminService.Action.CREATED);
        assertThat(execution.generation().status())
                .isEqualTo(OpinionMapGenerationStatus.PENDING);
        verify(finalizer).finalizeResult(task);
        ArgumentCaptor<OpinionMapGenerationManualRequest> audit =
                ArgumentCaptor.forClass(
                        OpinionMapGenerationManualRequest.class);
        verify(requests).insert(audit.capture());
        assertThat(audit.getValue().action())
                .isEqualTo(OpinionMapGenerationManualRequest.Action.CREATED);
    }

    @Test
    void createsGenerationWhenHistoricalManifestAlreadyExists() {
        Task task = closedTask();
        TaskResultManifest manifest = manifest(task);
        OpinionMapGeneration generation = pending(task, manifest);
        when(tasks.findByIdForUpdate(task.id())).thenReturn(Optional.of(task));
        when(manifests.findByTaskId(task.id()))
                .thenReturn(Optional.of(manifest));
        when(generations.findByTaskResultForUpdate(task.id(), 1))
                .thenReturn(Optional.empty(), Optional.of(generation));
        when(state.enqueue(manifest)).thenReturn(true);

        var execution = service.request(task.id(), "admin-a");

        assertThat(execution.action())
                .isEqualTo(OpinionMapGenerationAdminService.Action.CREATED);
        verify(state).enqueue(manifest);
        verify(requests).insert(any(
                OpinionMapGenerationManualRequest.class));
    }

    @Test
    void doesNotDuplicateAnInProgressGeneration() {
        Task task = closedTask();
        TaskResultManifest manifest = manifest(task);
        OpinionMapGeneration generation = pending(task, manifest);
        when(tasks.findByIdForUpdate(task.id())).thenReturn(Optional.of(task));
        when(manifests.findByTaskId(task.id()))
                .thenReturn(Optional.of(manifest));
        when(generations.findByTaskResultForUpdate(task.id(), 1))
                .thenReturn(Optional.of(generation));

        var execution = service.request(task.id(), "admin-a");

        assertThat(execution.action())
                .isEqualTo(OpinionMapGenerationAdminService.Action.UNCHANGED);
        verify(generations, never()).save(
                any(OpinionMapGeneration.class));
        verify(requests, never()).insert(any(
                OpinionMapGenerationManualRequest.class));
    }

    @Test
    void rejectsTaskWithoutAResultEligibleClosure() {
        Task task = openTask();
        when(tasks.findByIdForUpdate(task.id())).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> service.request(task.id(), "admin-a"))
                .isInstanceOf(TaskDomainException.class)
                .satisfies(exception -> assertThat(
                        ((TaskDomainException) exception).violation().code())
                        .isEqualTo("TASK_RESULT_NOT_ELIGIBLE"));
    }

    private static Task closedTask() {
        Task task = openTask();
        task.closeEarly(
                historyId(20), actorId(), "테스트 종료",
                NOW.plusSeconds(20));
        return task;
    }

    private static TaskResultManifest manifest(Task task) {
        return new TaskResultManifest(
                task.id(),
                1,
                "task-result-view/v1",
                task.closedAt(),
                3,
                "a".repeat(64),
                task.closedAt());
    }

    private static OpinionMapGeneration pending(
            Task task,
            TaskResultManifest manifest
    ) {
        return OpinionMapGeneration.pending(
                new OpinionMapGenerationId(new UUID(0, 80)),
                task.id(),
                manifest.resultVersion(),
                manifest.bodySha256(),
                "task-result-prompt/v1",
                task.closedAt());
    }

    private static OpinionMapGeneration unavailable(
            Task task,
            TaskResultManifest manifest
    ) {
        OpinionMapGeneration generation = pending(task, manifest);
        UUID claimId = new UUID(0, 81);
        generation.claim(
                claimId,
                task.closedAt(),
                Duration.ofSeconds(90),
                1);
        generation.fail(
                claimId,
                "PROVIDER_TIMEOUT",
                true,
                1,
                Duration.ofSeconds(30),
                task.closedAt().plusSeconds(5));
        return generation;
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
