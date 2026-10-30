package com.hamcheeze.vote.task.infra.bootstrap;

import com.hamcheeze.vote.task.application.bootstrap.LocalCompletedTaskFixture;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionService;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionWorker;
import com.hamcheeze.vote.task.application.result.MyTaskResultQueryService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionService;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.application.task.TaskAdministrationService;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.task.Task;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

/** Creates a participated, closed, and finalized local Task result fixture. */
@Service
@Profile("local")
@ConditionalOnExpression(
        "'${vote.task.bootstrap.enabled:false}' == 'true' and "
                + "'${vote.task.bootstrap.persona-ready-enabled:false}' == 'true' and "
                + "'${vote.task.bootstrap.participation-enabled:false}' == 'true' and "
                + "'${vote.survey.bootstrap.enabled:false}' == 'true' and "
                + "'${vote.integration.outbox.dispatcher-enabled:false}' == 'true' and "
                + "'${vote.persona.enabled:false}' == 'true' and "
                + "'${vote.persona.provider:http}' == 'fake' and "
                + "'${vote.task.prediction.enabled:false}' == 'true' and "
                + "'${vote.task.prediction.provider:http}' == 'fake'")
public class LocalCompletedTaskBootstrapService {

    private final TaskRepository tasks;
    private final TaskSubmissionRepository submissions;
    private final CurrentTaskPersonaQueryPort currentPersonas;
    private final TaskPredictionService predictions;
    private final TaskPredictionWorker predictionWorker;
    private final TaskSubmissionService submissionService;
    private final TaskAdministrationService administrationService;
    private final MyTaskResultQueryService taskResults;
    private final String userSubject;

    public LocalCompletedTaskBootstrapService(
            TaskRepository tasks,
            TaskSubmissionRepository submissions,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionService predictions,
            TaskPredictionWorker predictionWorker,
            TaskSubmissionService submissionService,
            TaskAdministrationService administrationService,
            MyTaskResultQueryService taskResults,
            @Value("${vote.task.bootstrap.persona-subject:local-user-1}")
            String userSubject
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.currentPersonas = Objects.requireNonNull(
                currentPersonas, "currentPersonas");
        this.predictions = Objects.requireNonNull(predictions, "predictions");
        this.predictionWorker = Objects.requireNonNull(
                predictionWorker, "predictionWorker");
        this.submissionService = Objects.requireNonNull(
                submissionService, "submissionService");
        this.administrationService = Objects.requireNonNull(
                administrationService, "administrationService");
        this.taskResults = Objects.requireNonNull(taskResults, "taskResults");
        if (userSubject == null || userSubject.isBlank()) {
            throw new IllegalArgumentException(
                    "local completed Task subject must not be blank");
        }
        this.userSubject = userSubject.strip();
    }

    @Transactional
    public LocalCompletedTaskBootstrapResult initialize() {
        TaskUserId userId = new TaskUserId(userSubject);
        var existing = tasks.findById(LocalCompletedTaskFixture.TASK_ID);
        if (existing.isPresent()) {
            validateReady(userId, existing.orElseThrow());
            return LocalCompletedTaskBootstrapResult.ALREADY_PRESENT;
        }

        Task task = LocalCompletedTaskFixture.draft();
        var opened = LocalCompletedTaskFixture.open(task);
        tasks.save(task);
        tasks.appendLifecycleHistory(List.of(opened));

        currentPersonas.findCurrentUsable(userId).orElseThrow(() -> failure(
                "a ready local Persona does not exist"));
        var prediction = predictions.ensureTaskPrediction(
                userId, task.id()).prediction();
        if (!prediction.status().terminal()) {
            predictionWorker.executeOne();
            prediction = predictions.findCurrentPrediction(userId, task.id())
                    .orElseThrow(() -> failure(
                            "the local completed Task prediction disappeared"));
        }
        if (prediction.status() != TaskPredictionStatus.SUCCEEDED) {
            throw failure("Task prediction failed with status "
                    + prediction.status());
        }
        var answer = LocalCompletedTaskFixture.answer(task);
        var execution = submissionService.submit(
                userId,
                LocalCompletedTaskFixture.SUBMISSION_IDEMPOTENCY_KEY,
                new TaskSubmissionService.SubmitTaskCommand(
                        task.id(), answer.selectedOptionId(),
                        TaskReasonSource.USER_WRITTEN,
                        null, answer.reason()));
        if (!execution.outcome().succeeded()) {
            throw failure("Task submission failed with "
                    + execution.outcome().code());
        }

        var closed = administrationService.close(
                task.id(),
                LocalCompletedTaskFixture.CLOSE_REASON,
                LocalCompletedTaskFixture.ACTOR).task();
        validateReady(userId, closed);
        return LocalCompletedTaskBootstrapResult.CREATED;
    }

    public String userSubject() {
        return userSubject;
    }

    private void validateReady(TaskUserId userId, Task task) {
        if (!LocalCompletedTaskFixture.matchesClosed(task)) {
            throw failure("the completed local Task does not match");
        }
        if (submissions.findByUserAndTask(userId, task.id()).isEmpty()) {
            throw failure("the completed local Task submission does not exist");
        }
        if (taskResults.findByTask(userId, task.id()).isEmpty()) {
            throw failure("the completed local Task result is not available");
        }
    }

    private LocalCompletedTaskBootstrapException failure(String detail) {
        return new LocalCompletedTaskBootstrapException(
                "local completed Task bootstrap failed for subject "
                        + userSubject + ": " + detail);
    }
}
