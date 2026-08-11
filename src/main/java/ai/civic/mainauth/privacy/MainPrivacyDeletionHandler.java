package ai.civic.mainauth.privacy;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MainPrivacyDeletionHandler {
    private final JdbcTemplate jdbc;

    public MainPrivacyDeletionHandler(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public DeletionResult delete(UUID subjectId, String externalRequestEvidenceId) {
        var existing = jdbc.queryForObject(
                "select count(*) from deletion_tombstones where subject_id = ?",
                Integer.class, subjectId);
        if (existing != null && existing > 0) return new DeletionResult(false, true);

        jdbc.update("delete from sessions where user_id = ?", subjectId);
        jdbc.update("delete from auth_challenges where user_id = ?", subjectId);
        jdbc.update("delete from questionnaire_responses where user_id = ?", subjectId);
        jdbc.update("delete from consent_evidence where user_id = ?", subjectId);
        jdbc.update("delete from user_roles where user_id = ?", subjectId);
        jdbc.update("delete from credentials where user_id = ?", subjectId);
        var changed = jdbc.update("""
                update users set email = ?, normalized_email = ?, state = 'DELETED',
                    account_state_version = account_state_version + 1,
                    deleted_at = now(), deactivated_at = coalesce(deactivated_at, now()), updated_at = now()
                where id = ? and state <> 'DELETED'
                """, deletedEmail(subjectId), deletedEmail(subjectId), subjectId);
        if (changed == 0) {
            var exists = jdbc.queryForObject("select count(*) from users where id = ?", Integer.class, subjectId);
            if (exists == null || exists == 0) throw new IllegalArgumentException("Subject does not exist");
        }
        var version = jdbc.queryForObject(
                "select greatest(account_state_version, 1) from users where id = ?", Long.class, subjectId);
        jdbc.update("""
                insert into deletion_tombstones(
                    subject_id, external_request_evidence_id, deletion_version
                ) values (?, ?, ?)
                """, subjectId, externalRequestEvidenceId, version);
        return new DeletionResult(true, false);
    }

    private String deletedEmail(UUID id) {
        return "deleted+" + id + "@invalid.local";
    }

    public record DeletionResult(boolean deleted, boolean alreadyDeleted) {}
}
