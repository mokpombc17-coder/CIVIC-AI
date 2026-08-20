package com.hamcheeze.vote.persona.infra.persistence;

import com.hamcheeze.vote.persona.application.PersonaGenerationRetryRequest;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRetryRequestRepository;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

@Repository
public class PersonaGenerationRetryRequestJdbcAdapter
        implements PersonaGenerationRetryRequestRepository {

    private final JdbcTemplate jdbcTemplate;

    public PersonaGenerationRetryRequestJdbcAdapter(
            JdbcTemplate jdbcTemplate
    ) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public PersonaGenerationRetryRequest insert(
            PersonaGenerationRetryRequest request
    ) {
        jdbcTemplate.update(
                """
                INSERT INTO persona_generation_retry_requests (
                    retry_request_id, generation_id, idempotency_key,
                    failed_attempt_count, requested_by, requested_at,
                    reason, request_fingerprint
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                request.retryRequestId(),
                request.generationId().value(),
                request.idempotencyKey(),
                request.failedAttemptCount(),
                request.requestedBy(),
                Timestamp.from(request.requestedAt()),
                request.reason(),
                request.requestFingerprint());
        return request;
    }

    @Override
    public Optional<PersonaGenerationRetryRequest> findByGenerationAndKey(
            PersonaGenerationId generationId,
            String idempotencyKey
    ) {
        List<PersonaGenerationRetryRequest> matches = jdbcTemplate.query(
                """
                SELECT retry_request_id, generation_id, idempotency_key,
                       failed_attempt_count, requested_by, requested_at,
                       reason, request_fingerprint
                FROM persona_generation_retry_requests
                WHERE generation_id = ? AND idempotency_key = ?
                """,
                this::map,
                generationId.value(),
                idempotencyKey);
        return matches.stream().findFirst();
    }

    private PersonaGenerationRetryRequest map(
            ResultSet resultSet,
            int rowNumber
    ) throws SQLException {
        return new PersonaGenerationRetryRequest(
                resultSet.getObject("retry_request_id", java.util.UUID.class),
                new PersonaGenerationId(resultSet.getObject(
                        "generation_id", java.util.UUID.class)),
                resultSet.getString("idempotency_key"),
                resultSet.getInt("failed_attempt_count"),
                resultSet.getString("requested_by"),
                resultSet.getTimestamp("requested_at").toInstant(),
                resultSet.getString("reason"),
                resultSet.getString("request_fingerprint"));
    }
}
