package com.hamcheeze.vote.result.infra.persistence;

import com.hamcheeze.vote.result.application.integration.ResultInboxReceipt;
import com.hamcheeze.vote.result.application.port.out.ResultInboxRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ResultInboxJdbcAdapter implements ResultInboxRepository {

    private final JdbcTemplate jdbcTemplate;

    public ResultInboxJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional
    public boolean recordIfAbsent(ResultInboxReceipt receipt) {
        Objects.requireNonNull(receipt, "receipt");
        int inserted = jdbcTemplate.update("""
                INSERT INTO result_inbox (
                    consumer_name, event_id, event_type, schema_version,
                    occurred_at, aggregate_type, aggregate_id, payload,
                    processed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (consumer_name, event_id) DO NOTHING
                """,
                receipt.consumerName(),
                receipt.eventId(),
                receipt.eventType(),
                receipt.schemaVersion(),
                Timestamp.from(receipt.occurredAt()),
                receipt.aggregateType(),
                receipt.aggregateId(),
                receipt.payload(),
                Timestamp.from(receipt.processedAt()));
        return inserted == 1;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ResultInboxReceipt> find(
            String consumerName,
            UUID eventId
    ) {
        Objects.requireNonNull(consumerName, "consumerName");
        Objects.requireNonNull(eventId, "eventId");
        return jdbcTemplate.query("""
                SELECT consumer_name, event_id, event_type, schema_version,
                       occurred_at, aggregate_type, aggregate_id,
                       payload, processed_at
                FROM result_inbox
                WHERE consumer_name = ? AND event_id = ?
                """,
                (resultSet, rowNumber) -> new ResultInboxReceipt(
                        resultSet.getString("consumer_name"),
                        resultSet.getObject("event_id", UUID.class),
                        resultSet.getString("event_type"),
                        resultSet.getInt("schema_version"),
                        resultSet.getTimestamp("occurred_at").toInstant(),
                        resultSet.getString("aggregate_type"),
                        resultSet.getObject("aggregate_id", UUID.class),
                        resultSet.getString("payload"),
                        resultSet.getTimestamp("processed_at").toInstant()),
                consumerName,
                eventId).stream().findFirst();
    }
}
