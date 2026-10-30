package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.port.out.TaskOutcomeReader;
import com.hamcheeze.vote.task.application.query.TaskOutcomeCursor;
import com.hamcheeze.vote.task.application.query.TaskOutcomeView;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
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
public class TaskOutcomeJdbcAdapter implements TaskOutcomeReader {

    private static final String SELECT = """
            SELECT submission.submission_id,
                   persona.persona_id,
                   submission.prediction_id,
                   submission.task_id,
                   submission.question_id,
                   submission.selected_option_id,
                   submission.reason_source,
                   submission.accepted_predicted_reason_id,
                   submission.final_reason,
                   submission.submitted_at
            FROM task_submissions submission
            JOIN persona_generations persona
              ON persona.generation_id = submission.persona_generation_id
            """;

    private static final String CURSOR = """
              AND (submission.submitted_at, submission.submission_id)
                    > (?, ?)
            """;

    private static final String ORDER_AND_LIMIT = """
            ORDER BY submission.submitted_at ASC,
                     submission.submission_id ASC
            LIMIT ?
            """;

    private final JdbcTemplate jdbcTemplate;

    public TaskOutcomeJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional(readOnly = true)
    public List<TaskOutcomeView> findByTask(
            TaskId taskId,
            Optional<TaskOutcomeCursor> cursor,
            int limit
    ) {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(cursor, "cursor");
        if (limit <= 0) {
            throw new IllegalArgumentException("limit must be positive");
        }

        StringBuilder sql = new StringBuilder(SELECT)
                .append("WHERE submission.task_id = ?\n");
        List<Object> arguments = new ArrayList<>();
        arguments.add(taskId.value());
        cursor.ifPresent(value -> {
            sql.append(CURSOR);
            arguments.add(Timestamp.from(value.submittedAt()));
            arguments.add(value.outcomeId().value());
        });
        sql.append(ORDER_AND_LIMIT);
        arguments.add(limit);
        return jdbcTemplate.query(
                sql.toString(), this::map, arguments.toArray());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TaskOutcomeView> findByTaskAndPersona(
            TaskId taskId,
            TaskPersonaId personaId
    ) {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(personaId, "personaId");
        return jdbcTemplate.query(
                        SELECT + """
                        WHERE submission.task_id = ?
                          AND persona.persona_id = ?
                        ORDER BY submission.submitted_at ASC,
                                 submission.submission_id ASC
                        LIMIT 1
                        """,
                        this::map,
                        taskId.value(),
                        personaId.value())
                .stream()
                .findFirst();
    }

    private TaskOutcomeView map(
            ResultSet resultSet,
            int rowNumber
    ) throws SQLException {
        UUID predictionId = resultSet.getObject(
                "prediction_id", UUID.class);
        UUID candidateId = resultSet.getObject(
                "accepted_predicted_reason_id", UUID.class);
        return new TaskOutcomeView(
                new TaskSubmissionId(resultSet.getObject(
                        "submission_id", UUID.class)),
                new TaskPersonaId(resultSet.getString("persona_id")),
                predictionId == null
                        ? null : new TaskPredictionId(predictionId),
                new TaskId(resultSet.getObject("task_id", UUID.class)),
                new TaskQuestionId(resultSet.getObject(
                        "question_id", UUID.class)),
                new TaskOptionId(resultSet.getObject(
                        "selected_option_id", UUID.class)),
                TaskReasonSource.valueOf(resultSet.getString(
                        "reason_source")),
                candidateId == null
                        ? null : new TaskPredictedReasonId(candidateId),
                resultSet.getString("final_reason"),
                resultSet.getTimestamp("submitted_at").toInstant());
    }
}
