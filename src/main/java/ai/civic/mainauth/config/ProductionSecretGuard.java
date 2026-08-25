package ai.civic.mainauth.config;

import ai.civic.mainauth.token.Rs256KeyRing;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class ProductionSecretGuard {
    static final String DEFAULT_BOOTSTRAP_PASSWORD_HASH =
            "$argon2id$v=19$m=65536,t=3,p=1$Y2l2aWM$Y2l2aWM";
    public ProductionSecretGuard(
            @Value("${civic.production-secrets-required:false}") boolean required,
            @Value("${spring.datasource.password:local-development-only}") String databasePassword,
            @Value("${civic.session.hmac-secret:local-development-session-hmac-secret-change-me}") String sessionSecret,
            @Value("${civic.internal.client-secret:local-development-internal-client-secret}") String internalSecret,
            @Value("${civic.notification.code-protection-key:local-development-code-protection-key}") String codeProtectionKey,
            @Value("${spring.flyway.placeholders.bootstrap_admin_password_hash:}") String bootstrapPasswordHash,
            Rs256KeyRing keys) {
        validate(required, Map.of(
                "database password", databasePassword,
                "session HMAC secret", sessionSecret,
                "internal client secret", internalSecret,
                "verification-code protection key", codeProtectionKey,
                "bootstrap administrator password hash", bootstrapPasswordHash), keys.active().getKeyID());
    }

    static void validate(boolean required, Map<String, String> values, String activeKeyId) {
        if (!required) return;
        values.forEach((name, value) -> {
            if (value == null || value.isBlank() || value.startsWith("local-development-")
                    || DEFAULT_BOOTSTRAP_PASSWORD_HASH.equals(value)) {
                throw new IllegalStateException("Production requires an externally supplied " + name);
            }
        });
        if (activeKeyId == null || activeKeyId.isBlank() || "local-ephemeral".equals(activeKeyId)) {
            throw new IllegalStateException("Production requires a persistent externally supplied RS256 key");
        }
    }
}
