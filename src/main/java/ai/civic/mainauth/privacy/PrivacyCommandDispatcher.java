package ai.civic.mainauth.privacy;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PrivacyCommandDispatcher {
    private final JdbcTemplate jdbc;
    private final MainPrivacyDeletionHandler deletion;
    private final PrivacyOperationService operations;

    public PrivacyCommandDispatcher(
            JdbcTemplate jdbc,
            MainPrivacyDeletionHandler deletion,
            PrivacyOperationService operations) {
        this.jdbc = jdbc;
        this.deletion = deletion;
        this.operations = operations;
    }

    @Transactional
    public boolean dispatchMainOne() {
        var commands = jdbc.query("""
                select id, operation_id,
                       command_payload->>'subject_id' as subject_id,
                       command_payload->>'external_request_evidence_id' as evidence_id
                from privacy_command_outbox
                where service_code = 'MAIN' and delivered_at is null
                  and available_at <= now()
                  and (leased_until is null or leased_until < now())
                order by created_at for update skip locked limit 1
                """, (rs, rowNum) -> new MainCommand(
                rs.getObject("id", UUID.class),
                rs.getObject("operation_id", UUID.class),
                UUID.fromString(rs.getString("subject_id")),
                rs.getString("evidence_id")));
        if (commands.isEmpty()) return false;
        var command = commands.getFirst();
        jdbc.update("""
                update privacy_command_outbox
                set leased_until = now() + interval '30 seconds', attempt_count = attempt_count + 1
                where id = ? and delivered_at is null
                """, command.id());
        var result = deletion.delete(command.subjectId(), command.evidenceId());
        operations.recordResult(
                command.operationId(),
                "MAIN",
                "COMPLETE",
                "deleted=" + (result.deleted() ? 1 : 0)
                        + ",already_deleted=" + (result.alreadyDeleted() ? 1 : 0));
        markDelivered(command.id());
        return true;
    }

    @Transactional
    public boolean markDelivered(UUID commandId) {
        return jdbc.update("""
                update privacy_command_outbox set delivered_at = now(), leased_until = null
                where id = ? and delivered_at is null
                """, commandId) == 1;
    }

    private record MainCommand(UUID id, UUID operationId, UUID subjectId, String evidenceId) {}
}
