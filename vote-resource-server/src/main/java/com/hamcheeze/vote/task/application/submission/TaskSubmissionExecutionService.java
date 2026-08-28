package com.hamcheeze.vote.task.application.submission;

import com.hamcheeze.vote.task.domain.common.TaskUserId;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;

@Service
public class TaskSubmissionExecutionService {

    private final TaskSubmissionService submissions;
    private final List<TaskSubmissionSimulation> simulations;

    public TaskSubmissionExecutionService(
            TaskSubmissionService submissions,
            List<TaskSubmissionSimulation> simulations
    ) {
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.simulations = List.copyOf(Objects.requireNonNull(
                simulations, "simulations"));
    }

    public SubmissionExecution submit(
            TaskUserId userId,
            String idempotencyKey,
            TaskSubmissionService.SubmitTaskCommand command
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(command, "command");
        TaskSubmissionSimulation simulation = simulations.stream()
                .filter(candidate -> candidate.supports(
                        userId, command.taskId()))
                .findFirst()
                .orElse(null);
        TaskSubmissionService.SubmissionExecution execution =
                simulation == null
                        ? submissions.submit(userId, idempotencyKey, command)
                        : simulation.submit(userId, idempotencyKey, command);
        return new SubmissionExecution(
                execution.outcome(), execution.replayed(), simulation != null);
    }

    public record SubmissionExecution(
            TaskSubmissionOutcome outcome,
            boolean replayed,
            boolean simulated
    ) {
        public SubmissionExecution {
            Objects.requireNonNull(outcome, "outcome");
        }
    }
}
