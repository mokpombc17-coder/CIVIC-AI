package ai.civic.mainauth.config;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FlywayBootstrapConfiguration {
    @Bean
    FlywayConfigurationCustomizer bootstrapPlaceholders(
            @Value("${spring.flyway.placeholders.bootstrap_admin_email}") String email,
            @Value("${spring.flyway.placeholders.bootstrap_admin_password_hash}") String passwordHash) {
        return configuration -> configuration.placeholders(Map.of(
                "bootstrap_admin_email", escapeSqlLiteral(email),
                "bootstrap_admin_password_hash", escapeSqlLiteral(passwordHash)));
    }

    private static String escapeSqlLiteral(String value) {
        return value.replace("'", "''");
    }
}
