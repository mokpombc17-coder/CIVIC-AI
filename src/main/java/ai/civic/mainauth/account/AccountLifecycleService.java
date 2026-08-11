package ai.civic.mainauth.account;

import ai.civic.mainauth.admin.AdminPolicyException;
import ai.civic.mainauth.auth.SessionService;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountLifecycleService {
    private final JdbcTemplate jdbc;
    private final SessionService sessions;

    public AccountLifecycleService(JdbcTemplate jdbc, SessionService sessions) {
        this.jdbc = jdbc;
        this.sessions = sessions;
    }

    @Transactional
    public void deactivateSelf(UUID actorId, UUID subjectId) {
        if (actorId == null || !actorId.equals(subjectId)) {
            throw new AdminPolicyException("Account deactivation is self-service only");
        }
        deactivate(subjectId, "SELF_DEACTIVATION");
    }

    @Transactional
    public void deactivateForUnder14Determination(UUID subjectId) {
        deactivate(subjectId, "UNDER_14_DETERMINATION");
    }

    private void deactivate(UUID subjectId, String reason) {
        var highest = jdbc.queryForObject("""
                select count(*) from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = ? and ur.revoked_at is null and r.highest_admin
                """, Integer.class, subjectId);
        if (highest != null && highest > 0) {
            var count = jdbc.queryForObject("""
                    select count(distinct u.id) from users u
                    join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                    join roles r on r.id = ur.role_id
                    where u.state = 'ACTIVE' and r.highest_admin
                    """, Integer.class);
            if (count == null || count <= 1) {
                throw new AdminPolicyException("The last active highest administrator cannot deactivate");
            }
        }
        var changed = jdbc.update("""
                update users set state = 'DEACTIVATED', deactivated_at = now(),
                    account_state_version = account_state_version + 1, updated_at = now()
                where id = ? and state = 'ACTIVE'
                """, subjectId);
        if (changed != 1) throw new AdminPolicyException("Only active accounts can be deactivated");
        sessions.revokeAll(subjectId, "ACCOUNT_DEACTIVATED");
        jdbc.update("""
                insert into account_state_outbox(user_id, account_state_version, state, event_payload)
                select id, account_state_version, 'DEACTIVATED',
                    jsonb_build_object('subject_id', id, 'version', account_state_version,
                                       'state', 'INACTIVE', 'reason', ?::text, 'at', now())
                from users where id = ?
                """, reason, subjectId);
        jdbc.update("""
                insert into audit_outbox(event_type, actor_user_id, subject_user_id, payload)
                values ('ACCOUNT_DEACTIVATED', ?, ?, jsonb_build_object('reason', ?::text))
                """, subjectId, subjectId, reason);
    }
}
