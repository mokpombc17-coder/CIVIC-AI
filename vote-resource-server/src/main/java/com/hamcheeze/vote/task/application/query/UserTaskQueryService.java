package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.task.Task;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class UserTaskQueryService {

    private final TaskRepository tasks;
    private final TaskSubmissionRepository submissions;
    private final Clock clock;

    @Autowired
    public UserTaskQueryService(
            TaskRepository tasks,
            TaskSubmissionRepository submissions
    ) {
        this(tasks, submissions, Clock.systemUTC());
    }

    UserTaskQueryService(
            TaskRepository tasks,
            TaskSubmissionRepository submissions,
            Clock clock
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional(readOnly = true)
    public List<UserTaskSummary> findOpenTasks(TaskUserId userId) {
        Objects.requireNonNull(userId, "userId");
        Instant now = clock.instant();
        return tasks.findAll().stream()
                .filter(task -> task.isOpenAt(now))
                .sorted(Comparator
                        .comparing((Task task) ->
                                task.schedule().scheduledCloseAt())
                        .thenComparing(task -> task.id().value()))
                .map(task -> toSummary(task, submission(userId, task.id())))
                .toList();
    }

    @Transactional(readOnly = true)
    public Optional<UserTaskDetail> findOpenTask(
            TaskUserId userId,
            TaskId taskId
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(taskId, "taskId");
        Instant now = clock.instant();
        return tasks.findById(taskId)
                .filter(task -> task.isOpenAt(now))
                .map(task -> new UserTaskDetail(
                        task,
                        task.schedule().scheduledCloseAt(),
                        submission(userId, task.id())));
    }

    private SubmissionState submission(TaskUserId userId, TaskId taskId) {
        return submissions.findByUserAndTask(userId, taskId)
                .map(SubmissionState::submitted)
                .orElseGet(SubmissionState::notSubmitted);
    }

    private static UserTaskSummary toSummary(
            Task task,
            SubmissionState submission
    ) {
        return new UserTaskSummary(
                task.id(),
                task.title(),
                task.description(),
                task.questions().size(),
                task.openedAt(),
                task.schedule().scheduledCloseAt(),
                submission);
    }

    public record UserTaskSummary(
            TaskId taskId,
            String title,
            String description,
            int questionCount,
            Instant openedAt,
            Instant closesAt,
            SubmissionState submission
    ) {
        public UserTaskSummary {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(title, "title");
            if (questionCount < 1) {
                throw new IllegalArgumentException(
                        "questionCount must be positive");
            }
            Objects.requireNonNull(openedAt, "openedAt");
            Objects.requireNonNull(closesAt, "closesAt");
            Objects.requireNonNull(submission, "submission");
        }
    }

    public record UserTaskDetail(
            Task task,
            Instant closesAt,
            SubmissionState submission
    ) {
        public UserTaskDetail {
            Objects.requireNonNull(task, "task");
            Objects.requireNonNull(closesAt, "closesAt");
            Objects.requireNonNull(submission, "submission");
        }
    }

    public record SubmissionState(
            boolean submitted,
            TaskSubmissionId submissionId,
            Instant submittedAt
    ) {
        public SubmissionState {
            if (submitted != (submissionId != null && submittedAt != null)) {
                throw new IllegalArgumentException(
                        "submitted state and metadata must be consistent");
            }
        }

        static SubmissionState submitted(TaskSubmission submission) {
            return new SubmissionState(
                    true, submission.id(), submission.submittedAt());
        }

        static SubmissionState notSubmitted() {
            return new SubmissionState(false, null, null);
        }
    }
}
