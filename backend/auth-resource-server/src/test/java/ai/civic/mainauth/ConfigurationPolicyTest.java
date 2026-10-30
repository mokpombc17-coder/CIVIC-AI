package ai.civic.mainauth;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Configuration;

class ConfigurationPolicyTest {
    private static final Path RESOURCES = Path.of("src/main/resources");

    @Test
    void productionConfigurationIsFailClosedAndNamesEverySecretInput() throws Exception {
        var production = Files.readString(RESOURCES.resolve("application-prod.yaml"));
        assertThat(production).contains(
                "configtree:/run/secrets/civic/main/",
                "CIVIC_DB_URL",
                "CIVIC_DB_USER",
                "CIVIC_REDIS_URL",
                "CIVIC_RS256_KEY_DIRECTORY",
                "CIVIC_SMTP_HOST",
                "CIVIC_NOTIFICATION_SENDER_EMAIL",
                "[mail.smtp.auth]",
                "[mail.smtp.auth.login.disable]",
                "[mail.smtp.starttls.enable]",
                "[mail.smtp.starttls.required]",
                "TLSv1.2",
                "CIVIC_ISSUER",
                "origin: ${CIVIC_BROWSER_ORIGIN}",
                "production-secrets-required: true");
        assertThat(production).doesNotContain(
                "CIVIC_DB_PASSWORD",
                "CIVIC_SESSION_HMAC_SECRET",
                "CIVIC_INTERNAL_CLIENT_SECRET",
                "password: password",
                "secret: secret");
    }

    @Test
    void localProfileProvidesSafeRunnableDefaultsAndKnownDevelopmentAccounts() {
        try (var context = new SpringApplicationBuilder(LocalProfileProbe.class)
                .profiles("local")
                .web(WebApplicationType.NONE)
                .properties(
                        "spring.main.banner-mode=off",
                        "spring.main.log-startup-info=false")
                .run()) {
            var environment = context.getEnvironment();

            assertThat(environment.getProperty("server.port")).isEqualTo("8080");
            assertThat(environment.getProperty("spring.datasource.url"))
                    .isEqualTo("jdbc:postgresql://localhost:15432/civic_main");
            assertThat(environment.getProperty("spring.datasource.username")).isEqualTo("civic_main");
            assertThat(environment.getProperty("spring.datasource.password"))
                    .isEqualTo("civic-main-local-only");
            assertThat(environment.getProperty("spring.data.redis.url"))
                    .isEqualTo("redis://localhost:16379");
            assertThat(environment.getProperty("civic.issuer")).isEqualTo("http://localhost:8080");
            assertThat(environment.getProperty("civic.browser.origin")).isEqualTo("http://localhost:8080");
            assertThat(environment.getProperty("civic.cookies.secure", Boolean.class)).isFalse();
            assertThat(environment.getProperty("management.health.mail.enabled", Boolean.class)).isFalse();
            assertThat(environment.getProperty("civic.local-seed.enabled", Boolean.class)).isTrue();
            assertThat(environment.getProperty("civic.local-seed.admin-email"))
                    .isEqualTo("admin@dev.civic.test");
            assertThat(environment.getProperty("civic.local-seed.admin-password"))
                    .isEqualTo("CivicDevAdmin!2026");
            assertThat(environment.getProperty("civic.local-seed.user-password"))
                    .isEqualTo("CivicDevUser!2026");
            assertThat(environment.getProperty("spring.flyway.placeholders.bootstrap_admin_email"))
                    .isEqualTo("admin@dev.civic.test");
        }
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
                .contains("'${bootstrap_admin_email}'", "'${bootstrap_admin_password_hash}'");
    }

    @Test
    void deployedBootstrapMigrationRemainsImmutable() throws Exception {
        var migration = Files.readAllBytes(RESOURCES.resolve("db/migration/V2__bootstrap_superadmin.sql"));
        var digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(migration));

        assertThat(digest).isEqualTo("ed1b0a6d24cb939698e297c056d8c09855e73841083d2d9d1326aed442be2c61");
    }

    @Configuration(proxyBeanMethods = false)
    static class LocalProfileProbe {}
}
