package ai.civic.mainauth.account;

import ai.civic.mainauth.admin.AdminPolicyException;
import ai.civic.mainauth.auth.AuthenticationException;
import ai.civic.mainauth.auth.SessionRevocationService;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

@Service
public class AccountLifecycleService {
    private final JdbcTemplate jdbc;
    private final SessionRevocationService sessions;
    private final Argon2PasswordEncoder passwords =
            Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();

    public AccountLifecycleService(JdbcTemplate jdbc, SessionRevocationService sessions) {
        this.jdbc = jdbc;
        this.sessions = sessions;
    }

    @Transactional
    public void deactivateSelf(
            UUID actorId, UUID subjectId, String password) {
        if (actorId == null || !actorId.equals(subjectId)) {
            throw new AdminPolicyException("Account deactivation is self-service only");
        }
        lockHighestAdminLifecycleChanges();
        verifyPasswordUnderUserLock(subjectId, password);
        deactivate(actorId, subjectId, "SELF_DEACTIVATION");
    }

    @Transactional
    public void deactivateForUnder14Determination(UUID subjectId) {
        deactivate(null, subjectId, "UNDER_14_DETERMINATION");
    }

    private void deactivate(UUID actorId, UUID subjectId, String reason) {
        lockHighestAdminLifecycleChanges();
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
        jdbc.update("""
                update auth_challenges set consumed_at = now()
                where user_id = ? and consumed_at is null
                """, subjectId);
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
                """, actorId, subjectId, reason);
    }

    private void lockHighestAdminLifecycleChanges() {
        jdbc.queryForObject(
                "select id from roles where code = 'SUPER_ADMIN' for update",
                Integer.class);
    }

    private void verifyPasswordUnderUserLock(UUID subjectId, String password) {
        var hashes = jdbc.query("""
                select c.password_hash from users u
                join credentials c on c.user_id = u.id
                where u.id = ? for update of u, c
                """, (rs, rowNum) -> rs.getString("password_hash"), subjectId);
        var matches = false;
        if (hashes.size() == 1 && password != null) {
            try {
                matches = passwords.matches(password, hashes.getFirst());
            } catch (RuntimeException ignored) {
                matches = false;
            }
        }
        if (!matches) {
            throw new AuthenticationException("Email or password is invalid");
        }
    }
}
