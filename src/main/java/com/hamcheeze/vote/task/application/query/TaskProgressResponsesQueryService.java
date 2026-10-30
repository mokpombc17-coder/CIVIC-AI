package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskProgressResponseReader;
import com.hamcheeze.vote.task.application.port.out.TaskProgressResponseReader.SubmissionCursor;
import com.hamcheeze.vote.task.application.port.out.TaskProgressResponseReader.SubmissionRow;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class TaskProgressResponsesQueryService {

    public static final int DEFAULT_LIMIT = 100;
    public static final int MAX_LIMIT = 100;

    private static final String CURSOR_VERSION = "v1";
    private static final String CURSOR_SEPARATOR = "\n";
    private static final int CURSOR_FIELD_COUNT = 4;
    private static final int MAX_ENCODED_CURSOR_LENGTH = 512;
    private static final String INVALID_CURSOR_MESSAGE =
            "task progress responses cursor is invalid";

    private final TaskRepository tasks;
    private final TaskProgressResponseReader responses;
    private final Clock clock;

    @Autowired
    public TaskProgressResponsesQueryService(
            TaskRepository tasks,
            TaskProgressResponseReader responses
    ) {
        this(tasks, responses, Clock.systemUTC());
    }

    TaskProgressResponsesQueryService(
            TaskRepository tasks,
            TaskProgressResponseReader responses,
            Clock clock
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.responses = Objects.requireNonNull(responses, "responses");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional(readOnly = true)
    public Optional<TaskProgressResponsePage> findByTaskId(
            TaskId taskId,
            String cursor,
            int limit
    ) {
        Objects.requireNonNull(taskId, "taskId");
        validateLimit(limit);
        Optional<Task> found = tasks.findById(taskId);
        if (found.isEmpty()) {
            return Optional.empty();
        }

        Task task = found.orElseThrow();
        if (task.status() != TaskStatus.OPEN) {
            throw TaskDomainException.invariant(
                    "TASK_PROGRESS_RESPONSES_NOT_AVAILABLE",
                    "task.status",
                    "progress responses are available only while task is open");
        }

        Optional<SubmissionCursor> decoded = cursor == null
                ? Optional.empty()
                : Optional.of(decode(cursor));
        decoded.ifPresent(value -> {
            if (!taskId.equals(value.taskId())) {
                throw new IllegalArgumentException(
                        "task progress responses cursor does not match task");
            }
        });

        Map<TaskOptionId, String> optionContents = optionContents(task);
        List<SubmissionRow> rows = responses.findByTask(
                taskId, decoded, limit + 1);
        boolean hasMore = rows.size() > limit;
        List<SubmissionRow> pageRows = rows.stream().limit(limit).toList();
        List<TaskProgressResponse> items = pageRows.stream()
                .map(row -> toResponse(row, optionContents))
                .toList();
        String nextCursor = pageRows.isEmpty()
                ? cursor
                : encode(cursor(taskId, pageRows.getLast()));
        return Optional.of(new TaskProgressResponsePage(
                task.id(), task.status(), clock.instant(), items,
                nextCursor, hasMore));
    }

    private static Map<TaskOptionId, String> optionContents(Task task) {
        Map<TaskOptionId, String> contents = new LinkedHashMap<>();
        for (TaskOption option : task.questions().getFirst().options()) {
            String duplicate = contents.put(option.id(), option.content());
            if (duplicate != null) {
                throw new IllegalStateException(
                        "duplicate task option: " + option.id());
            }
        }
        return Map.copyOf(contents);
    }

    private static TaskProgressResponse toResponse(
            SubmissionRow row,
            Map<TaskOptionId, String> optionContents
    ) {
        String optionContent = optionContents.get(row.selectedOptionId());
        if (optionContent == null) {
            throw new IllegalStateException(
                    "submission references an unknown task option");
        }
        return new TaskProgressResponse(
                row.selectedOptionId(), optionContent, row.reasonSource(),
                row.finalReason(), row.submittedAt());
    }

    private static SubmissionCursor cursor(
            TaskId taskId,
            SubmissionRow row
    ) {
        return new SubmissionCursor(
                taskId, row.submittedAt(), row.submissionId());
    }

    private static void validateLimit(int limit) {
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException(
                    "task progress responses limit must be between 1 and "
                            + MAX_LIMIT);
        }
    }

    private static String encode(SubmissionCursor cursor) {
        String payload = String.join(
                CURSOR_SEPARATOR,
                CURSOR_VERSION,
                cursor.taskId().value().toString(),
                cursor.submittedAt().toString(),
                cursor.submissionId().value().toString());
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    private static SubmissionCursor decode(String encoded) {
        if (encoded == null || encoded.isBlank()
                || encoded.length() > MAX_ENCODED_CURSOR_LENGTH) {
            throw invalidCursor(null);
        }
        try {
            String payload = new String(
                    Base64.getUrlDecoder().decode(encoded),
                    StandardCharsets.UTF_8);
            String[] fields = payload.split(CURSOR_SEPARATOR, -1);
            if (fields.length != CURSOR_FIELD_COUNT
                    || !CURSOR_VERSION.equals(fields[0])) {
                throw invalidCursor(null);
            }
            return new SubmissionCursor(
                    new TaskId(canonicalUuid(fields[1])),
                    Instant.parse(fields[2]),
                    new TaskSubmissionId(canonicalUuid(fields[3])));
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            if (INVALID_CURSOR_MESSAGE.equals(exception.getMessage())) {
                throw exception;
            }
            throw invalidCursor(exception);
        }
    }

    private static UUID canonicalUuid(String value) {
        UUID parsed = UUID.fromString(value);
        if (!parsed.toString().equals(value)) {
            throw invalidCursor(null);
        }
        return parsed;
    }

    private static IllegalArgumentException invalidCursor(Throwable cause) {
        return new IllegalArgumentException(INVALID_CURSOR_MESSAGE, cause);
    }

    public record TaskProgressResponsePage(
            TaskId taskId,
            TaskStatus status,
            Instant observedAt,
            List<TaskProgressResponse> responses,
            String nextCursor,
            boolean hasMore
    ) {
        public TaskProgressResponsePage {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(observedAt, "observedAt");
            responses = List.copyOf(Objects.requireNonNull(
                    responses, "responses"));
        }
    }

    public record TaskProgressResponse(
            TaskOptionId selectedOptionId,
            String selectedOptionContent,
            TaskReasonSource reasonSource,
            String reason,
            Instant submittedAt
    ) {
        public TaskProgressResponse {
            Objects.requireNonNull(selectedOptionId, "selectedOptionId");
            Objects.requireNonNull(
                    selectedOptionContent, "selectedOptionContent");
            Objects.requireNonNull(reasonSource, "reasonSource");
            Objects.requireNonNull(reason, "reason");
            Objects.requireNonNull(submittedAt, "submittedAt");
        }
    }
}
