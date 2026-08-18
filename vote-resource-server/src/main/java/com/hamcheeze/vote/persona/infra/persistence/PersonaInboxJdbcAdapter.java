package com.hamcheeze.vote.persona.infra.persistence;

import com.hamcheeze.vote.persona.application.integration.PersonaInboxReceipt;
import com.hamcheeze.vote.persona.application.port.out.PersonaInboxRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.util.Objects;
import java.util.UUID;

@Repository
public class PersonaInboxJdbcAdapter implements PersonaInboxRepository {

    private final JdbcTemplate jdbcTemplate;

    public PersonaInboxJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional
    public boolean recordIfAbsent(PersonaInboxReceipt receipt) {
        int inserted = jdbcTemplate.update("""
                INSERT INTO persona_inbox (
                    consumer_name, event_id, event_type, processed_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (consumer_name, event_id) DO NOTHING
                """,
                receipt.consumerName(),
                receipt.eventId(),
                receipt.eventType(),
                Timestamp.from(receipt.processedAt()));
        return inserted == 1;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean exists(String consumerName, UUID eventId) {
        Objects.requireNonNull(consumerName, "consumerName");
        Objects.requireNonNull(eventId, "eventId");
        Boolean exists = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM persona_inbox
                    WHERE consumer_name = ? AND event_id = ?)
                """, Boolean.class, consumerName, eventId);
        return Boolean.TRUE.equals(exists);
    }
}
