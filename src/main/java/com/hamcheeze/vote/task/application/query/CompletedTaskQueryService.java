package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.CompletedTaskReader;
import com.hamcheeze.vote.task.application.port.out.CompletedTaskReader.CompletedTaskRow;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class CompletedTaskQueryService {

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;

    private final CompletedTaskReader completedTasks;
    private final CompletedTaskCursorCodec cursors;

    public CompletedTaskQueryService(
            CompletedTaskReader completedTasks,
            CompletedTaskCursorCodec cursors
    ) {
        this.completedTasks = Objects.requireNonNull(
                completedTasks, "completedTasks");
        this.cursors = Objects.requireNonNull(cursors, "cursors");
    }

    public CompletedTaskPage findByUser(
            TaskUserId userId,
            String cursor,
            int size
    ) {
        Objects.requireNonNull(userId, "userId");
        if (size < 1 || size > MAX_SIZE) {
            throw new IllegalArgumentException(
                    "completed task page size must be between 1 and "
                            + MAX_SIZE);
        }
        Optional<CompletedTaskCursor> decodedCursor = cursor == null
                ? Optional.empty()
                : Optional.of(cursors.decode(cursor));
        List<CompletedTaskRow> rows = completedTasks.findByUser(
                userId, decodedCursor, size + 1);
        boolean hasNext = rows.size() > size;
        List<CompletedTaskSummary> items = rows.stream()
                .limit(size)
                .map(CompletedTaskSummary::from)
                .toList();
        String nextCursor = hasNext
                ? cursors.encode(new CompletedTaskCursor(
                        items.getLast().closedAt(),
                        items.getLast().taskId()))
                : null;
        return new CompletedTaskPage(items, nextCursor);
    }

    public record CompletedTaskPage(
            List<CompletedTaskSummary> items,
            String nextCursor
    ) {
        public CompletedTaskPage {
            items = List.copyOf(Objects.requireNonNull(items, "items"));
        }
    }

    public record CompletedTaskSummary(
            TaskId taskId,
            String title,
            String description,
            Instant openedAt,
            Instant closedAt,
            TaskClosureType closureType,
            MySubmission mySubmission
    ) {
        public CompletedTaskSummary {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(openedAt, "openedAt");
            Objects.requireNonNull(closedAt, "closedAt");
            Objects.requireNonNull(closureType, "closureType");
            Objects.requireNonNull(mySubmission, "mySubmission");
        }

        private static CompletedTaskSummary from(CompletedTaskRow row) {
            return new CompletedTaskSummary(
                    row.taskId(),
                    row.title(),
                    row.description(),
                    row.openedAt(),
                    row.closedAt(),
                    row.closureType(),
                    new MySubmission(
                            row.submissionId(), row.submittedAt()));
        }
    }

    public record MySubmission(
            TaskSubmissionId submissionId,
            Instant submittedAt
    ) {
        public MySubmission {
            Objects.requireNonNull(submissionId, "submissionId");
            Objects.requireNonNull(submittedAt, "submittedAt");
        }
    }
}
