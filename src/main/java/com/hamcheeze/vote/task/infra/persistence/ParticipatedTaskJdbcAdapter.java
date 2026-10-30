package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.port.out.ParticipatedTaskReader;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskCursor;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ParticipatedTaskJdbcAdapter implements ParticipatedTaskReader {

    private static final String BASE_QUERY = """
            SELECT task.task_id,
                   task.title,
                   task.description,
                   task.opened_at,
                   task.scheduled_close_at,
                   task.status,
                   task.closed_at,
                   task.closure_type,
                   submission.submission_id,
                   submission.submitted_at,
                   manifest.result_version,
                   manifest.finalized_at
            FROM task_submissions submission
            JOIN tasks task ON task.task_id = submission.task_id
            LEFT JOIN task_result_manifests manifest
              ON manifest.task_id = task.task_id
            WHERE submission.user_id = ?
            """;

    private static final String SEARCH = """
              AND (
                POSITION(? IN LOWER(task.title)) > 0
                OR POSITION(? IN LOWER(COALESCE(task.description, ''))) > 0
              )
            """;

    private static final String CURSOR = """
              AND (submission.submitted_at, task.task_id) < (?, ?)
            """;

    private static final String ORDER_AND_LIMIT = """
            ORDER BY submission.submitted_at DESC, task.task_id DESC
            LIMIT ?
            """;

    private final JdbcTemplate jdbcTemplate;

    public ParticipatedTaskJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional(readOnly = true)
    public List<ParticipatedTaskRow> findByUser(
            TaskUserId userId,
            String normalizedQuery,
            Optional<ParticipatedTaskCursor> cursor,
            int limit
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(cursor, "cursor");
        if (limit <= 0) {
            throw new IllegalArgumentException("limit must be positive");
        }

        StringBuilder sql = new StringBuilder(BASE_QUERY);
        List<Object> arguments = new ArrayList<>();
        arguments.add(userId.value());
        if (normalizedQuery != null) {
            sql.append(SEARCH);
            arguments.add(normalizedQuery);
            arguments.add(normalizedQuery);
        }
        cursor.ifPresent(value -> {
            sql.append(CURSOR);
            arguments.add(Timestamp.from(value.submittedAt()));
            arguments.add(value.taskId().value());
        });
        sql.append(ORDER_AND_LIMIT);
        arguments.add(limit);

        return jdbcTemplate.query(
                sql.toString(), this::map, arguments.toArray());
    }

    private ParticipatedTaskRow map(
            ResultSet resultSet,
            int rowNumber
    ) throws SQLException {
        Timestamp closedAt = resultSet.getTimestamp("closed_at");
        Timestamp openedAt = resultSet.getTimestamp("opened_at");
        String closureType = resultSet.getString("closure_type");
        Integer resultVersion = resultSet.getObject(
                "result_version", Integer.class);
        Timestamp finalizedAt = resultSet.getTimestamp("finalized_at");
        return new ParticipatedTaskRow(
                new TaskId(resultSet.getObject("task_id", UUID.class)),
                resultSet.getString("title"),
                resultSet.getString("description"),
                openedAt == null ? null : openedAt.toInstant(),
                resultSet.getTimestamp("scheduled_close_at").toInstant(),
                TaskStatus.valueOf(resultSet.getString("status")),
                closedAt == null ? null : closedAt.toInstant(),
                closureType == null
                        ? null : TaskClosureType.valueOf(closureType),
                new TaskSubmissionId(resultSet.getObject(
                        "submission_id", UUID.class)),
                resultSet.getTimestamp("submitted_at").toInstant(),
                resultVersion,
                finalizedAt == null ? null : finalizedAt.toInstant());
    }
}
