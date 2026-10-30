package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapUnavailableCursor;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationAdminViewRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Repository
public class OpinionMapGenerationAdminViewJdbcAdapter
        implements OpinionMapGenerationAdminViewRepository {

    private static final String SELECT = """
            SELECT generation.generation_id,
                   generation.task_id,
                   task.title AS task_title,
                   generation.result_version,
                   generation.attempt_count,
                   generation.last_error_code,
                   generation.completed_at
            FROM opinion_map_generations generation
            JOIN tasks task ON task.task_id = generation.task_id
            WHERE generation.status = 'UNAVAILABLE'
            """;

    private final JdbcTemplate jdbc;

    public OpinionMapGenerationAdminViewJdbcAdapter(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public List<UnavailableRow> findUnavailable(
            Optional<OpinionMapUnavailableCursor> cursor,
            int limit
    ) {
        Objects.requireNonNull(cursor, "cursor");
        if (cursor.isEmpty()) {
            return jdbc.query(
                    SELECT + """
                            ORDER BY generation.completed_at DESC,
                                     generation.generation_id DESC
                            LIMIT ?
                            """,
                    this::map,
                    limit);
        }
        OpinionMapUnavailableCursor value = cursor.orElseThrow();
        return jdbc.query(
                SELECT + """
                        AND (generation.completed_at < ?
                            OR (generation.completed_at = ?
                                AND generation.generation_id < ?))
                        ORDER BY generation.completed_at DESC,
                                 generation.generation_id DESC
                        LIMIT ?
                        """,
                this::map,
                Timestamp.from(value.failedAt()),
                Timestamp.from(value.failedAt()),
                value.generationId().value(),
                limit);
    }

    private UnavailableRow map(ResultSet resultSet, int rowNumber)
            throws SQLException {
        return new UnavailableRow(
                new OpinionMapGenerationId(resultSet.getObject(
                        "generation_id", java.util.UUID.class)),
                new TaskId(resultSet.getObject(
                        "task_id", java.util.UUID.class)),
                resultSet.getString("task_title"),
                resultSet.getInt("result_version"),
                resultSet.getInt("attempt_count"),
                resultSet.getString("last_error_code"),
                resultSet.getTimestamp("completed_at").toInstant());
    }
}
