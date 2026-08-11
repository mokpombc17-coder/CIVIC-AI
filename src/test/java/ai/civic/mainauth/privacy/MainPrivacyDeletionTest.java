package ai.civic.mainauth.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class MainPrivacyDeletionTest extends PostgresIntegrationTest {
    @Autowired MainPrivacyDeletionHandler deletion;
    @Autowired JdbcTemplate jdbc;

    @Test
    void deletionIsIdempotentLeavesOnlyTombstoneAndPreventsReactivation() {
        var user = createUser();
        var first = deletion.delete(user, "external-request-1");
        var second = deletion.delete(user, "external-request-1");
        assertThat(first.deleted()).isTrue();
        assertThat(second.alreadyDeleted()).isTrue();
        assertThat(jdbc.queryForObject("select state from users where id = ?", String.class, user))
                .isEqualTo("DELETED");
        assertThat(jdbc.queryForObject("select email from users where id = ?", String.class, user))
                .startsWith("deleted+");
        assertThat(jdbc.queryForObject(
                "select count(*) from deletion_tombstones where subject_id = ?", Integer.class, user)).isOne();
    }

    private UUID createUser() {
        var id = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values ('delete-me@example.com','delete-me@example.com','SIGNUP','ACTIVE',now()) returning id
                """, UUID.class);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'hash')", id);
        return id;
    }
}
