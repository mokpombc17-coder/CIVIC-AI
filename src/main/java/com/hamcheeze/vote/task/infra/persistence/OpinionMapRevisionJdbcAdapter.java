package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationGatewayResult;
import com.hamcheeze.vote.task.application.port.out.OpinionMapRevisionRepository;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Repository
public class OpinionMapRevisionJdbcAdapter
        implements OpinionMapRevisionRepository {

    private final JdbcTemplate jdbc;

    public OpinionMapRevisionJdbcAdapter(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public void insertAiRevision(
            OpinionMapGeneration generation,
            UUID runId,
            String outputJson,
            OpinionMapGenerationGatewayResult result,
            Instant publishedAt
    ) {
        int inserted = jdbc.update("""
                        INSERT INTO opinion_map_revisions (
                            revision_id,
                            generation_id,
                            run_id,
                            revision_number,
                            source,
                            output_json,
                            prompt_version,
                            requested_model,
                            response_model,
                            created_at,
                            published_at
                        )
                        SELECT ?, ?, ?,
                               COALESCE(MAX(revision_number), 0) + 1,
                               'AI', ?, ?, ?, ?, ?, ?
                        FROM opinion_map_revisions
                        WHERE generation_id = ?
                        """,
                UUID.randomUUID(),
                generation.id().value(),
                runId,
                outputJson,
                generation.promptVersion(),
                result.requestedModel(),
                result.responseModel(),
                Timestamp.from(publishedAt),
                Timestamp.from(publishedAt),
                generation.id().value());
        if (inserted != 1) {
            throw new IllegalStateException(
                    "Opinion Map revision was not inserted");
        }
    }
}
