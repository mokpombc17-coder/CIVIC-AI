package ai.civic.mainauth.privacy;

import ai.civic.mainauth.admin.AdminPolicyException;
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

    @Transactional(noRollbackFor = {AdminPolicyException.class, IllegalArgumentException.class})
    public DeletionResult delete(UUID subjectId, String externalRequestEvidenceId) {
        var existing = jdbc.queryForObject(
                "select count(*) from deletion_tombstones where subject_id = ?",
                Integer.class, subjectId);
        if (existing != null && existing > 0) return new DeletionResult(false, true);
        lockHighestAdministratorChanges();
        var user = jdbc.queryForMap(
                "select normalized_email from users where id = ? for update", subjectId);
        var originalEmail = (String) user.get("normalized_email");
        var subjectIsHighestAdministrator = jdbc.queryForObject("""
                select count(*) from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = ? and ur.revoked_at is null and r.highest_admin
                """, Integer.class, subjectId);
        if (subjectIsHighestAdministrator != null && subjectIsHighestAdministrator > 0) {
            var activeHighestAdministrators = jdbc.queryForObject("""
                    select count(distinct u.id) from users u
                    join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                    join roles r on r.id = ur.role_id
                    where u.state = 'ACTIVE' and r.highest_admin
                    """, Integer.class);
            if (activeHighestAdministrators == null || activeHighestAdministrators <= 1) {
                throw new AdminPolicyException(
                        "The last active highest administrator cannot be privacy-deleted");
            }
        }
        var anonymizedEmail = deletedEmail(subjectId);

        jdbc.update("delete from sessions where user_id = ?", subjectId);
        jdbc.update("delete from auth_challenges where user_id = ?", subjectId);
        jdbc.update("delete from questionnaire_responses where user_id = ?", subjectId);
        jdbc.update("delete from consent_evidence where user_id = ?", subjectId);
        jdbc.update("delete from user_roles where user_id = ?", subjectId);
        jdbc.update("delete from credentials where user_id = ?", subjectId);
        jdbc.update("update signup_flows set email = ?, normalized_email = ? where normalized_email = ?",
                anonymizedEmail, anonymizedEmail, originalEmail);
        jdbc.update("update notification_outbox set recipient = ? where lower(btrim(recipient)) = ?",
                anonymizedEmail, originalEmail);
        var changed = jdbc.update("""
                update users set email = ?, normalized_email = ?, state = 'DELETED',
                    account_state_version = account_state_version + 1,
                    deleted_at = now(), deactivated_at = coalesce(deactivated_at, now()), updated_at = now()
                where id = ? and state <> 'DELETED'
                """, anonymizedEmail, anonymizedEmail, subjectId);
        if (changed == 0) {
            var exists = jdbc.queryForObject("select count(*) from users where id = ?", Integer.class, subjectId);
            if (exists == null || exists == 0) throw new IllegalArgumentException("Subject does not exist");
        }
        var version = jdbc.queryForObject(
                "select greatest(account_state_version, 1) from users where id = ?", Long.class, subjectId);
        jdbc.update("""
                insert into account_state_outbox(user_id, account_state_version, state, event_payload)
                select id, account_state_version, 'DELETED',
                    jsonb_build_object('subject_id', id, 'version', account_state_version,
                                       'state', 'DELETED', 'reason', 'PRIVACY_DELETION', 'at', now())
                from users where id = ?
                on conflict (user_id, account_state_version) do nothing
                """, subjectId);
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

    private void lockHighestAdministratorChanges() {
        jdbc.queryForObject(
                "select id from roles where code = 'SUPER_ADMIN' for update",
                Integer.class);
    }

    public record DeletionResult(boolean deleted, boolean alreadyDeleted) {}
}
