package ai.civic.mainauth.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import ai.civic.mainauth.account.AccountLifecycleService;
import ai.civic.mainauth.auth.AuthenticationException;
import ai.civic.mainauth.auth.SessionService;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class AdminPolicyTest extends PostgresIntegrationTest {
    @Autowired AdminRoleService roles;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountLifecycleService lifecycle;
    @Autowired SessionService sessions;
    private final Argon2PasswordEncoder passwords =
            Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    UUID bootstrapId;

    @BeforeEach
    void ids() {
        bootstrapId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
    }

    @AfterEach
    void preserveBootstrapHighestAdmin() {
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'SUPER_ADMIN'
                  and not exists (
                    select 1 from user_roles active
                    where active.user_id = ? and active.role_id = roles.id
                      and active.revoked_at is null
                  )
                """, bootstrapId, bootstrapId);
    }

    @Test
    void bootstrapPasswordRotationBlocksAllAdminMutations() {
        assertThatThrownBy(() -> roles.replaceRoles(
                bootstrapId, bootstrapId, 0, Set.of("HIGHEST_ADMIN"), "정기 권한 검토", false))
                .isInstanceOf(AdminPolicyException.class)
                .hasMessageContaining("password rotation");
    }

    @Test
    void selfDemotionAndZeroHighestAdminAreRejectedAndStaleVersionConflicts() {
        jdbc.update("update credentials set must_change_password = false where user_id = ?", bootstrapId);
        assertThatThrownBy(() -> roles.replaceRoles(bootstrapId, bootstrapId, 0, Set.of("ADMIN"), "자기 권한 회수", true))
                .isInstanceOf(AdminPolicyException.class);
        assertThatThrownBy(() -> roles.replaceRoles(bootstrapId, bootstrapId, 99, Set.of("HIGHEST_ADMIN"), "동시성 확인", false))
                .isInstanceOf(AdminVersionConflictException.class);
    }

    @Test
    void anIndependentSecondHighestAdminCanBeChangedWithoutRemovingTheLastOne() {
        jdbc.update("update credentials set must_change_password = false where user_id = ?", bootstrapId);
        var second = createAdmin("second-admin@example.com");
        assertThatThrownBy(() -> roles.replaceRoles(
                bootstrapId, second, 0, Set.of("HIGHEST_ADMIN", "RAG_ADMIN"), "  ", false))
                .isInstanceOf(AdminPolicyException.class)
                .hasMessageContaining("reason");

        roles.replaceRoles(
                bootstrapId, second, 0, Set.of("HIGHEST_ADMIN", "RAG_ADMIN"), "RAG 운영 담당 지정", false);
        var staleRoleSession = sessions.issue(second, SessionService.SessionRole.RAG_ADMIN).sessionId();
        assertThat(roles.rolesOf(second)).containsExactlyInAnyOrder("HIGHEST_ADMIN", "RAG_ADMIN");
        var audit = jdbc.queryForObject(
                "select payload::text from audit_outbox where subject_user_id = ? order by created_at desc limit 1",
                String.class,
                second);
        assertThat(audit)
                .contains("RAG 운영 담당 지정", "before_roles", "after_roles");
        assertThatThrownBy(() -> roles.replaceRoles(
                bootstrapId, second, 1, Set.of("HIGHEST_ADMIN"), "RAG 운영 권한 회수", false))
                .isInstanceOf(AdminPolicyException.class)
                .hasMessageContaining("impact");
        roles.replaceRoles(
                bootstrapId, second, 1, Set.of("HIGHEST_ADMIN"), "RAG 운영 권한 회수", true);
        assertThat(roles.rolesOf(second)).containsExactly("HIGHEST_ADMIN");
        assertThatThrownBy(() -> sessions.require(staleRoleSession))
                .isInstanceOf(AuthenticationException.class);
        assertThatThrownBy(() -> roles.replaceRoles(second, second, 2, Set.of("RAG_ADMIN"), "자기 권한 회수", true))
                .isInstanceOf(AdminPolicyException.class);
    }

    @Test
    void inactiveHighestAdminCanBeDemotedWhileAnActiveHighestAdminRemains() {
        jdbc.update("update credentials set must_change_password = false where user_id = ?", bootstrapId);
        var inactive = createAdmin("inactive-highest@example.com");
        roles.replaceRoles(
                bootstrapId, inactive, 0, Set.of("HIGHEST_ADMIN"), "비활성화 전 최고 관리자 지정", false);
        jdbc.update("update users set state = 'DEACTIVATED' where id = ?", inactive);

        roles.replaceRoles(
                bootstrapId, inactive, 1, Set.of("PARTICIPANT"), "비활성 계정 권한 회수", true);

        assertThat(roles.rolesOf(inactive)).containsExactly("PARTICIPANT");
    }

    @Test
    void concurrentCrossDemotionsCannotRemoveEveryHighestAdministrator() throws Exception {
        jdbc.update("update credentials set must_change_password = false where user_id = ?", bootstrapId);
        var first = createAdmin("concurrent-first@example.com");
        var second = createAdmin("concurrent-second@example.com");
        roles.replaceRoles(bootstrapId, first, 0, Set.of("HIGHEST_ADMIN"), "동시성 관리자 1 지정", false);
        roles.replaceRoles(bootstrapId, second, 0, Set.of("HIGHEST_ADMIN"), "동시성 관리자 2 지정", false);
        jdbc.update("""
                update user_roles set revoked_at = now()
                where user_id not in (?, ?) and role_id = (select id from roles where code = 'SUPER_ADMIN')
                  and revoked_at is null
                """, first, second);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var firstResult = executor.submit(() -> demoteOther(first, second));
            var secondResult = executor.submit(() -> demoteOther(second, first));
            assertThat(java.util.List.of(
                    firstResult.get(10, TimeUnit.SECONDS), secondResult.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(false, true);
        }

        assertThat(jdbc.queryForObject("""
                select count(distinct u.id) from users u
                join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                join roles r on r.id = ur.role_id
                where u.state = 'ACTIVE' and r.highest_admin
                """, Integer.class)).isOne();
    }

    @Test
    void accountDeactivationIsSelfServiceOnlyAndWritesOneVersionedEvent() {
        var participant = createParticipant("participant@example.com");
        assertThatThrownBy(() -> lifecycle.deactivateSelf(bootstrapId, participant, "Valid123!"))
                .isInstanceOf(AdminPolicyException.class);
        jdbc.update("""
                insert into auth_challenges(
                    flow_hash, user_id, purpose, target_identity, code_hash,
                    expires_at, last_sent_at, resend_window_started_at
                ) values (decode(repeat('ab', 32), 'hex'), ?, 'TWO_FACTOR',
                          'participant@example.com', decode(repeat('cd', 32), 'hex'),
                          now() + interval '10 minutes', now(), now())
                """, participant);

        lifecycle.deactivateSelf(participant, participant, "Valid123!");

        assertThat(jdbc.queryForObject("select state from users where id = ?", String.class, participant))
                .isEqualTo("DEACTIVATED");
        assertThat(jdbc.queryForObject(
                "select count(*) from account_state_outbox where user_id = ?", Integer.class, participant))
                .isOne();
        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where user_id = ? and purpose = 'TWO_FACTOR' and consumed_at is null
                """, Integer.class, participant)).isZero();
    }

    @Test
    void concurrentHighestAdminDeactivationsCannotRemoveEveryHighestAdministrator() throws Exception {
        jdbc.update("update credentials set must_change_password = false where user_id = ?", bootstrapId);
        var first = createAdmin("deactivate-first@example.com");
        var second = createAdmin("deactivate-second@example.com");
        roles.replaceRoles(bootstrapId, first, 0, Set.of("HIGHEST_ADMIN"), "비활성화 관리자 1 지정", false);
        roles.replaceRoles(bootstrapId, second, 0, Set.of("HIGHEST_ADMIN"), "비활성화 관리자 2 지정", false);
        jdbc.update("""
                update user_roles set revoked_at = now()
                where user_id not in (?, ?)
                  and role_id = (select id from roles where code = 'SUPER_ADMIN')
                  and revoked_at is null
                """, first, second);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var firstResult = executor.submit(() -> deactivateSelf(first));
            var secondResult = executor.submit(() -> deactivateSelf(second));
            assertThat(java.util.List.of(
                    firstResult.get(10, TimeUnit.SECONDS), secondResult.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(false, true);
        }

        assertThat(jdbc.queryForObject("""
                select count(distinct u.id) from users u
                join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                join roles r on r.id = ur.role_id
                where u.state = 'ACTIVE' and r.highest_admin
                """, Integer.class)).isOne();
    }

    private UUID createAdmin(String email) {
        var id = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'ADMIN_CREATED', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, ?)",
                id, passwords.encode("Valid123!"));
        return id;
    }

    private UUID createParticipant(String email) {
        var id = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, ?)",
                id, passwords.encode("Valid123!"));
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'PARTICIPANT'
                """, id);
        return id;
    }

    private boolean demoteOther(UUID actor, UUID subject) {
        try {
            roles.replaceRoles(actor, subject, 1, Set.of("ADMIN"), "동시 교차 권한 회수", true);
            return true;
        } catch (AdminPolicyException exception) {
            return false;
        }
    }

    private boolean deactivateSelf(UUID subject) {
        try {
            lifecycle.deactivateSelf(subject, subject, "Valid123!");
            return true;
        } catch (AdminPolicyException exception) {
            return false;
        }
    }
}
