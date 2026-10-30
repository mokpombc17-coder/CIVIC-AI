package com.hamcheeze.vote.persona.infra.persistence;

import com.hamcheeze.vote.persona.application.PersonaGenerationInputSnapshot;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationInputRepository;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

@Repository
public class PersonaGenerationInputJdbcAdapter
        implements PersonaGenerationInputRepository {

    private final JdbcTemplate jdbcTemplate;

    public PersonaGenerationInputJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public PersonaGenerationInputSnapshot insert(
            PersonaGenerationInputSnapshot snapshot
    ) {
        jdbcTemplate.update(
                """
                INSERT INTO persona_generation_inputs (
                    generation_id, source_id, user_id,
                    request_schema_version, request_payload,
                    request_fingerprint, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                snapshot.generationId().value(),
                snapshot.sourceId().value(),
                snapshot.userId().value(),
                snapshot.requestSchemaVersion(),
                snapshot.requestPayload(),
                snapshot.requestFingerprint(),
                Timestamp.from(snapshot.createdAt()));
        return snapshot;
    }

    @Override
    public Optional<PersonaGenerationInputSnapshot> findByGenerationId(
            PersonaGenerationId generationId
    ) {
        List<PersonaGenerationInputSnapshot> matches = jdbcTemplate.query(
                """
                SELECT generation_id, source_id, user_id,
                       request_schema_version, request_payload,
                       request_fingerprint, created_at
                FROM persona_generation_inputs
                WHERE generation_id = ?
                """,
                this::map,
                generationId.value());
        return matches.stream().findFirst();
    }

    private PersonaGenerationInputSnapshot map(
            ResultSet resultSet,
            int rowNumber
    ) throws SQLException {
        return new PersonaGenerationInputSnapshot(
                new PersonaGenerationId(resultSet.getObject(
                        "generation_id", java.util.UUID.class)),
                new PersonaSourceId(resultSet.getObject(
                        "source_id", java.util.UUID.class)),
                new PersonaUserId(resultSet.getString("user_id")),
                resultSet.getInt("request_schema_version"),
                resultSet.getString("request_payload"),
                resultSet.getString("request_fingerprint"),
                resultSet.getTimestamp("created_at").toInstant());
    }
}
