package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationManualRequest;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationManualRequestRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.Objects;

@Repository
public class OpinionMapGenerationManualRequestJdbcAdapter
        implements OpinionMapGenerationManualRequestRepository {

    private final JdbcTemplate jdbc;

    public OpinionMapGenerationManualRequestJdbcAdapter(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public OpinionMapGenerationManualRequest insert(
            OpinionMapGenerationManualRequest request
    ) {
        Objects.requireNonNull(request, "request");
        jdbc.update("""
                        INSERT INTO opinion_map_generation_manual_requests (
                            request_id,
                            generation_id,
                            action,
                            previous_attempt_count,
                            previous_error_code,
                            requested_by,
                            requested_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                request.requestId(),
                request.generationId().value(),
                request.action().name(),
                request.previousAttemptCount(),
                request.previousErrorCode(),
                request.requestedBy(),
                Timestamp.from(request.requestedAt()));
        return request;
    }
}
