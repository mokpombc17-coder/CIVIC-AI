package ai.civic.mainauth.privacy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PrivacyOperationService {
    private static final Set<String> ALLOWED_SCOPES = Set.of("ACCOUNT", "RAG");
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public PrivacyOperationService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Transactional
    public UUID start(String evidenceId, UUID subjectId, Set<String> scopes, boolean requestVerified) {
        if (!requestVerified || evidenceId == null || evidenceId.isBlank() || subjectId == null
                || scopes == null || scopes.isEmpty() || !ALLOWED_SCOPES.containsAll(scopes)) {
            throw new IllegalArgumentException("Verified external request evidence and valid scope are required");
        }
        var subjectExists = jdbc.queryForObject(
                "select count(*) from users where id = ?", Integer.class, subjectId);
        if (subjectExists == null || subjectExists != 1) {
            throw new IllegalArgumentException("Privacy subject does not exist");
        }
        var existing = jdbc.query("""
                select id, subject_id, requested_scopes::text
                from privacy_operations where external_request_evidence_id = ?
                """, (rs, rowNum) -> new StoredOperation(
                rs.getObject("id", UUID.class), rs.getObject("subject_id", UUID.class),
                rs.getString("requested_scopes")), evidenceId);
        if (!existing.isEmpty()) {
            var stored = existing.getFirst();
            try {
                var storedScopes = json.readValue(stored.requestedScopes(), new TypeReference<Set<String>>() {});
                if (!subjectId.equals(stored.subjectId()) || !scopes.equals(storedScopes)) {
                    throw new IllegalArgumentException(
                            "Privacy idempotency evidence does not match the original request");
                }
                return stored.id();
            } catch (IllegalArgumentException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new IllegalStateException("Could not verify privacy idempotency", exception);
            }
        }
        try {
            var id = UUID.randomUUID();
            jdbc.update("""
                    insert into privacy_operations(
                        id, external_request_evidence_id, subject_id, requested_scopes,
                        request_verified, status
                    ) values (?, ?, ?, ?::jsonb, true, 'PENDING')
                    """, id, evidenceId, subjectId, json.writeValueAsString(scopes));
            if (scopes.contains("ACCOUNT")) enqueue(id, subjectId, "MAIN", evidenceId);
            if (scopes.contains("RAG")) enqueue(id, subjectId, "RAG", evidenceId);
            return id;
        } catch (Exception exception) {
            throw new IllegalStateException("Could not start privacy operation", exception);
        }
    }

    @Transactional
    public void recordResult(UUID operationId, String service, String resultStatus, String aggregateEvidence) {
        if (!Set.of("MAIN", "RAG").contains(service)
                || !Set.of("COMPLETE", "FAILED").contains(resultStatus)
                || aggregateEvidence == null || aggregateEvidence.isBlank()) {
            throw new IllegalArgumentException("Aggregate privacy result is invalid");
        }
        var enqueued = jdbc.queryForObject("""
                select count(*) from privacy_command_outbox
                where operation_id = ? and service_code = ?
                """, Integer.class, operationId, service);
        if (enqueued == null || enqueued != 1) {
            throw new IllegalArgumentException("Privacy result service was not enqueued");
        }
        jdbc.update("""
                insert into privacy_results(operation_id, service_code, result_status, aggregate_evidence)
                values (?, ?, ?, ?) on conflict(operation_id, service_code) do nothing
                """, operationId, service, resultStatus, aggregateEvidence);
        var expected = jdbc.queryForObject(
                "select count(*) from privacy_command_outbox where operation_id = ?",
                Integer.class, operationId);
        var complete = jdbc.queryForObject("""
                select count(*) from privacy_results
                where operation_id = ? and result_status = 'COMPLETE'
                """, Integer.class, operationId);
        var anyFailed = jdbc.queryForObject("""
                select count(*) from privacy_results
                where operation_id = ? and result_status = 'FAILED'
                """, Integer.class, operationId);
        var status = complete != null && expected != null && complete.equals(expected)
                ? "COMPLETE" : anyFailed != null && anyFailed > 0 ? "FAILED" : "PARTIAL";
        jdbc.update("update privacy_operations set status = ?, updated_at = now() where id = ?",
                status, operationId);
    }

    @Transactional(readOnly = true)
    public String status(UUID operationId) {
        return jdbc.queryForObject("select status from privacy_operations where id = ?", String.class, operationId);
    }

    private void enqueue(UUID operationId, UUID subjectId, String service, String evidenceId) throws Exception {
        var payload = json.writeValueAsString(Map.of(
                "operation_id", operationId.toString(),
                "subject_id", subjectId.toString(),
                "external_request_evidence_id", evidenceId,
                "scope", service.equals("MAIN") ? "ACCOUNT" : "RAG"));
        jdbc.update("""
                insert into privacy_command_outbox(operation_id, service_code, command_payload)
                values (?, ?, ?::jsonb)
                """, operationId, service, payload);
    }

    private record StoredOperation(UUID id, UUID subjectId, String requestedScopes) {}
}
