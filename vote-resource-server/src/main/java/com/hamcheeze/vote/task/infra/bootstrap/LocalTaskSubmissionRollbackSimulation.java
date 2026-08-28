package com.hamcheeze.vote.task.infra.bootstrap;

import com.hamcheeze.vote.task.application.bootstrap.LocalTaskFixture;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionSimulation;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Objects;

/**
 * Executes the real submission flow and rolls it back so local fixture Tasks
 * remain available for repeated frontend happy-path checks.
 */
@Component
@Profile("local")
@ConditionalOnExpression(
        "'${vote.task.bootstrap.enabled:false}' == 'true' and "
                + "'${vote.task.bootstrap.submission-simulation-enabled:false}'"
                + " == 'true'")
public class LocalTaskSubmissionRollbackSimulation
        implements TaskSubmissionSimulation {

    private final TaskSubmissionService submissions;
    private final TransactionTemplate transactions;
    private final String userSubject;

    public LocalTaskSubmissionRollbackSimulation(
            TaskSubmissionService submissions,
            PlatformTransactionManager transactionManager,
            @Value("${vote.task.bootstrap.persona-subject:local-user-1}")
            String userSubject
    ) {
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.transactions = new TransactionTemplate(Objects.requireNonNull(
                transactionManager, "transactionManager"));
        if (userSubject == null || userSubject.isBlank()) {
            throw new IllegalArgumentException(
                    "local Task simulation subject must not be blank");
        }
        this.userSubject = userSubject.strip();
    }

    @Override
    public boolean supports(TaskUserId userId, TaskId taskId) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(taskId, "taskId");
        return userSubject.equals(userId.value())
                && (LocalTaskFixture.TASK_ID.equals(taskId)
                || LocalTaskFixture.SECOND_TASK_ID.equals(taskId));
    }

    @Override
    public TaskSubmissionService.SubmissionExecution submit(
            TaskUserId userId,
            String idempotencyKey,
            TaskSubmissionService.SubmitTaskCommand command
    ) {
        TaskSubmissionService.SubmissionExecution execution =
                transactions.execute(status -> {
                    TaskSubmissionService.SubmissionExecution result =
                            submissions.submit(
                                    userId, idempotencyKey, command);
                    status.setRollbackOnly();
                    return result;
                });
        return Objects.requireNonNull(execution, "submission execution");
    }
}
