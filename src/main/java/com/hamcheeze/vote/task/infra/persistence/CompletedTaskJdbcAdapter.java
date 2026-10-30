package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.port.out.CompletedTaskReader;
import com.hamcheeze.vote.task.application.query.CompletedTaskCursor;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class CompletedTaskJdbcAdapter implements CompletedTaskReader {

    private static final String BASE_QUERY = """
            SELECT task.task_id,
                   task.title,
                   task.description,
                   task.opened_at,
                   task.closed_at,
                   task.closure_type,
                   submission.submission_id,
                   submission.submitted_at
            FROM task_submissions submission
            JOIN tasks task ON task.task_id = submission.task_id
            JOIN task_result_manifests manifest
              ON manifest.task_id = task.task_id
            WHERE submission.user_id = ?
              AND task.status = 'CLOSED'
              AND task.closure_type IN ('DEADLINE_REACHED', 'EARLY_CLOSED')
            """;

    private static final String ORDER_AND_LIMIT = """
            ORDER BY task.closed_at DESC, task.task_id DESC
            LIMIT ?
            """;

    private final JdbcTemplate jdbcTemplate;

    public CompletedTaskJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional(readOnly = true)
    public List<CompletedTaskRow> findByUser(
            TaskUserId userId,
            Optional<CompletedTaskCursor> cursor,
            int limit
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(cursor, "cursor");
        if (limit <= 0) {
            throw new IllegalArgumentException("limit must be positive");
        }
        return cursor.map(value -> jdbcTemplate.query(
                        BASE_QUERY + """
                          AND (task.closed_at, task.task_id) < (?, ?)
                        """ + ORDER_AND_LIMIT,
                        this::map,
                        userId.value(),
                        Timestamp.from(value.closedAt()),
                        value.taskId().value(),
                        limit))
                .orElseGet(() -> jdbcTemplate.query(
                        BASE_QUERY + ORDER_AND_LIMIT,
                        this::map,
                        userId.value(),
                        limit));
    }

    private CompletedTaskRow map(
            ResultSet resultSet,
            int rowNumber
    ) throws SQLException {
        return new CompletedTaskRow(
                new TaskId(resultSet.getObject("task_id", UUID.class)),
                resultSet.getString("title"),
                resultSet.getString("description"),
                resultSet.getTimestamp("opened_at").toInstant(),
                resultSet.getTimestamp("closed_at").toInstant(),
                TaskClosureType.valueOf(resultSet.getString("closure_type")),
                new TaskSubmissionId(resultSet.getObject(
                        "submission_id", UUID.class)),
                resultSet.getTimestamp("submitted_at").toInstant());
    }
}
