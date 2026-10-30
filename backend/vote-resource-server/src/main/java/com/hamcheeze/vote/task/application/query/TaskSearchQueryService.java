package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskSearchReader;
import com.hamcheeze.vote.task.application.port.out.TaskSearchReader.TaskSearchRow;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;

@Service
public class TaskSearchQueryService {

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;
    public static final int MAX_QUERY_LENGTH = 200;

    private final TaskSearchReader search;
    private final TaskSearchCursorCodec cursors;
    private final Clock clock;

    @Autowired
    public TaskSearchQueryService(
            TaskSearchReader search,
            TaskSearchCursorCodec cursors
    ) {
        this(search, cursors, Clock.systemUTC());
    }

    TaskSearchQueryService(
            TaskSearchReader search,
            TaskSearchCursorCodec cursors,
            Clock clock
    ) {
        this.search = Objects.requireNonNull(search, "search");
        this.cursors = Objects.requireNonNull(cursors, "cursors");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional(readOnly = true)
    public TaskSearchPage findByUser(
            TaskUserId userId,
            String query,
            String cursor,
            int size
    ) {
        Objects.requireNonNull(userId, "userId");
        String normalizedQuery = normalize(query);
        if (size < 1 || size > MAX_SIZE) {
            throw new IllegalArgumentException(
                    "task search page size must be between 1 and " + MAX_SIZE);
        }

        String queryFingerprint = fingerprint(normalizedQuery);
        String userFingerprint = fingerprint(userId.value());
        Optional<TaskSearchCursor> decodedCursor = cursor == null
                ? Optional.empty()
                : Optional.of(cursors.decode(cursor));
        decodedCursor.ifPresent(value -> {
            if (!queryFingerprint.equals(value.queryFingerprint())
                    || !userFingerprint.equals(value.userFingerprint())) {
                throw TaskSearchCursorCodec.invalid(null);
            }
        });

        List<TaskSearchRow> rows = search.findByUser(
                userId, normalizedQuery, decodedCursor,
                clock.instant(), size + 1);
        boolean hasNext = rows.size() > size;
        List<TaskSearchSummary> items = rows.stream()
                .limit(size)
                .map(TaskSearchSummary::from)
                .toList();
        String nextCursor = hasNext
                ? encodeCursor(rows.get(size - 1),
                        queryFingerprint, userFingerprint)
                : null;
        return new TaskSearchPage(items, nextCursor);
    }

    private String encodeCursor(
            TaskSearchRow row,
            String queryFingerprint,
            String userFingerprint
    ) {
        return cursors.encode(new TaskSearchCursor(
                queryFingerprint,
                userFingerprint,
                row.taskStatus(),
                row.sortAt(),
                row.taskId()));
    }

    private static String normalize(String query) {
        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException(
                    "task search query must not be blank");
        }
        String normalized = query.strip().toLowerCase(Locale.ROOT);
        if (normalized.length() > MAX_QUERY_LENGTH) {
            throw new IllegalArgumentException(
                    "task search query must not exceed "
                            + MAX_QUERY_LENGTH + " characters");
        }
        return normalized;
    }

    private static String fingerprint(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record TaskSearchPage(
            List<TaskSearchSummary> items,
            String nextCursor
    ) {
        public TaskSearchPage {
            items = List.copyOf(Objects.requireNonNull(items, "items"));
        }
    }

    public record TaskSearchSummary(
            TaskId taskId,
            String title,
            String description,
            TaskStatus taskStatus,
            Instant openedAt,
            Instant closesAt,
            Instant closedAt,
            TaskClosureType closureType,
            MySubmission mySubmission,
            boolean resultAvailable
    ) {
        public TaskSearchSummary {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(taskStatus, "taskStatus");
            Objects.requireNonNull(openedAt, "openedAt");
            Objects.requireNonNull(closesAt, "closesAt");
        }

        private static TaskSearchSummary from(TaskSearchRow row) {
            MySubmission submission = row.submissionId() == null
                    ? null : new MySubmission(
                            row.submissionId(), row.submittedAt());
            return new TaskSearchSummary(
                    row.taskId(), row.title(), row.description(),
                    row.taskStatus(), row.openedAt(), row.closesAt(),
                    row.closedAt(), row.closureType(), submission,
                    row.resultAvailable());
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
