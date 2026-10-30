package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.idempotency.TaskAdminCreationReceipt;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyKey;
import com.hamcheeze.vote.task.application.idempotency.TaskRequestHash;
import com.hamcheeze.vote.task.application.port.out.TaskAdminCreationReceiptRepository;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;
import java.sql.Timestamp;

@Repository
public class TaskAdminCreationReceiptJdbcAdapter
        implements TaskAdminCreationReceiptRepository {

    private final JdbcTemplate jdbc;

    public TaskAdminCreationReceiptJdbcAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean claim(TaskAdminCreationReceipt receipt) {
        return jdbc.update(
                """
                INSERT INTO task_admin_creation_receipts (
                    actor_id,
                    idempotency_key,
                    request_hash,
                    task_id,
                    created_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (actor_id, idempotency_key) DO NOTHING
                """,
                receipt.actorId().value(),
                receipt.idempotencyKey().value(),
                receipt.requestHash().value(),
                receipt.taskId().value(),
                Timestamp.from(receipt.createdAt())) == 1;
    }

    @Override
    public Optional<TaskAdminCreationReceipt> findByRequest(
            TaskActorId actorId,
            TaskIdempotencyKey idempotencyKey
    ) {
        return jdbc.query(
                        """
                        SELECT actor_id,
                               idempotency_key,
                               request_hash,
                               task_id,
                               created_at
                        FROM task_admin_creation_receipts
                        WHERE actor_id = ?
                          AND idempotency_key = ?
                        """,
                        (resultSet, rowNumber) ->
                                new TaskAdminCreationReceipt(
                                        new TaskActorId(resultSet.getString(
                                                "actor_id")),
                                        new TaskIdempotencyKey(
                                                resultSet.getObject(
                                                        "idempotency_key",
                                                        UUID.class)),
                                        new TaskRequestHash(
                                                resultSet.getBytes(
                                                        "request_hash")),
                                        new TaskId(resultSet.getObject(
                                                "task_id", UUID.class)),
                                        resultSet.getTimestamp("created_at")
                                                .toInstant()),
                        actorId.value(), idempotencyKey.value())
                .stream()
                .findFirst();
    }
}
