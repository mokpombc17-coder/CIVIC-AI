package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationRepository;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationRecord;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStatus;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class TaskPreparationJdbcAdapter
        implements TaskPreparationRepository {

    private static final String SELECT = """
            SELECT task_id,
                   request_id,
                   content_fingerprint,
                   request_payload,
                   status,
                   attempt_count,
                   processing_started_at,
                   next_retry_at,
                   prepared_at,
                   last_error_code,
                   last_error_detail,
                   created_at,
                   updated_at
            FROM task_preparations
            """;

    private final JdbcTemplate jdbcTemplate;

    public TaskPreparationJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TaskPreparationRecord> findByTaskId(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return jdbcTemplate.query(
                        SELECT + """
                        WHERE task_id = ?
                        """,
                        this::map,
                        taskId.value())
                .stream()
                .findFirst();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TaskPreparationRecord> findByRequestId(UUID requestId) {
        Objects.requireNonNull(requestId, "requestId");
        return jdbcTemplate.query(
                        SELECT + """
                        WHERE request_id = ?
                        """,
                        this::map,
                        requestId)
                .stream()
                .findFirst();
    }

    @Override
    @Transactional
    public Optional<TaskPreparationRecord> findByTaskIdForUpdate(
            TaskId taskId
    ) {
        Objects.requireNonNull(taskId, "taskId");
        return jdbcTemplate.query(
                        SELECT + """
                        WHERE task_id = ?
                        FOR UPDATE
                        """,
                        this::map,
                        taskId.value())
                .stream()
                .findFirst();
    }

    @Override
    @Transactional
    public TaskPreparationRecord save(
            TaskPreparationRecord preparation
    ) {
        Objects.requireNonNull(preparation, "preparation");
        jdbcTemplate.update("""
                        INSERT INTO task_preparations (
                            task_id,
                            request_id,
                            content_fingerprint,
                            request_payload,
                            status,
                            attempt_count,
                            processing_started_at,
                            next_retry_at,
                            prepared_at,
                            last_error_code,
                            last_error_detail,
                            created_at,
                            updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (task_id) DO UPDATE SET
                            request_id = EXCLUDED.request_id,
                            content_fingerprint = EXCLUDED.content_fingerprint,
                            request_payload = EXCLUDED.request_payload,
                            status = EXCLUDED.status,
                            attempt_count = EXCLUDED.attempt_count,
                            processing_started_at =
                                EXCLUDED.processing_started_at,
                            next_retry_at = EXCLUDED.next_retry_at,
                            prepared_at = EXCLUDED.prepared_at,
                            last_error_code = EXCLUDED.last_error_code,
                            last_error_detail = EXCLUDED.last_error_detail,
                            updated_at = EXCLUDED.updated_at
                        """,
                preparation.taskId().value(),
                preparation.requestId(),
                preparation.contentFingerprint(),
                preparation.requestPayload(),
                preparation.status().name(),
                preparation.attemptCount(),
                timestamp(preparation.processingStartedAt()),
                timestamp(preparation.nextRetryAt()),
                timestamp(preparation.preparedAt()),
                preparation.lastErrorCode(),
                preparation.lastErrorDetail(),
                Timestamp.from(preparation.createdAt()),
                Timestamp.from(preparation.updatedAt()));
        return preparation;
    }

    private TaskPreparationRecord map(
            ResultSet resultSet,
            int rowNumber
    ) throws SQLException {
        return new TaskPreparationRecord(
                new TaskId(resultSet.getObject("task_id", UUID.class)),
                resultSet.getObject("request_id", UUID.class),
                resultSet.getString("content_fingerprint"),
                resultSet.getString("request_payload"),
                TaskPreparationStatus.valueOf(
                        resultSet.getString("status")),
                resultSet.getInt("attempt_count"),
                instant(resultSet, "processing_started_at"),
                instant(resultSet, "next_retry_at"),
                instant(resultSet, "prepared_at"),
                resultSet.getString("last_error_code"),
                resultSet.getString("last_error_detail"),
                resultSet.getTimestamp("created_at").toInstant(),
                resultSet.getTimestamp("updated_at").toInstant());
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private static Instant instant(
            ResultSet resultSet,
            String column
    ) throws SQLException {
        Timestamp value = resultSet.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
