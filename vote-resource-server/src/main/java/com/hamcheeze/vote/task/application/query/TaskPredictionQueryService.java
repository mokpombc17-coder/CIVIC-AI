package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.submission.TaskAnswerSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

@Service
public class TaskPredictionQueryService {

    private final TaskRepository tasks;
    private final CurrentTaskPersonaQueryPort currentPersonas;
    private final TaskPredictionRepository predictions;
    private final TaskSubmissionRepository submissions;
    private final Clock clock;

    @Autowired
    public TaskPredictionQueryService(
            TaskRepository tasks,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionRepository predictions,
            TaskSubmissionRepository submissions
    ) {
        this(tasks, currentPersonas, predictions, submissions,
                Clock.systemUTC());
    }

    TaskPredictionQueryService(
            TaskRepository tasks,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionRepository predictions,
            TaskSubmissionRepository submissions,
            Clock clock
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.currentPersonas = Objects.requireNonNull(
                currentPersonas, "currentPersonas");
        this.predictions = Objects.requireNonNull(
                predictions, "predictions");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional(readOnly = true)
    public TaskPredictionView findCurrent(
            TaskUserId userId,
            TaskId taskId
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(taskId, "taskId");
        var task = tasks.findById(taskId).orElse(null);
        if (task == null) {
            return TaskPredictionView.unavailable(
                    taskId, TaskPredictionViewState.TASK_NOT_FOUND);
        }
        if (!task.isOpenAt(clock.instant())) {
            return TaskPredictionView.unavailable(
                    taskId, TaskPredictionViewState.TASK_NOT_OPEN);
        }

        var submission = submissions.findByUserAndTask(userId, taskId)
                .orElse(null);
        if (submission != null) {
            return TaskPredictionView.submitted(
                    taskId, submission.id());
        }

        CurrentTaskPersona persona = currentPersonas
                .findCurrentUsable(userId)
                .orElse(null);
        if (persona == null) {
            return TaskPredictionView.unavailable(
                    taskId, TaskPredictionViewState.PERSONA_NOT_READY);
        }

        TaskPrediction prediction = predictions.findByIdentity(
                        userId, taskId, persona.generationId())
                .orElse(null);
        if (prediction == null) {
            return TaskPredictionView.notRequested(taskId, persona);
        }
        return TaskPredictionView.from(taskId, persona, prediction);
    }

    public enum TaskPredictionViewState {
        TASK_NOT_FOUND,
        TASK_NOT_OPEN,
        ALREADY_SUBMITTED,
        PERSONA_NOT_READY,
        NOT_REQUESTED,
        PENDING,
        PROCESSING,
        RETRY_WAIT,
        SUCCEEDED,
        FAILED
    }

    public record TaskPredictionView(
            TaskId taskId,
            TaskPredictionViewState state,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaId personaId,
            TaskPredictionId predictionId,
            TaskPredictionStatus predictionStatus,
            List<TaskPredictionCandidate> candidates,
            boolean waiting,
            boolean predictionRequestAllowed,
            boolean submissionAllowed,
            boolean predictedAnswerAllowed,
            boolean directAnswerAllowed,
            List<TaskAnswerSource> allowedAnswerSources,
            TaskSubmissionId submissionId,
            Instant nextRetryAt,
            Instant completedAt,
            String failureCode
    ) {
        public TaskPredictionView {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(state, "state");
            candidates = List.copyOf(Objects.requireNonNull(
                    candidates, "candidates"));
            allowedAnswerSources = List.copyOf(Objects.requireNonNull(
                    allowedAnswerSources, "allowedAnswerSources"));
        }

        static TaskPredictionView unavailable(
                TaskId taskId,
                TaskPredictionViewState state
        ) {
            return base(taskId, state, null, null,
                    null, null, List.of(), false, false,
                    false, false, false, List.of(), null,
                    null, null, null);
        }

        static TaskPredictionView submitted(
                TaskId taskId,
                TaskSubmissionId submissionId
        ) {
            return base(taskId, TaskPredictionViewState.ALREADY_SUBMITTED,
                    null, null, null, null, List.of(), false,
                    false, false, false, false, List.of(),
                    submissionId, null, null, null);
        }

        static TaskPredictionView notRequested(
                TaskId taskId,
                CurrentTaskPersona persona
        ) {
            return base(taskId, TaskPredictionViewState.NOT_REQUESTED,
                    persona.generationId(), persona.personaId(),
                    null, null, List.of(), false, true,
                    false, false, false, List.of(), null,
                    null, null, null);
        }

        static TaskPredictionView from(
                TaskId taskId,
                CurrentTaskPersona persona,
                TaskPrediction prediction
        ) {
            TaskPredictionStatus status = prediction.status();
            boolean succeeded = status == TaskPredictionStatus.SUCCEEDED;
            boolean failed = status == TaskPredictionStatus.FAILED;
            boolean waiting = !status.terminal();
            List<TaskAnswerSource> sources = succeeded
                    ? List.of(TaskAnswerSource.AI_ACCEPTED,
                    TaskAnswerSource.USER_ANSWERED)
                    : failed
                    ? List.of(TaskAnswerSource.USER_ANSWERED)
                    : List.of();
            return base(
                    taskId,
                    TaskPredictionViewState.valueOf(status.name()),
                    persona.generationId(),
                    persona.personaId(),
                    prediction.id(),
                    status,
                    prediction.candidates(),
                    waiting,
                    false,
                    status.terminal(),
                    succeeded,
                    status.terminal(),
                    sources,
                    null,
                    prediction.nextRetryAt(),
                    prediction.completedAt(),
                    prediction.lastError() == null
                            ? null : prediction.lastError().code());
        }

        private static TaskPredictionView base(
                TaskId taskId,
                TaskPredictionViewState state,
                TaskPersonaGenerationId personaGenerationId,
                TaskPersonaId personaId,
                TaskPredictionId predictionId,
                TaskPredictionStatus predictionStatus,
                List<TaskPredictionCandidate> candidates,
                boolean waiting,
                boolean predictionRequestAllowed,
                boolean submissionAllowed,
                boolean predictedAnswerAllowed,
                boolean directAnswerAllowed,
                List<TaskAnswerSource> allowedAnswerSources,
                TaskSubmissionId submissionId,
                Instant nextRetryAt,
                Instant completedAt,
                String failureCode
        ) {
            return new TaskPredictionView(
                    taskId, state, personaGenerationId, personaId,
                    predictionId, predictionStatus, candidates, waiting,
                    predictionRequestAllowed, submissionAllowed,
                    predictedAnswerAllowed, directAnswerAllowed,
                    allowedAnswerSources, submissionId, nextRetryAt,
                    completedAt, failureCode);
        }
    }
}
