package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

@Service
public class MyTaskSubmissionQueryService {

    private final TaskSubmissionRepository submissions;
    private final TaskRepository tasks;

    public MyTaskSubmissionQueryService(
            TaskSubmissionRepository submissions,
            TaskRepository tasks
    ) {
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.tasks = Objects.requireNonNull(tasks, "tasks");
    }

    @Transactional(readOnly = true)
    public Optional<MyTaskSubmission> findByTask(
            TaskUserId userId,
            TaskId taskId
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(taskId, "taskId");
        return submissions.findByUserAndTask(userId, taskId)
                .map(this::toView);
    }

    @Transactional(readOnly = true)
    public Optional<MyTaskSubmission> findById(
            TaskUserId userId,
            TaskSubmissionId submissionId
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(submissionId, "submissionId");
        return submissions.findById(submissionId)
                .filter(submission -> submission.userId().equals(userId))
                .map(this::toView);
    }

    private MyTaskSubmission toView(TaskSubmission submission) {
        Task task = tasks.findById(submission.taskId())
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_SUBMISSION_TASK_NOT_FOUND",
                        "taskId",
                        "submission task does not exist"));
        TaskQuestion question = task.question(submission.questionId());
        return new MyTaskSubmission(
                submission.id(), submission.taskId(), task.title(),
                task.description(), submission.personaGenerationId(),
                submission.personaVersionId(), submission.predictionId(),
                submission.submittedAt(), submission.questionId(), question,
                submission.selectedOptionId(), submission.reasonSource(),
                submission.acceptedPredictedReasonId(),
                submission.finalReason());
    }

    public record MyTaskSubmission(
            TaskSubmissionId submissionId,
            TaskId taskId,
            String taskTitle,
            String taskDescription,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskPredictionId predictionId,
            Instant submittedAt,
            TaskQuestionId questionId,
            TaskQuestion question,
            TaskOptionId selectedOptionId,
            TaskReasonSource reasonSource,
            TaskPredictedReasonId acceptedPredictedReasonId,
            String finalReason
    ) {
        public MyTaskSubmission {
            Objects.requireNonNull(submissionId, "submissionId");
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(taskTitle, "taskTitle");
            Objects.requireNonNull(personaGenerationId, "personaGenerationId");
            Objects.requireNonNull(personaVersionId, "personaVersionId");
            Objects.requireNonNull(predictionId, "predictionId");
            Objects.requireNonNull(submittedAt, "submittedAt");
            Objects.requireNonNull(questionId, "questionId");
            Objects.requireNonNull(question, "question");
            Objects.requireNonNull(selectedOptionId, "selectedOptionId");
            Objects.requireNonNull(reasonSource, "reasonSource");
            Objects.requireNonNull(finalReason, "finalReason");
        }
    }
}
