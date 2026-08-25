package ai.civic.mainauth.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.junit.jupiter.api.Test;

class ProductionSecretGuardTest {
    private static final Map<String, String> EXTERNAL_VALUES = Map.of(
            "database password", "external-db-password",
            "session HMAC secret", "external-session-secret",
            "internal client secret", "external-client-secret",
            "verification-code protection key", "external-code-key",
            "bootstrap administrator password hash", "$argon2id$external");

    @Test
    void productionRejectsDevelopmentFallbacksAndEphemeralSigningKeys() {
        assertThatThrownBy(() -> ProductionSecretGuard.validate(
                true,
                Map.of("session HMAC secret", "local-development-session-hmac-secret-change-me"),
                "active-2026-08"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("externally supplied session HMAC secret");
        assertThatThrownBy(() -> ProductionSecretGuard.validate(true, EXTERNAL_VALUES, "local-ephemeral"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("persistent externally supplied RS256 key");
        var shippedBootstrapFallback = new java.util.HashMap<>(EXTERNAL_VALUES);
        shippedBootstrapFallback.put(
                "bootstrap administrator password hash",
                ProductionSecretGuard.DEFAULT_BOOTSTRAP_PASSWORD_HASH);
        assertThatThrownBy(() -> ProductionSecretGuard.validate(
                true, shippedBootstrapFallback, "active-2026-08"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("externally supplied bootstrap administrator password hash");
    }

    @Test
    void externallySuppliedProductionSecretsPassAndDevelopmentKeepsLocalDefaults() {
        assertThatCode(() -> ProductionSecretGuard.validate(true, EXTERNAL_VALUES, "active-2026-08"))
                .doesNotThrowAnyException();
        assertThatCode(() -> ProductionSecretGuard.validate(
                false, Map.of("secret", "local-development-only"), "local-ephemeral"))
                .doesNotThrowAnyException();
    }
}
