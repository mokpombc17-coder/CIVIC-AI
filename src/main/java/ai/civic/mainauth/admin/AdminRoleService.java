package ai.civic.mainauth.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ai.civic.mainauth.auth.SessionService;

@Service
public class AdminRoleService {
    private static final Set<String> ALLOWED = Set.of("PARTICIPANT", "RAG_ADMIN", "ADMIN", "HIGHEST_ADMIN");
    private static final Set<String> ADMIN_ROLES = Set.of("RAG_ADMIN", "ADMIN", "HIGHEST_ADMIN");
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final SessionService sessions;

    public AdminRoleService(JdbcTemplate jdbc, ObjectMapper json, SessionService sessions) {
        this.jdbc = jdbc;
        this.json = json;
        this.sessions = sessions;
    }

    @Transactional
    public void replaceRoles(
            UUID actorId,
            UUID subjectId,
            long expectedVersion,
            Set<String> desiredRoles,
            String reason,
            boolean impactConfirmed) {
        requireActiveHighestAdminWithRotatedPassword(actorId);
        var normalizedReason = reason == null ? "" : reason.strip();
        if (normalizedReason.isEmpty() || normalizedReason.length() > 1000) {
            throw new AdminPolicyException("A role change reason between 1 and 1000 characters is required");
        }
        if (desiredRoles == null || desiredRoles.isEmpty() || !ALLOWED.containsAll(desiredRoles)) {
            throw new AdminPolicyException("At least one known role is required");
        }
        var subject = jdbc.queryForMap("select row_version, state from users where id = ? for update", subjectId);
        var currentVersion = ((Number) subject.get("row_version")).longValue();
        if (currentVersion != expectedVersion) throw new AdminVersionConflictException("User version is stale");
        var current = Set.copyOf(rolesOf(subjectId));
        var removedAdminRoles = new java.util.HashSet<>(current);
        removedAdminRoles.removeAll(desiredRoles);
        removedAdminRoles.retainAll(ADMIN_ROLES);
        if (!removedAdminRoles.isEmpty() && !impactConfirmed) {
            throw new AdminPolicyException("Administrator role revocation requires impact confirmation");
        }
        var newAdminRoles = new java.util.HashSet<>(desiredRoles);
        newAdminRoles.removeAll(current);
        newAdminRoles.retainAll(ADMIN_ROLES);
        if (!"ACTIVE".equals(subject.get("state")) && !newAdminRoles.isEmpty()) {
            throw new AdminPolicyException("New administrator roles require an active account");
        }
        if (actorId.equals(subjectId) && current.contains("HIGHEST_ADMIN") && !desiredRoles.contains("HIGHEST_ADMIN")) {
            throw new AdminPolicyException("Highest administrators cannot demote themselves");
        }
        if (current.contains("HIGHEST_ADMIN") && !desiredRoles.contains("HIGHEST_ADMIN")
                && activeHighestAdminCount() <= 1) {
            throw new AdminPolicyException("At least one active highest administrator is required");
        }
        jdbc.update("update user_roles set revoked_at = now() where user_id = ? and revoked_at is null", subjectId);
        for (var role : desiredRoles) {
            jdbc.update("""
                    insert into user_roles(user_id, role_id, granted_by)
                    select ?, id, ? from roles where code = ?
                    """, subjectId, actorId, databaseRole(role));
        }
        jdbc.update("update users set row_version = row_version + 1, updated_at = now() where id = ?", subjectId);
        sessions.revokeAll(subjectId, "ROLES_CHANGED");
        appendAudit(actorId, subjectId, current, desiredRoles, normalizedReason);
    }

    @Transactional(readOnly = true)
    public List<String> rolesOf(UUID userId) {
        return jdbc.queryForList("""
                select case r.code
                         when 'SUPER_ADMIN' then 'HIGHEST_ADMIN'
                         when 'RAG_OPERATOR' then 'RAG_ADMIN'
                         else r.code
                       end as api_role
                from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = ? and ur.revoked_at is null order by r.code
                """, String.class, userId);
    }

    private void requireActiveHighestAdminWithRotatedPassword(UUID actorId) {
        var allowed = jdbc.queryForObject("""
                select count(*) from users u join credentials c on c.user_id = u.id
                join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                join roles r on r.id = ur.role_id
                where u.id = ? and u.state = 'ACTIVE' and r.highest_admin and not c.must_change_password
                """, Integer.class, actorId);
        if (allowed == null || allowed != 1) {
            throw new AdminPolicyException("Administrator password rotation is required");
        }
    }

    private int activeHighestAdminCount() {
        return jdbc.queryForObject("""
                select count(distinct u.id) from users u join user_roles ur on ur.user_id = u.id
                join roles r on r.id = ur.role_id
                where u.state = 'ACTIVE' and ur.revoked_at is null and r.highest_admin
                """, Integer.class);
    }

    private void appendAudit(
            UUID actor,
            UUID subject,
            Set<String> beforeRoles,
            Set<String> afterRoles,
            String reason) {
        try {
            jdbc.update("""
                    insert into audit_outbox(event_type, actor_user_id, subject_user_id, payload)
                    values ('ADMIN_ROLES_REPLACED', ?, ?, ?::jsonb)
                    """, actor, subject, json.writeValueAsString(java.util.Map.of(
                            "before_roles", beforeRoles,
                            "after_roles", afterRoles,
                            "reason", reason)));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not append role audit event", exception);
        }
    }

    private String databaseRole(String apiRole) {
        return switch (apiRole) {
            case "HIGHEST_ADMIN" -> "SUPER_ADMIN";
            case "RAG_ADMIN" -> "RAG_OPERATOR";
            default -> apiRole;
        };
    }
}
