package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.port.out.TaskSearchReader;
import com.hamcheeze.vote.task.application.query.TaskSearchCursor;
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
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class TaskSearchJdbcAdapter implements TaskSearchReader {

    private static final String BASE_QUERY = """
            WITH candidates AS (
                SELECT task.task_id,
                       task.title,
                       task.description,
                       task.status AS task_status,
                       task.opened_at,
                       task.scheduled_close_at AS closes_at,
                       NULL::timestamptz AS closed_at,
                       NULL::varchar AS closure_type,
                       submission.submission_id,
                       submission.submitted_at,
                       FALSE AS result_available,
                       0 AS sort_bucket,
                       task.scheduled_close_at AS sort_at
                FROM tasks task
                LEFT JOIN task_submissions submission
                  ON submission.task_id = task.task_id
                 AND submission.user_id = ?
                WHERE task.status = 'OPEN'
                  AND task.opened_at <= ?
                  AND task.scheduled_close_at > ?

                UNION ALL

                SELECT task.task_id,
                       task.title,
                       task.description,
                       task.status AS task_status,
                       task.opened_at,
                       task.scheduled_close_at AS closes_at,
                       task.closed_at,
                       task.closure_type,
                       submission.submission_id,
                       submission.submitted_at,
                       TRUE AS result_available,
                       1 AS sort_bucket,
                       task.closed_at AS sort_at
                FROM task_submissions submission
                JOIN tasks task ON task.task_id = submission.task_id
                JOIN task_result_manifests manifest
                  ON manifest.task_id = task.task_id
                WHERE submission.user_id = ?
                  AND task.status = 'CLOSED'
                  AND task.closure_type IN (
                      'DEADLINE_REACHED', 'EARLY_CLOSED')
            )
            SELECT task_id,
                   title,
                   description,
                   task_status,
                   opened_at,
                   closes_at,
                   closed_at,
                   closure_type,
                   submission_id,
                   submitted_at,
                   result_available,
                   sort_bucket,
                   sort_at
            FROM candidates
            WHERE (
                POSITION(? IN LOWER(title)) > 0
                OR POSITION(? IN LOWER(COALESCE(description, ''))) > 0
            )
            """;

    private static final String ORDER_AND_LIMIT = """
            ORDER BY sort_bucket ASC,
                     CASE WHEN sort_bucket = 0 THEN sort_at END ASC,
                     CASE WHEN sort_bucket = 1 THEN sort_at END DESC,
                     CASE WHEN sort_bucket = 0 THEN task_id END ASC,
                     CASE WHEN sort_bucket = 1 THEN task_id END DESC
            LIMIT ?
            """;

    private final JdbcTemplate jdbcTemplate;

    public TaskSearchJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional(readOnly = true)
    public List<TaskSearchRow> findByUser(
            TaskUserId userId,
            String normalizedQuery,
            Optional<TaskSearchCursor> cursor,
            Instant observedAt,
            int limit
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(normalizedQuery, "normalizedQuery");
        Objects.requireNonNull(cursor, "cursor");
        Objects.requireNonNull(observedAt, "observedAt");
        if (limit <= 0) {
            throw new IllegalArgumentException("limit must be positive");
        }

        StringBuilder sql = new StringBuilder(BASE_QUERY);
        List<Object> arguments = new ArrayList<>();
        arguments.add(userId.value());
        arguments.add(Timestamp.from(observedAt));
        arguments.add(Timestamp.from(observedAt));
        arguments.add(userId.value());
        arguments.add(normalizedQuery);
        arguments.add(normalizedQuery);

        cursor.ifPresent(value -> {
            if (value.taskStatus() == TaskStatus.OPEN) {
                sql.append("""
                          AND (
                              (sort_bucket = 0
                               AND (sort_at, task_id) > (?, ?))
                              OR sort_bucket = 1
                          )
                        """);
            } else {
                sql.append("""
                          AND sort_bucket = 1
                          AND (sort_at, task_id) < (?, ?)
                        """);
            }
            arguments.add(Timestamp.from(value.sortAt()));
            arguments.add(value.taskId().value());
        });
        sql.append(ORDER_AND_LIMIT);
        arguments.add(limit);
        return jdbcTemplate.query(
                sql.toString(), this::map, arguments.toArray());
    }

    private TaskSearchRow map(ResultSet resultSet, int rowNumber)
            throws SQLException {
        Timestamp closedAt = resultSet.getTimestamp("closed_at");
        String closureType = resultSet.getString("closure_type");
        UUID submissionId = resultSet.getObject("submission_id", UUID.class);
        Timestamp submittedAt = resultSet.getTimestamp("submitted_at");
        return new TaskSearchRow(
                new TaskId(resultSet.getObject("task_id", UUID.class)),
                resultSet.getString("title"),
                resultSet.getString("description"),
                TaskStatus.valueOf(resultSet.getString("task_status")),
                resultSet.getTimestamp("opened_at").toInstant(),
                resultSet.getTimestamp("closes_at").toInstant(),
                closedAt == null ? null : closedAt.toInstant(),
                closureType == null
                        ? null : TaskClosureType.valueOf(closureType),
                submissionId == null
                        ? null : new TaskSubmissionId(submissionId),
                submittedAt == null ? null : submittedAt.toInstant(),
                resultSet.getBoolean("result_available"),
                resultSet.getTimestamp("sort_at").toInstant());
    }
}
