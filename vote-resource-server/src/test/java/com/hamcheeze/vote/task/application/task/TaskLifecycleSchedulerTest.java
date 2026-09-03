package com.hamcheeze.vote.task.application.task;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationService;
import com.hamcheeze.vote.task.application.task.TaskAdministrationService.TaskLifecycleCandidate;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskLifecycleSchedulerTest {

    private final TaskAdministrationService tasks =
            mock(TaskAdministrationService.class);
    private final TaskPreparationService preparations =
            mock(TaskPreparationService.class);

    @Test
    void failedVerificationIsDeferredWithoutBlockingNextCandidate() {
        TaskLifecycleCandidate unavailable = candidate(
                TaskStatus.SCHEDULED, true);
        TaskLifecycleCandidate deadline = candidate(
                TaskStatus.OPEN, false);
        TaskLifecycleChange change = mock(TaskLifecycleChange.class);
        when(tasks.findNextLifecycleCandidate()).thenReturn(
                Optional.of(unavailable),
                Optional.of(deadline),
                Optional.empty());
        doThrow(TaskDomainException.invariant(
                        "TASK_PREPARATION_VERIFICATION_UNAVAILABLE",
                        "taskPreparation",
                        "runtime unavailable"))
                .when(preparations)
                .verifyReady(unavailable.taskId());
        when(tasks.transitionLifecycleCandidate(deadline))
                .thenReturn(Optional.of(change));

        int transitioned = scheduler().transitionAvailable();

        assertThat(transitioned).isEqualTo(1);
        verify(preparations).deferPublicationVerification(
                unavailable.taskId());
        verify(tasks, never()).transitionLifecycleCandidate(unavailable);
        verify(tasks).transitionLifecycleCandidate(deadline);
    }

    @Test
    void scheduledCandidateIsVerifiedImmediatelyBeforeTransition() {
        TaskLifecycleCandidate scheduled = candidate(
                TaskStatus.SCHEDULED, true);
        when(tasks.findNextLifecycleCandidate()).thenReturn(
                Optional.of(scheduled), Optional.empty());
        when(tasks.transitionLifecycleCandidate(scheduled))
                .thenReturn(Optional.of(mock(TaskLifecycleChange.class)));

        assertThat(scheduler().transitionAvailable()).isEqualTo(1);

        verify(preparations).verifyReady(scheduled.taskId());
        verify(preparations, never()).deferPublicationVerification(
                scheduled.taskId());
        verify(tasks).transitionLifecycleCandidate(scheduled);
    }

    private TaskLifecycleScheduler scheduler() {
        return new TaskLifecycleScheduler(tasks, preparations, 10);
    }

    private static TaskLifecycleCandidate candidate(
            TaskStatus status,
            boolean requiresPreparationVerification
    ) {
        return new TaskLifecycleCandidate(
                new TaskId(UUID.randomUUID()),
                status,
                requiresPreparationVerification);
    }
}
