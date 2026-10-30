package ai.civic.mainauth.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class FlywayBootstrapConfigurationTest {
    @Test
    void escapesBootstrapValuesForTheDeployedSqlLiteralPlaceholders() {
        var flyway = Flyway.configure();

        new FlywayBootstrapConfiguration()
                .bootstrapPlaceholders("o'connor@example.test", "$argon2id$test'value")
                .customize(flyway);

        assertThat(flyway.getPlaceholders())
                .containsEntry("bootstrap_admin_email", "o''connor@example.test")
                .containsEntry("bootstrap_admin_password_hash", "$argon2id$test''value")
                .doesNotContainKeys("bootstrap_admin_email_base64", "bootstrap_admin_password_hash_base64");
    }
}
