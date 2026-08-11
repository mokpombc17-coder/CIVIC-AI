package ai.civic.mainauth.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import ai.civic.mainauth.account.AccountLifecycleService;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class AdminPolicyTest extends PostgresIntegrationTest {
    @Autowired AdminRoleService roles;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountLifecycleService lifecycle;
    UUID bootstrapId;

    @BeforeEach
    void ids() {
        bootstrapId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
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
        assertThatThrownBy(() -> roles.replaceRoles(second, second, 2, Set.of("RAG_ADMIN"), "자기 권한 회수", true))
                .isInstanceOf(AdminPolicyException.class);
    }

    @Test
    void accountDeactivationIsSelfServiceOnlyAndWritesOneVersionedEvent() {
        var participant = createParticipant("participant@example.com");
        assertThatThrownBy(() -> lifecycle.deactivateSelf(bootstrapId, participant))
                .isInstanceOf(AdminPolicyException.class);

        lifecycle.deactivateSelf(participant, participant);

        assertThat(jdbc.queryForObject("select state from users where id = ?", String.class, participant))
                .isEqualTo("DEACTIVATED");
        assertThat(jdbc.queryForObject(
                "select count(*) from account_state_outbox where user_id = ?", Integer.class, participant))
                .isOne();
    }

    private UUID createAdmin(String email) {
        var id = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'ADMIN_CREATED', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", id);
        return id;
    }

    private UUID createParticipant(String email) {
        var id = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", id);
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'PARTICIPANT'
                """, id);
        return id;
    }
}
