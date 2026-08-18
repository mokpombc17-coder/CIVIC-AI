package ai.civic.mainauth.config;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
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
                "bootstrap_admin_email_base64", encode(email),
                "bootstrap_admin_password_hash_base64", encode(passwordHash)));
    }

    private static String encode(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}
