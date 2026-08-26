package ai.civic.mainauth.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ai.civic.mainauth.auth.RefreshTokenService;

@Service
public class AdminRoleService {
    private static final Set<String> ALLOWED_ROLES = Set.of("PARTICIPANT", "ADMIN", "HIGHEST_ADMIN");
    private static final Set<String> ALLOWED_PERMISSIONS = Set.of(
            "RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN");
    private static final Set<String> ADMIN_ROLES = Set.of("ADMIN", "HIGHEST_ADMIN");
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final RefreshTokenService refreshTokens;
    private final AdminAuthorizationService authorization;

    public AdminRoleService(
            JdbcTemplate jdbc,
            ObjectMapper json,
            RefreshTokenService refreshTokens,
            AdminAuthorizationService authorization) {
        this.jdbc = jdbc;
        this.json = json;
        this.refreshTokens = refreshTokens;
        this.authorization = authorization;
    }

    @Transactional
    public void replaceRolesAuthorized(
            String accessToken,
            UUID subjectId,
            long expectedVersion,
            Set<String> desiredRoles,
            Set<String> desiredPermissions,
            String reason,
            boolean impactConfirmed) {
        lockHighestAdminRoleChanges();
        var actor = authorization.requireCurrentAdmin(accessToken, true);
        replaceRolesAfterAuthorization(
                actor.userId(), subjectId, expectedVersion, desiredRoles, desiredPermissions,
                reason, impactConfirmed);
    }

    @Transactional
    public void replaceRoles(
            UUID actorId,
            UUID subjectId,
            long expectedVersion,
            Set<String> desiredRoles,
            String reason,
            boolean impactConfirmed) {
        replaceRoles(
                actorId,
                subjectId,
                expectedVersion,
                desiredRoles,
                Set.copyOf(permissionsOf(subjectId)),
                reason,
                impactConfirmed);
    }

    @Transactional
    public void replaceRoles(
            UUID actorId,
            UUID subjectId,
            long expectedVersion,
            Set<String> desiredRoles,
            Set<String> desiredPermissions,
            String reason,
            boolean impactConfirmed) {
        lockHighestAdminRoleChanges();
        requireActiveHighestAdminWithRotatedPassword(actorId);
        replaceRolesAfterAuthorization(
                actorId, subjectId, expectedVersion, desiredRoles, desiredPermissions,
                reason, impactConfirmed);
    }

    private void replaceRolesAfterAuthorization(
            UUID actorId,
            UUID subjectId,
            long expectedVersion,
            Set<String> desiredRoles,
            Set<String> desiredPermissions,
            String reason,
            boolean impactConfirmed) {
        var normalizedReason = reason == null ? "" : reason.strip();
        if (normalizedReason.isEmpty() || normalizedReason.length() > 1000) {
            throw new AdminPolicyException("A role change reason between 1 and 1000 characters is required");
        }
        if (desiredRoles == null || desiredRoles.isEmpty() || !ALLOWED_ROLES.containsAll(desiredRoles)) {
            throw new AdminPolicyException("At least one known role is required");
        }
        if (desiredPermissions == null || !ALLOWED_PERMISSIONS.containsAll(desiredPermissions)) {
            throw new AdminPolicyException("Only known administrator permissions are allowed");
        }
        if (!desiredPermissions.isEmpty()
                && desiredRoles.stream().noneMatch(ADMIN_ROLES::contains)) {
            throw new AdminPolicyException("Administrator permissions require an administrator role");
        }
        var subjects = jdbc.queryForList(
                "select row_version, state from users where id = ? for update", subjectId);
        if (subjects.size() != 1) throw new AdminUserNotFoundException();
        var subject = subjects.getFirst();
        if ("DELETED".equals(subject.get("state"))) {
            throw new AdminPolicyException("Role changes are forbidden for a deleted account");
        }
        if ("PENDING_EMAIL_VERIFICATION".equals(subject.get("state"))) {
            throw new AdminPolicyException("Role changes require a verified account");
        }
        var currentVersion = ((Number) subject.get("row_version")).longValue();
        if (currentVersion != expectedVersion) throw new AdminVersionConflictException("User version is stale");
        var current = Set.copyOf(rolesOf(subjectId));
        var currentPermissions = Set.copyOf(permissionsOf(subjectId));
        var removedAdminRoles = new java.util.HashSet<>(current);
        removedAdminRoles.removeAll(desiredRoles);
        removedAdminRoles.retainAll(ADMIN_ROLES);
        var removedPermissions = new java.util.HashSet<>(currentPermissions);
        removedPermissions.removeAll(desiredPermissions);
        if ((!removedAdminRoles.isEmpty() || !removedPermissions.isEmpty()) && !impactConfirmed) {
            throw new AdminPolicyException("Administrator access revocation requires impact confirmation");
        }
        var newAdminRoles = new java.util.HashSet<>(desiredRoles);
        newAdminRoles.removeAll(current);
        newAdminRoles.retainAll(ADMIN_ROLES);
        var newPermissions = new java.util.HashSet<>(desiredPermissions);
        newPermissions.removeAll(currentPermissions);
        if (!"ACTIVE".equals(subject.get("state"))
                && (!newAdminRoles.isEmpty() || !newPermissions.isEmpty())) {
            throw new AdminPolicyException("New administrator access requires an active account");
        }
        if (actorId.equals(subjectId) && current.contains("HIGHEST_ADMIN") && !desiredRoles.contains("HIGHEST_ADMIN")) {
            throw new AdminPolicyException("Highest administrators cannot demote themselves");
        }
        if ("ACTIVE".equals(subject.get("state"))
                && current.contains("HIGHEST_ADMIN") && !desiredRoles.contains("HIGHEST_ADMIN")
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
        jdbc.update("update user_permissions set revoked_at = now() where user_id = ? and revoked_at is null", subjectId);
        for (var permission : desiredPermissions) {
            jdbc.update("""
                    insert into user_permissions(user_id, permission_id, granted_by)
                    select ?, id, ? from permissions where code = ?
                    """, subjectId, actorId, permission);
        }
        jdbc.update("update users set row_version = row_version + 1, updated_at = now() where id = ?", subjectId);
        refreshTokens.revokeAll(subjectId, "ROLES_CHANGED");
        appendAudit(actorId, subjectId, current, desiredRoles,
                currentPermissions, desiredPermissions, normalizedReason);
    }

    @Transactional(readOnly = true)
    public List<String> rolesOf(UUID userId) {
        return jdbc.queryForList("""
                select case r.code
                         when 'SUPER_ADMIN' then 'HIGHEST_ADMIN'
                         else r.code
                       end as api_role
                from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = ? and ur.revoked_at is null order by r.code
                """, String.class, userId);
    }

    @Transactional(readOnly = true)
    public List<String> permissionsOf(UUID userId) {
        return jdbc.queryForList("""
                select p.code
                from user_permissions up join permissions p on p.id = up.permission_id
                where up.user_id = ? and up.revoked_at is null order by p.code
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

    private void lockHighestAdminRoleChanges() {
        jdbc.queryForObject(
                "select id from roles where code = 'SUPER_ADMIN' for update",
                Integer.class);
    }

    private void appendAudit(
            UUID actor,
            UUID subject,
            Set<String> beforeRoles,
            Set<String> afterRoles,
            Set<String> beforePermissions,
            Set<String> afterPermissions,
            String reason) {
        try {
            jdbc.update("""
                    insert into audit_outbox(event_type, actor_user_id, subject_user_id, payload)
                    values ('ADMIN_ROLES_REPLACED', ?, ?, ?::jsonb)
                    """, actor, subject, json.writeValueAsString(java.util.Map.of(
                            "before_roles", beforeRoles,
                            "after_roles", afterRoles,
                            "before_permissions", beforePermissions,
                            "after_permissions", afterPermissions,
                            "reason", reason)));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not append role audit event", exception);
        }
    }

    private String databaseRole(String apiRole) {
        return switch (apiRole) {
            case "HIGHEST_ADMIN" -> "SUPER_ADMIN";
            default -> apiRole;
        };
    }

}
