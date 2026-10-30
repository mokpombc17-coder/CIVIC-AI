package ai.civic.mainauth.privacy;

import ai.civic.mainauth.admin.AdminPolicyException;
import java.util.UUID;
import java.util.LinkedHashMap;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PrivacyCommandDispatcher {
    static final String RAG_COMMAND_STREAM = "civic.privacy-command.v1";
    private final JdbcTemplate jdbc;
    private final StringRedisTemplate redis;
    private final MainPrivacyDeletionHandler deletion;
    private final PrivacyOperationService operations;

    public PrivacyCommandDispatcher(
            JdbcTemplate jdbc,
            StringRedisTemplate redis,
            MainPrivacyDeletionHandler deletion,
            PrivacyOperationService operations) {
        this.jdbc = jdbc;
        this.redis = redis;
        this.deletion = deletion;
        this.operations = operations;
    }

    @Transactional
    public boolean dispatchRagOne() {
        var commands = jdbc.query("""
                select id, operation_id,
                       command_payload->>'subject_id' as subject_id,
                       command_payload->>'external_request_evidence_id' as evidence_id,
                       command_payload->>'scope' as scope
                from privacy_command_outbox
                where service_code = 'RAG' and delivered_at is null
                  and available_at <= now()
                  and (leased_until is null or leased_until < now())
                order by created_at for update skip locked limit 1
                """, (rs, rowNum) -> new RagCommand(
                rs.getObject("id", UUID.class),
                rs.getObject("operation_id", UUID.class),
                rs.getString("subject_id"),
                rs.getString("evidence_id"),
                rs.getString("scope")));
        if (commands.isEmpty()) return false;
        var command = commands.getFirst();
        jdbc.update("""
                update privacy_command_outbox
                set leased_until = now() + interval '30 seconds', attempt_count = attempt_count + 1
                where id = ? and delivered_at is null
                """, command.id());
        var fields = new LinkedHashMap<String, String>();
        fields.put("operation_id", command.operationId().toString());
        fields.put("subject_id", command.subjectId());
        fields.put("external_request_evidence_id", command.evidenceId());
        fields.put("scope", command.scope());
        redis.opsForStream().add(StreamRecords.mapBacked(fields).withStreamKey(RAG_COMMAND_STREAM));
        markDelivered(command.id());
        return true;
    }

    @Transactional
    public boolean dispatchMainOne() {
        var commands = jdbc.query("""
                select id, operation_id,
                       command_payload->>'subject_id' as subject_id,
                       command_payload->>'external_request_evidence_id' as evidence_id,
                       command_payload->>'ledger_aggregate_evidence' as ledger_aggregate_evidence,
                       command_payload->>'deletion_version' as deletion_version,
                       command_payload->>'completed_at' as completed_at
                from privacy_command_outbox
                where service_code = 'MAIN' and delivered_at is null
                  and available_at <= now()
                  and (leased_until is null or leased_until < now())
                order by created_at for update skip locked limit 1
                """, (rs, rowNum) -> new MainCommand(
                rs.getObject("id", UUID.class),
                rs.getObject("operation_id", UUID.class),
                UUID.fromString(rs.getString("subject_id")),
                rs.getString("evidence_id"),
                rs.getString("ledger_aggregate_evidence"),
                rs.getString("deletion_version"),
                rs.getString("completed_at")));
        if (commands.isEmpty()) return false;
        var command = commands.getFirst();
        jdbc.update("""
                update privacy_command_outbox
                set leased_until = now() + interval '30 seconds', attempt_count = attempt_count + 1
                where id = ? and delivered_at is null
                """, command.id());
        if (command.ledgerAggregateEvidence() != null) {
            publishMainDeletionLedger(
                    command,
                    new MainLedger(
                            Long.parseLong(command.deletionVersion()), command.completedAt()),
                    command.ledgerAggregateEvidence());
            markDelivered(command.id());
            return true;
        }
        try {
            deletion.delete(command.subjectId(), command.evidenceId());
            var ledger = jdbc.queryForObject("""
                    select deletion_version, deleted_at::text
                    from deletion_tombstones where subject_id = ?
                    """, (rs, rowNum) -> new MainLedger(
                    rs.getLong("deletion_version"), rs.getString("deleted_at")), command.subjectId());
            jdbc.update("""
                    update privacy_command_outbox
                    set command_payload = command_payload || jsonb_build_object(
                            'ledger_aggregate_evidence', 'account_anonymized=1',
                            'deletion_version', ?, 'completed_at', ?),
                        leased_until = null, available_at = now()
                    where id = ? and delivered_at is null
                    """, Long.toString(ledger.deletionVersion()), ledger.completedAt(), command.id());
            return true;
        } catch (AdminPolicyException exception) {
            operations.recordResult(
                    command.operationId(), "MAIN", "FAILED", "deleted=0,policy_blocked=1");
        } catch (IllegalArgumentException | EmptyResultDataAccessException exception) {
            operations.recordResult(
                    command.operationId(), "MAIN", "FAILED", "deleted=0,subject_missing=1");
        }
        markDelivered(command.id());
        return true;
    }

    private void publishMainDeletionLedger(
            MainCommand command, MainLedger ledger, String aggregateEvidence) {
        var fields = new LinkedHashMap<String, String>();
        fields.put("operation_id", command.operationId().toString());
        fields.put("subject_id", command.subjectId().toString());
        fields.put("external_request_evidence_id", command.evidenceId());
        fields.put("scope", "ACCOUNT_LEDGER");
        fields.put("aggregate_evidence", aggregateEvidence);
        fields.put("deletion_version", Long.toString(ledger.deletionVersion()));
        fields.put("completed_at", ledger.completedAt());
        redis.opsForStream().add(StreamRecords.mapBacked(fields).withStreamKey(RAG_COMMAND_STREAM));
    }

    @Transactional
    public boolean markDelivered(UUID commandId) {
        return jdbc.update("""
                update privacy_command_outbox set delivered_at = now(), leased_until = null
                where id = ? and delivered_at is null
                """, commandId) == 1;
    }

    private record MainCommand(
            UUID id,
            UUID operationId,
            UUID subjectId,
            String evidenceId,
            String ledgerAggregateEvidence,
            String deletionVersion,
            String completedAt) {}

    private record MainLedger(long deletionVersion, String completedAt) {}

    private record RagCommand(
            UUID id, UUID operationId, String subjectId, String evidenceId, String scope) {}
}
