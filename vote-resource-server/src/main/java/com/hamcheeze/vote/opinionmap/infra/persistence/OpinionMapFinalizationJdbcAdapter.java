package com.hamcheeze.vote.opinionmap.infra.persistence;

import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapFinalizationRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalization;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalizationStatus;
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
public class OpinionMapFinalizationJdbcAdapter
        implements OpinionMapFinalizationRepository {

    private final JdbcTemplate jdbcTemplate;

    public OpinionMapFinalizationJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional
    public void lockTask(UUID taskId) {
        Objects.requireNonNull(taskId, "taskId");
        jdbcTemplate.query(
                "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                resultSet -> null,
                taskId.toString());
    }

    @Override
    @Transactional
    public boolean insertIfAbsent(OpinionMapFinalization finalization) {
        Objects.requireNonNull(finalization, "finalization");
        return jdbcTemplate.update("""
                INSERT INTO opinion_map_finalizations (
                    task_id, closure_type, closed_at,
                    expected_submission_count, status,
                    projected_submission_count, evaluated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (task_id) DO NOTHING
                """,
                finalization.taskId(),
                finalization.closureType().name(),
                Timestamp.from(finalization.closedAt()),
                finalization.expectedSubmissionCount(),
                finalization.status().name(),
                finalization.projectedSubmissionCount(),
                Timestamp.from(finalization.evaluatedAt())) == 1;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OpinionMapFinalization> findByTaskId(UUID taskId) {
        return find(taskId, false);
    }

    @Override
    @Transactional
    public Optional<OpinionMapFinalization> findByTaskIdForUpdate(
            UUID taskId
    ) {
        return find(taskId, true);
    }

    @Override
    @Transactional
    public void updateDecision(OpinionMapFinalization finalization) {
        Objects.requireNonNull(finalization, "finalization");
        int updated = jdbcTemplate.update("""
                UPDATE opinion_map_finalizations
                SET status = ?, projected_submission_count = ?,
                    evaluated_at = ?
                WHERE task_id = ?
                """,
                finalization.status().name(),
                finalization.projectedSubmissionCount(),
                Timestamp.from(finalization.evaluatedAt()),
                finalization.taskId());
        if (updated != 1) {
            throw new IllegalStateException(
                    "opinion map finalization does not exist: "
                            + finalization.taskId());
        }
    }

    private Optional<OpinionMapFinalization> find(
            UUID taskId,
            boolean forUpdate
    ) {
        Objects.requireNonNull(taskId, "taskId");
        String lock = forUpdate ? " FOR UPDATE" : "";
        return jdbcTemplate.query("""
                        SELECT task_id, closure_type, closed_at,
                               expected_submission_count, status,
                               projected_submission_count, evaluated_at
                        FROM opinion_map_finalizations
                        WHERE task_id = ?
                        """ + lock,
                (resultSet, rowNumber) -> map(resultSet),
                taskId).stream().findFirst();
    }

    private static OpinionMapFinalization map(ResultSet resultSet)
            throws SQLException {
        return new OpinionMapFinalization(
                resultSet.getObject("task_id", UUID.class),
                OpinionMapTaskClosureType.valueOf(
                        resultSet.getString("closure_type")),
                resultSet.getTimestamp("closed_at").toInstant(),
                resultSet.getInt("expected_submission_count"),
                OpinionMapFinalizationStatus.valueOf(
                        resultSet.getString("status")),
                resultSet.getInt("projected_submission_count"),
                resultSet.getTimestamp("evaluated_at").toInstant());
    }
}
