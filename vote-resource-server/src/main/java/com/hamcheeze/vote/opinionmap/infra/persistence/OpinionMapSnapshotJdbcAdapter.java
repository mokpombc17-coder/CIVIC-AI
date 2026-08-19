package com.hamcheeze.vote.opinionmap.infra.persistence;

import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapTaskClosureType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class OpinionMapSnapshotJdbcAdapter
        implements OpinionMapSnapshotRepository {

    private final JdbcTemplate jdbcTemplate;

    public OpinionMapSnapshotJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional
    public boolean insertIfAbsent(OpinionMapSnapshot snapshot) {
        Objects.requireNonNull(snapshot, "snapshot");
        return jdbcTemplate.update("""
                INSERT INTO opinion_map_snapshots (
                    snapshot_id, task_id, closure_type, closed_at,
                    expected_submission_count, response_count, finalized_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (task_id) DO NOTHING
                """,
                snapshot.snapshotId(),
                snapshot.taskId(),
                snapshot.closureType().name(),
                Timestamp.from(snapshot.closedAt()),
                snapshot.expectedSubmissionCount(),
                snapshot.responseCount(),
                Timestamp.from(snapshot.finalizedAt())) == 1;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OpinionMapSnapshot> findByTaskId(UUID taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return jdbcTemplate.query("""
                        SELECT snapshot_id, task_id, closure_type, closed_at,
                               expected_submission_count, response_count,
                               finalized_at
                        FROM opinion_map_snapshots
                        WHERE task_id = ?
                        """,
                this::mapSnapshot,
                taskId).stream().findFirst();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OpinionMapSnapshot> findBySnapshotId(UUID snapshotId) {
        Objects.requireNonNull(snapshotId, "snapshotId");
        return jdbcTemplate.query("""
                        SELECT snapshot_id, task_id, closure_type, closed_at,
                               expected_submission_count, response_count,
                               finalized_at
                        FROM opinion_map_snapshots
                        WHERE snapshot_id = ?
                        """,
                this::mapSnapshot,
                snapshotId).stream().findFirst();
    }

    private OpinionMapSnapshot mapSnapshot(
            ResultSet resultSet,
            int rowNumber
    ) throws SQLException {
        return new OpinionMapSnapshot(
                resultSet.getObject("snapshot_id", UUID.class),
                resultSet.getObject("task_id", UUID.class),
                OpinionMapTaskClosureType.valueOf(
                        resultSet.getString("closure_type")),
                resultSet.getTimestamp("closed_at").toInstant(),
                resultSet.getInt("expected_submission_count"),
                resultSet.getInt("response_count"),
                resultSet.getTimestamp("finalized_at").toInstant());
    }
}
