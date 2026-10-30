package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.ParticipatedTaskReader;
import com.hamcheeze.vote.task.application.port.out.ParticipatedTaskReader.ParticipatedTaskRow;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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
public class ParticipatedTaskQueryService {

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;
    public static final int MAX_QUERY_LENGTH = 200;

    private final ParticipatedTaskReader participatedTasks;
    private final ParticipatedTaskCursorCodec cursors;
    private final Clock clock;

    @Autowired
    public ParticipatedTaskQueryService(
            ParticipatedTaskReader participatedTasks,
            ParticipatedTaskCursorCodec cursors
    ) {
        this(participatedTasks, cursors, Clock.systemUTC());
    }

    ParticipatedTaskQueryService(
            ParticipatedTaskReader participatedTasks,
            ParticipatedTaskCursorCodec cursors,
            Clock clock
    ) {
        this.participatedTasks = Objects.requireNonNull(
                participatedTasks, "participatedTasks");
        this.cursors = Objects.requireNonNull(cursors, "cursors");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public ParticipatedTaskPage findByUser(
            TaskUserId userId,
            String query,
            String cursor,
            int size
    ) {
        Objects.requireNonNull(userId, "userId");
        if (size < 1 || size > MAX_SIZE) {
            throw new IllegalArgumentException(
                    "participated task page size must be between 1 and "
                            + MAX_SIZE);
        }
        String normalizedQuery = normalize(query);
        String queryFingerprint = fingerprint(normalizedQuery);
        Optional<ParticipatedTaskCursor> decodedCursor = cursor == null
                ? Optional.empty()
                : Optional.of(cursors.decode(cursor));
        decodedCursor.ifPresent(value -> {
            if (!queryFingerprint.equals(value.queryFingerprint())) {
                throw new IllegalArgumentException(
                        "participated task cursor does not match query");
            }
        });

        Instant now = clock.instant();
        List<ParticipatedTaskRow> rows = participatedTasks.findByUser(
                userId, normalizedQuery, decodedCursor, size + 1);
        boolean hasNext = rows.size() > size;
        List<ParticipatedTaskSummary> items = rows.stream()
                .limit(size)
                .map(row -> toSummary(row, now))
                .toList();
        String nextCursor = hasNext
                ? cursors.encode(new ParticipatedTaskCursor(
                        queryFingerprint,
                        items.getLast().participation().submittedAt(),
                        items.getLast().taskId()))
                : null;
        return new ParticipatedTaskPage(items, nextCursor);
    }

    private static String normalize(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        String normalized = query.strip().toLowerCase(Locale.ROOT);
        if (normalized.length() > MAX_QUERY_LENGTH) {
            throw new IllegalArgumentException(
                    "participated task query must not exceed "
                            + MAX_QUERY_LENGTH + " characters");
        }
        return normalized;
    }

    private static String fingerprint(String normalizedQuery) {
        String value = normalizedQuery == null ? "" : normalizedQuery;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static ParticipatedTaskSummary toSummary(
            ParticipatedTaskRow row,
            Instant now
    ) {
        ParticipatedTaskLifecycleStatus lifecycle = lifecycle(row, now);
        ParticipatedTaskResultStatus result = result(row, lifecycle);
        boolean resultAvailable =
                result == ParticipatedTaskResultStatus.AVAILABLE;
        return new ParticipatedTaskSummary(
                row.taskId(),
                row.title(),
                row.description(),
                row.openedAt(),
                row.closesAt(),
                row.closedAt(),
                row.closureType(),
                lifecycle,
                false,
                new Participation(
                        ParticipationStatus.SUBMITTED,
                        row.submissionId(),
                        row.submittedAt()),
                new Result(
                        result,
                        resultAvailable ? row.resultVersion() : null,
                        resultAvailable ? row.finalizedAt() : null,
                        resultAvailable));
    }

    private static ParticipatedTaskLifecycleStatus lifecycle(
            ParticipatedTaskRow row,
            Instant now
    ) {
        if (row.taskStatus() == TaskStatus.CLOSED) {
            return switch (Objects.requireNonNull(
                    row.closureType(), "closed task closureType")) {
                case CANCELLED -> ParticipatedTaskLifecycleStatus.CANCELLED;
                case MISSED_SCHEDULE ->
                        ParticipatedTaskLifecycleStatus.MISSED_SCHEDULE;
                case DEADLINE_REACHED, EARLY_CLOSED ->
                        ParticipatedTaskLifecycleStatus.CLOSED;
            };
        }
        if (row.taskStatus() == TaskStatus.OPEN
                && !now.isBefore(row.closesAt())) {
            return ParticipatedTaskLifecycleStatus.CLOSING;
        }
        return ParticipatedTaskLifecycleStatus.valueOf(
                row.taskStatus().name());
    }

    private static ParticipatedTaskResultStatus result(
            ParticipatedTaskRow row,
            ParticipatedTaskLifecycleStatus lifecycle
    ) {
        if (lifecycle == ParticipatedTaskLifecycleStatus.CLOSED
                && row.resultVersion() != null) {
            return ParticipatedTaskResultStatus.AVAILABLE;
        }
        if (lifecycle == ParticipatedTaskLifecycleStatus.CANCELLED
                || lifecycle
                == ParticipatedTaskLifecycleStatus.MISSED_SCHEDULE) {
            return ParticipatedTaskResultStatus.UNAVAILABLE;
        }
        if (lifecycle == ParticipatedTaskLifecycleStatus.CLOSING
                || lifecycle == ParticipatedTaskLifecycleStatus.CLOSED) {
            return ParticipatedTaskResultStatus.CALCULATING;
        }
        return ParticipatedTaskResultStatus.NOT_AVAILABLE;
    }

    public record ParticipatedTaskPage(
            List<ParticipatedTaskSummary> items,
            String nextCursor
    ) {
        public ParticipatedTaskPage {
            items = List.copyOf(Objects.requireNonNull(items, "items"));
        }
    }

    public record ParticipatedTaskSummary(
            TaskId taskId,
            String title,
            String description,
            Instant openedAt,
            Instant closesAt,
            Instant closedAt,
            TaskClosureType closureType,
            ParticipatedTaskLifecycleStatus taskStatus,
            boolean canSubmit,
            Participation participation,
            Result result
    ) {
        public ParticipatedTaskSummary {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(closesAt, "closesAt");
            Objects.requireNonNull(taskStatus, "taskStatus");
            Objects.requireNonNull(participation, "participation");
            Objects.requireNonNull(result, "result");
        }
    }

    public enum ParticipationStatus {
        SUBMITTED
    }

    public record Participation(
            ParticipationStatus status,
            TaskSubmissionId submissionId,
            Instant submittedAt
    ) {
        public Participation {
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(submissionId, "submissionId");
            Objects.requireNonNull(submittedAt, "submittedAt");
        }
    }

    public record Result(
            ParticipatedTaskResultStatus status,
            Integer version,
            Instant finalizedAt,
            boolean accessAllowed
    ) {
        public Result {
            Objects.requireNonNull(status, "status");
            if ((version == null) != (finalizedAt == null)) {
                throw new IllegalArgumentException(
                        "available result metadata must be present together");
            }
            if (accessAllowed
                    != (status == ParticipatedTaskResultStatus.AVAILABLE)) {
                throw new IllegalArgumentException(
                        "result access must match available status");
            }
        }
    }
}
