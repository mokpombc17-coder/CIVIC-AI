package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.port.out.TaskPredictionInputRepository;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionInputSnapshot;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class TaskPredictionInputJdbcAdapter
        implements TaskPredictionInputRepository {

    private final JdbcTemplate jdbcTemplate;

    public TaskPredictionInputJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    @Override
    public TaskPredictionInputSnapshot insert(
            TaskPredictionInputSnapshot snapshot
    ) {
        Objects.requireNonNull(snapshot, "snapshot");
        jdbcTemplate.update("""
                INSERT INTO task_prediction_inputs (
                    prediction_id, task_id, user_id,
                    persona_generation_id,
                    provider_persona_id, task_ends_at,
                    request_schema_version, algorithm_version,
                    request_payload, request_fingerprint, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                snapshot.predictionId().value(),
                snapshot.taskId().value(),
                snapshot.userId().value(),
                snapshot.personaGenerationId().value(),
                snapshot.providerPersonaId().value(),
                Timestamp.from(snapshot.taskEndsAt()),
                snapshot.requestSchemaVersion(),
                snapshot.algorithmVersion(),
                snapshot.requestPayload(),
                snapshot.requestFingerprint(),
                Timestamp.from(snapshot.createdAt()));
        return snapshot;
    }

    @Override
    public Optional<TaskPredictionInputSnapshot> findByPredictionId(
            TaskPredictionId predictionId
    ) {
        Objects.requireNonNull(predictionId, "predictionId");
        return jdbcTemplate.query("""
                SELECT prediction_id, task_id, user_id,
                       persona_generation_id,
                       provider_persona_id, task_ends_at,
                       request_schema_version, algorithm_version,
                       request_payload, request_fingerprint, created_at
                FROM task_prediction_inputs
                WHERE prediction_id = ?
                """, this::map, predictionId.value()).stream().findFirst();
    }

    private TaskPredictionInputSnapshot map(
            ResultSet resultSet,
            int rowNumber
    ) throws SQLException {
        return new TaskPredictionInputSnapshot(
                new TaskPredictionId(resultSet.getObject(
                        "prediction_id", UUID.class)),
                new TaskId(resultSet.getObject("task_id", UUID.class)),
                new TaskUserId(resultSet.getString("user_id")),
                new TaskPersonaGenerationId(resultSet.getObject(
                        "persona_generation_id", UUID.class)),
                new TaskPersonaId(resultSet.getString("provider_persona_id")),
                resultSet.getTimestamp("task_ends_at").toInstant(),
                resultSet.getInt("request_schema_version"),
                resultSet.getString("algorithm_version"),
                resultSet.getString("request_payload"),
                resultSet.getString("request_fingerprint"),
                resultSet.getTimestamp("created_at").toInstant());
    }
}
