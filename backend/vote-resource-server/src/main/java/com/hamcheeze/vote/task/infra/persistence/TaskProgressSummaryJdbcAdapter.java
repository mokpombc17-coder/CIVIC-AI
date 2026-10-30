package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.port.out.TaskProgressSummaryReader;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Repository
public class TaskProgressSummaryJdbcAdapter
        implements TaskProgressSummaryReader {

    private static final String SELECT_COUNTS = """
            SELECT selected_option_id, COUNT(*) AS submission_count
            FROM task_submissions
            WHERE task_id = ?
            GROUP BY selected_option_id
            """;

    private final JdbcTemplate jdbcTemplate;

    public TaskProgressSummaryJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    public List<OptionSubmissionCount> countSelections(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return jdbcTemplate.query(
                SELECT_COUNTS,
                (resultSet, rowNumber) -> new OptionSubmissionCount(
                        new TaskOptionId(resultSet.getObject(
                                "selected_option_id", UUID.class)),
                        resultSet.getLong("submission_count")),
                taskId.value());
    }
}
