package ai.civic.mainauth;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class ConfigurationPolicyTest {
    private static final Path RESOURCES = Path.of("src/main/resources");

    @Test
    void productionConfigurationIsFailClosedAndNamesEverySecretInput() throws Exception {
        var production = Files.readString(RESOURCES.resolve("application-prod.yaml"));
        assertThat(production).contains(
                "CIVIC_DB_PASSWORD_FILE",
                "CIVIC_AUDIT_DB_PASSWORD_FILE",
                "CIVIC_REDIS_PASSWORD_FILE",
                "CIVIC_SESSION_HMAC_SECRET_FILE",
                "CIVIC_ES256_KEY_DIRECTORY",
                "CIVIC_BOOTSTRAP_ADMIN_EMAIL",
                "CIVIC_BOOTSTRAP_ADMIN_PASSWORD_HASH",
                "CIVIC_SMTP_HOST");
        assertThat(production).doesNotContain("password: password", "secret: secret");
    }

    @Test
    void migrationsContainOnlyPlaceholdersForBootstrapSecrets() throws Exception {
        var migrations = List.of(
                RESOURCES.resolve("db/migration/V1__main_auth_core.sql"),
                RESOURCES.resolve("db/migration/V2__bootstrap_superadmin.sql"));
        for (var migration : migrations) {
            var sql = Files.readString(migration, StandardCharsets.UTF_8);
            assertThat(sql).doesNotContain("@gmail.com", "@naver.com", "@daum.net");
        }
        assertThat(Files.readString(migrations.get(1)))
                .contains("${bootstrap_admin_email}", "${bootstrap_admin_password_hash}");
    }
}
