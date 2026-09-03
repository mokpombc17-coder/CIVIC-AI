package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationProvider;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.Objects;

@Service
public class TaskPreparationService {

    private final TaskPreparationStateService states;
    private final ObjectProvider<TaskPreparationProvider> providers;

    public TaskPreparationService(
            TaskPreparationStateService states,
            ObjectProvider<TaskPreparationProvider> providers
    ) {
        this.states = Objects.requireNonNull(states, "states");
        this.providers = Objects.requireNonNull(providers, "providers");
    }

    public TaskPreparationReceipt prepare(TaskId taskId) {
        return execute(states.claim(taskId));
    }

    private TaskPreparationReceipt execute(TaskPreparationClaim claim) {
        if (!claim.requiresProviderCall()) {
            return TaskPreparationReceipt.from(claim.existing(), true);
        }

        TaskPreparationCommand command = claim.command();
        try {
            TaskPreparationProviderResult result = provider().prepare(command);
            TaskPreparationRecord preparation =
                    states.applyProviderResult(command, result);
            return TaskPreparationReceipt.from(
                    preparation, result.replayed());
        } catch (TaskPreparationProviderException exception) {
            states.markFailed(command, exception);
            throw publicFailure(exception);
        }
    }

    private TaskPreparationProvider provider() {
        TaskPreparationProvider provider = providers.getIfAvailable();
        if (provider == null) {
            throw new TaskPreparationProviderException(
                    true,
                    null,
                    "TASK_PREPARATION_PROVIDER_UNAVAILABLE",
                    "Task preparation provider is unavailable",
                    null);
        }
        return provider;
    }

    private static TaskDomainException publicFailure(
            TaskPreparationProviderException exception
    ) {
        return TaskDomainException.invariant(
                exception.retryable()
                        ? "TASK_PREPARATION_UNAVAILABLE"
                        : "TASK_PREPARATION_REJECTED",
                "taskPreparation",
                exception.retryable()
                        ? "Task preparation is temporarily unavailable"
                        : "Runtime rejected the Task content");
    }
}
