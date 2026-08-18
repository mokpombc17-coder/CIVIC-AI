package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.submission.TaskAnswerSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswer;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class MyTaskSubmissionQueryService {

    private final TaskSubmissionRepository submissions;
    private final TaskRepository tasks;
    private final TaskPredictionRepository predictions;

    public MyTaskSubmissionQueryService(
            TaskSubmissionRepository submissions,
            TaskRepository tasks,
            TaskPredictionRepository predictions
    ) {
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.predictions = Objects.requireNonNull(
                predictions, "predictions");
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
                .orElseThrow(() -> missing(
                        "TASK_SUBMISSION_TASK_NOT_FOUND",
                        "taskId",
                        "submission task does not exist"));
        TaskPrediction prediction = predictions.findById(
                        submission.predictionId())
                .orElseThrow(() -> missing(
                        "TASK_SUBMISSION_PREDICTION_NOT_FOUND",
                        "predictionId",
                        "submission prediction does not exist"));
        Map<TaskPredictionCandidateId, TaskPredictionCandidate> candidates =
                prediction.candidates().stream().collect(Collectors.toMap(
                        TaskPredictionCandidate::id,
                        Function.identity()));
        List<MyTaskSubmissionAnswer> answers = submission.answers().stream()
                .map(answer -> toAnswer(task, candidates, answer))
                .toList();
        return new MyTaskSubmission(
                submission.id(),
                submission.taskId(),
                task.title(),
                task.description(),
                submission.personaGenerationId(),
                submission.predictionId(),
                submission.submittedAt(),
                answers);
    }

    private MyTaskSubmissionAnswer toAnswer(
            Task task,
            Map<TaskPredictionCandidateId, TaskPredictionCandidate> candidates,
            TaskSubmissionAnswer answer
    ) {
        TaskQuestion question = task.question(answer.questionId());
        AdoptedCandidate adopted = null;
        if (answer.adoptedPredictionCandidateId() != null) {
            TaskPredictionCandidate candidate = candidates.get(
                    answer.adoptedPredictionCandidateId());
            if (candidate == null) {
                throw missing(
                        "TASK_SUBMISSION_CANDIDATE_NOT_FOUND",
                        "adoptedPredictionCandidateId",
                        "adopted prediction candidate does not exist");
            }
            adopted = new AdoptedCandidate(
                    candidate.id(),
                    candidate.candidateOrder(),
                    candidate.rationale());
        }
        return new MyTaskSubmissionAnswer(
                answer.questionId(),
                question,
                answer.source(),
                adopted,
                answer.finalAnswerValue());
    }

    private static TaskDomainException missing(
            String code,
            String field,
            String message
    ) {
        return TaskDomainException.invariant(code, field, message);
    }

    public record MyTaskSubmission(
            TaskSubmissionId submissionId,
            TaskId taskId,
            String taskTitle,
            String taskDescription,
            TaskPersonaGenerationId personaGenerationId,
            TaskPredictionId predictionId,
            Instant submittedAt,
            List<MyTaskSubmissionAnswer> answers
    ) {
        public MyTaskSubmission {
            Objects.requireNonNull(submissionId, "submissionId");
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(taskTitle, "taskTitle");
            Objects.requireNonNull(personaGenerationId,
                    "personaGenerationId");
            Objects.requireNonNull(predictionId, "predictionId");
            Objects.requireNonNull(submittedAt, "submittedAt");
            answers = List.copyOf(Objects.requireNonNull(
                    answers, "answers"));
        }
    }

    public record MyTaskSubmissionAnswer(
            TaskQuestionId questionId,
            TaskQuestion question,
            TaskAnswerSource source,
            AdoptedCandidate adoptedCandidate,
            TaskAnswerValue finalAnswerValue
    ) {
        public MyTaskSubmissionAnswer {
            Objects.requireNonNull(questionId, "questionId");
            Objects.requireNonNull(question, "question");
            Objects.requireNonNull(source, "source");
            Objects.requireNonNull(finalAnswerValue, "finalAnswerValue");
        }
    }

    public record AdoptedCandidate(
            TaskPredictionCandidateId candidateId,
            int candidateOrder,
            String rationale
    ) {
        public AdoptedCandidate {
            Objects.requireNonNull(candidateId, "candidateId");
            if (candidateOrder < 1) {
                throw new IllegalArgumentException(
                        "candidateOrder must be positive");
            }
            Objects.requireNonNull(rationale, "rationale");
        }
    }
}
