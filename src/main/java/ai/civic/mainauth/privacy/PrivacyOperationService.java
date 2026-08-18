package ai.civic.mainauth.privacy;

import ai.civic.mainauth.admin.AdminPolicyException;
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
    public UUID start(
            UUID actorId,
            String evidenceId,
            UUID subjectId,
            Set<String> scopes,
            boolean requestVerified) {
        lockHighestAdminRoleChanges();
        requireCurrentHighestAdministrator(actorId);
        if (!requestVerified || evidenceId == null || evidenceId.isBlank() || subjectId == null
                || scopes == null || scopes.isEmpty() || !ALLOWED_SCOPES.containsAll(scopes)) {
            throw new IllegalArgumentException("Verified external request evidence and valid scope are required");
        }
        var subjectExists = jdbc.queryForObject(
                "select count(*) from users where id = ?", Integer.class, subjectId);
        if (subjectExists == null || subjectExists != 1) {
            throw new IllegalArgumentException("Privacy subject does not exist");
        }
        final String requestedScopes;
        try {
            requestedScopes = json.writeValueAsString(scopes);
        } catch (Exception exception) {
            throw new IllegalStateException("Could not serialize privacy scopes", exception);
        }
        var id = UUID.randomUUID();
        var inserted = jdbc.update("""
                    insert into privacy_operations(
                        id, external_request_evidence_id, subject_id, requested_scopes,
                        request_verified, status
                    ) values (?, ?, ?, ?::jsonb, true, 'PENDING')
                    on conflict (external_request_evidence_id) do nothing
                    """, id, evidenceId, subjectId, requestedScopes);
        if (inserted == 0) {
            return loadAndValidateExisting(evidenceId, subjectId, scopes).id();
        }
        try {
            if (scopes.contains("ACCOUNT")) enqueue(id, subjectId, "MAIN", evidenceId);
            if (scopes.contains("RAG")) enqueue(id, subjectId, "RAG", evidenceId);
            return id;
        } catch (Exception exception) {
            throw new IllegalStateException("Could not start privacy operation", exception);
        }
    }

    private StoredOperation loadAndValidateExisting(
            String evidenceId, UUID subjectId, Set<String> scopes) {
        var stored = jdbc.queryForObject("""
                select id, subject_id, requested_scopes::text
                from privacy_operations where external_request_evidence_id = ?
                """, (rs, rowNum) -> new StoredOperation(
                rs.getObject("id", UUID.class), rs.getObject("subject_id", UUID.class),
                rs.getString("requested_scopes")), evidenceId);
        try {
            var storedScopes = json.readValue(
                    stored.requestedScopes(), new TypeReference<Set<String>>() {});
            if (!subjectId.equals(stored.subjectId()) || !scopes.equals(storedScopes)) {
                throw new IllegalArgumentException(
                        "Privacy idempotency evidence does not match the original request");
            }
            return stored;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Could not verify privacy idempotency", exception);
        }
    }

    @Transactional
    public void recordResult(UUID operationId, String service, String resultStatus, String aggregateEvidence) {
        if (!Set.of("MAIN", "RAG").contains(service)
                || !Set.of("COMPLETE", "FAILED").contains(resultStatus)
                || aggregateEvidence == null || aggregateEvidence.isBlank()) {
            throw new IllegalArgumentException("Aggregate privacy result is invalid");
        }
        var operation = jdbc.query(
                "select id from privacy_operations where id = ? for update",
                (rs, rowNum) -> rs.getObject("id", UUID.class), operationId);
        if (operation.size() != 1) {
            throw new IllegalArgumentException("Privacy operation does not exist");
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
        var statuses = jdbc.queryForList(
                "select status from privacy_operations where id = ?", String.class, operationId);
        if (statuses.size() != 1) {
            throw new PrivacyOperationNotFoundException();
        }
        return statuses.getFirst();
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

    private void lockHighestAdminRoleChanges() {
        jdbc.queryForObject(
                "select id from roles where code = 'SUPER_ADMIN' for update",
                Integer.class);
    }

    private void requireCurrentHighestAdministrator(UUID actorId) {
        Integer allowed = actorId == null ? 0 : jdbc.queryForObject("""
                select count(*) from users u
                join credentials c on c.user_id = u.id
                join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                join roles r on r.id = ur.role_id
                where u.id = ? and u.state = 'ACTIVE'
                  and r.highest_admin and not c.must_change_password
                """, Integer.class, actorId);
        if (allowed == null || allowed != 1) {
            throw new AdminPolicyException("Current highest administrator authority is required");
        }
    }

    private record StoredOperation(UUID id, UUID subjectId, String requestedScopes) {}
}
