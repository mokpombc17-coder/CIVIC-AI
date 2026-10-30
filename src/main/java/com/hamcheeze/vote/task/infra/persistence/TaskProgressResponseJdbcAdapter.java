package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.port.out.TaskProgressResponseReader;
import com.hamcheeze.vote.task.application.port.out.TaskProgressResponseReader.SubmissionCursor;
import com.hamcheeze.vote.task.application.port.out.TaskProgressResponseReader.SubmissionRow;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
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
public class TaskProgressResponseJdbcAdapter
        implements TaskProgressResponseReader {

    private static final String SELECT = """
            SELECT submission_id,
                   selected_option_id,
                   reason_source,
                   final_reason,
                   submitted_at
            FROM task_submissions
            WHERE task_id = ?
            """;

    private static final String CURSOR = """
              AND (submitted_at, submission_id) > (?, ?)
            """;

    private static final String ORDER_AND_LIMIT = """
            ORDER BY submitted_at ASC, submission_id ASC
            LIMIT ?
            """;

    private final JdbcTemplate jdbcTemplate;

    public TaskProgressResponseJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionRow> findByTask(
            TaskId taskId,
            Optional<SubmissionCursor> cursor,
            int limit
    ) {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(cursor, "cursor");
        if (limit <= 0) {
            throw new IllegalArgumentException("limit must be positive");
        }

        StringBuilder sql = new StringBuilder(SELECT);
        List<Object> arguments = new ArrayList<>();
        arguments.add(taskId.value());
        cursor.ifPresent(value -> {
            sql.append(CURSOR);
            arguments.add(Timestamp.from(value.submittedAt()));
            arguments.add(value.submissionId().value());
        });
        sql.append(ORDER_AND_LIMIT);
        arguments.add(limit);
        return jdbcTemplate.query(
                sql.toString(), this::map, arguments.toArray());
    }

    private SubmissionRow map(
            ResultSet resultSet,
            int rowNumber
    ) throws SQLException {
        return new SubmissionRow(
                new TaskSubmissionId(resultSet.getObject(
                        "submission_id", UUID.class)),
                new TaskOptionId(resultSet.getObject(
                        "selected_option_id", UUID.class)),
                TaskReasonSource.valueOf(resultSet.getString(
                        "reason_source")),
                resultSet.getString("final_reason"),
                resultSet.getTimestamp("submitted_at").toInstant());
    }
}
