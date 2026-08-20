package com.hamcheeze.vote.persona.infra.persistence;

import com.hamcheeze.vote.persona.application.PersonaGenerationAttempt;
import com.hamcheeze.vote.persona.application.PersonaGenerationAttemptOutcome;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationAttemptRepository;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

@Repository
public class PersonaGenerationAttemptJdbcAdapter
        implements PersonaGenerationAttemptRepository {

    private final JdbcTemplate jdbcTemplate;

    public PersonaGenerationAttemptJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public PersonaGenerationAttempt insert(PersonaGenerationAttempt attempt) {
        jdbcTemplate.update(
                """
                INSERT INTO persona_generation_attempts (
                    generation_id, attempt_number, claim_token,
                    started_at, lease_expires_at, outcome, finished_at,
                    error_code, late_completion_observed_at, worker_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                attempt.generationId().value(),
                attempt.attemptNumber(),
                attempt.claimToken().value(),
                Timestamp.from(attempt.startedAt()),
                Timestamp.from(attempt.leaseExpiresAt()),
                attempt.outcome().name(),
                attempt.finishedAt().map(Timestamp::from).orElse(null),
                attempt.errorCode().orElse(null),
                attempt.lateCompletionObservedAt()
                        .map(Timestamp::from).orElse(null),
                attempt.workerId());
        return attempt;
    }

    @Override
    public PersonaGenerationAttempt update(PersonaGenerationAttempt attempt) {
        int updated = jdbcTemplate.update(
                """
                UPDATE persona_generation_attempts
                SET outcome = ?,
                    finished_at = ?,
                    error_code = ?,
                    late_completion_observed_at = ?
                WHERE generation_id = ? AND attempt_number = ?
                """,
                attempt.outcome().name(),
                attempt.finishedAt().map(Timestamp::from).orElse(null),
                attempt.errorCode().orElse(null),
                attempt.lateCompletionObservedAt()
                        .map(Timestamp::from).orElse(null),
                attempt.generationId().value(),
                attempt.attemptNumber());
        if (updated != 1) {
            throw new IllegalStateException(
                    "persona generation attempt not found");
        }
        return attempt;
    }

    @Override
    public Optional<PersonaGenerationAttempt> findByClaimToken(
            PersonaGenerationClaimToken claimToken
    ) {
        List<PersonaGenerationAttempt> matches = jdbcTemplate.query(
                """
                SELECT generation_id, attempt_number, claim_token,
                       started_at, lease_expires_at, outcome, finished_at,
                       error_code, late_completion_observed_at, worker_id
                FROM persona_generation_attempts
                WHERE claim_token = ?
                """,
                this::map,
                claimToken.value());
        return matches.stream().findFirst();
    }

    private PersonaGenerationAttempt map(
            ResultSet resultSet,
            int rowNumber
    ) throws SQLException {
        return new PersonaGenerationAttempt(
                new PersonaGenerationId(resultSet.getObject(
                        "generation_id", java.util.UUID.class)),
                resultSet.getInt("attempt_number"),
                new PersonaGenerationClaimToken(resultSet.getObject(
                        "claim_token", java.util.UUID.class)),
                resultSet.getTimestamp("started_at").toInstant(),
                resultSet.getTimestamp("lease_expires_at").toInstant(),
                PersonaGenerationAttemptOutcome.valueOf(
                        resultSet.getString("outcome")),
                optionalInstant(resultSet, "finished_at"),
                Optional.ofNullable(resultSet.getString("error_code")),
                optionalInstant(resultSet,
                        "late_completion_observed_at"),
                resultSet.getString("worker_id"));
    }

    private static Optional<java.time.Instant> optionalInstant(
            ResultSet resultSet,
            String column
    ) throws SQLException {
        Timestamp value = resultSet.getTimestamp(column);
        return value == null
                ? Optional.empty() : Optional.of(value.toInstant());
    }
}
