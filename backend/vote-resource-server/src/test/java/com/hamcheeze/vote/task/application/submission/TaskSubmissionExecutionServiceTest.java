package com.hamcheeze.vote.task.application.submission;

import com.hamcheeze.vote.task.domain.common.TaskUserId;
import org.junit.jupiter.api.Test;

import java.util.List;

import static com.hamcheeze.vote.task.TaskTestFixtures.taskId;
import static com.hamcheeze.vote.task.TaskTestFixtures.userId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskSubmissionExecutionServiceTest {

    private final TaskSubmissionService submissions =
            mock(TaskSubmissionService.class);
    private final TaskSubmissionSimulation simulation =
            mock(TaskSubmissionSimulation.class);
    private final TaskSubmissionService.SubmitTaskCommand command =
            mock(TaskSubmissionService.SubmitTaskCommand.class);

    @Test
    void delegatesMatchingRequestToSimulation() {
        TaskUserId userId = userId();
        var delegateExecution = execution();
        when(command.taskId()).thenReturn(taskId());
        when(simulation.supports(userId, taskId())).thenReturn(true);
        when(simulation.submit(userId, "request-key", command))
                .thenReturn(delegateExecution);
        var service = new TaskSubmissionExecutionService(
                submissions, List.of(simulation));

        var execution = service.submit(userId, "request-key", command);

        assertThat(execution.outcome()).isSameAs(delegateExecution.outcome());
        assertThat(execution.replayed()).isFalse();
        assertThat(execution.simulated()).isTrue();
        verify(submissions, never()).submit(userId, "request-key", command);
    }

    @Test
    void delegatesNonMatchingRequestToPersistentService() {
        TaskUserId userId = userId();
        var delegateExecution = execution();
        when(command.taskId()).thenReturn(taskId());
        when(simulation.supports(userId, taskId())).thenReturn(false);
        when(submissions.submit(userId, "request-key", command))
                .thenReturn(delegateExecution);
        var service = new TaskSubmissionExecutionService(
                submissions, List.of(simulation));

        var execution = service.submit(userId, "request-key", command);

        assertThat(execution.outcome()).isSameAs(delegateExecution.outcome());
        assertThat(execution.simulated()).isFalse();
        verify(submissions).submit(userId, "request-key", command);
    }

    private TaskSubmissionService.SubmissionExecution execution() {
        return new TaskSubmissionService.SubmissionExecution(
                mock(TaskSubmissionOutcome.class), false);
    }
}
