package com.hamcheeze.vote.task.infra.bootstrap;

import com.hamcheeze.vote.task.application.bootstrap.LocalTaskFixture;
import com.hamcheeze.vote.task.application.bootstrap.LocalTaskParticipationFixture;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionService;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.util.Objects;

/** Prepares one submitted and one available open Task for the local frontend. */
@Service
@Profile("local")
@ConditionalOnExpression(
        "'${vote.task.bootstrap.enabled:false}' == 'true' and "
                + "'${vote.task.bootstrap.persona-ready-enabled:false}' == 'true' and "
                + "'${vote.task.bootstrap.participation-enabled:false}' == 'true' and "
                + "'${vote.survey.bootstrap.enabled:false}' == 'true' and "
                + "'${vote.integration.outbox.dispatcher-enabled:false}' == 'true' and "
                + "'${vote.persona.enabled:false}' == 'true' and "
                + "'${vote.persona.provider:http}' == 'fake'")
public class LocalTaskParticipationBootstrapService {

    private final TaskRepository tasks;
    private final TaskSubmissionRepository submissions;
    private final CurrentTaskPersonaQueryPort currentPersonas;
    private final TaskSubmissionService submissionService;
    private final String userSubject;

    public LocalTaskParticipationBootstrapService(
            TaskRepository tasks,
            TaskSubmissionRepository submissions,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskSubmissionService submissionService,
            @Value("${vote.task.bootstrap.persona-subject:local-user-1}")
            String userSubject
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.currentPersonas = Objects.requireNonNull(
                currentPersonas, "currentPersonas");
        this.submissionService = Objects.requireNonNull(
                submissionService, "submissionService");
        if (userSubject == null || userSubject.isBlank()) {
            throw new IllegalArgumentException(
                    "local Task participation subject must not be blank");
        }
        this.userSubject = userSubject.strip();
    }

    public LocalTaskParticipationBootstrapResult initialize() {
        TaskUserId userId = new TaskUserId(userSubject);
        if (submissions.findByUserAndTask(
                userId, LocalTaskFixture.TASK_ID).isPresent()) {
            return LocalTaskParticipationBootstrapResult.ALREADY_PRESENT;
        }

        var task = tasks.findById(LocalTaskFixture.TASK_ID)
                .orElseThrow(() -> failure(
                        "the first local Task does not exist"));
        var persona = currentPersonas.findCurrentUsable(userId)
                .orElseThrow(() -> failure(
                        "a ready local Persona does not exist"));
        var execution = submissionService.submit(
                userId,
                LocalTaskParticipationFixture
                        .TASK_SUBMISSION_IDEMPOTENCY_KEY,
                new TaskSubmissionService.SubmitTaskCommand(
                        task.id(), persona.generationId(), persona.versionId(),
                        null, LocalTaskParticipationFixture.answer(task)));
        if (!execution.outcome().succeeded()) {
            if (submissions.findByUserAndTask(
                    userId, task.id()).isPresent()) {
                return LocalTaskParticipationBootstrapResult.ALREADY_PRESENT;
            }
            throw failure("Task submission failed with "
                    + execution.outcome().code());
        }
        return execution.replayed()
                ? LocalTaskParticipationBootstrapResult.ALREADY_PRESENT
                : LocalTaskParticipationBootstrapResult.CREATED;
    }

    public String userSubject() {
        return userSubject;
    }

    private LocalTaskParticipationBootstrapException failure(String detail) {
        return new LocalTaskParticipationBootstrapException(
                "local Task participation bootstrap failed for subject "
                        + userSubject + ": " + detail);
    }
}
