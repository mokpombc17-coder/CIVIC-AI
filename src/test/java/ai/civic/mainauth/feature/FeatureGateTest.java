package ai.civic.mainauth.feature;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class FeatureGateTest {
    @Test
    void exactTypedGatesDefaultFalseAndUnknownKeysFail() {
        var configuration = FeatureGateConfiguration.defaults();
        assertThat(configuration.values()).containsOnlyKeys(
                "PUBLIC_SIGNUP_ENABLED", "EXTERNAL_LLM_PERSONAL_DATA_ENABLED",
                "RAG_PARTICIPANT_QUERY_ENABLED", "SINGLE_CELL_RESULT_ENABLED",
                "ELECTION_TASK_ENABLED", "HIGH_IMPACT_USE_ENABLED");
        assertThat(configuration.values().values()).containsOnly(false);
        assertThatThrownBy(() -> FeatureGateConfiguration.from(Map.of("UNKNOWN", true)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void enablingSensitiveGatesRequiresTheirLegalDependencies() {
        assertThatThrownBy(() -> FeatureGateConfiguration.from(Map.of(
                        "PUBLIC_SIGNUP_ENABLED", true)).validateLegalReadiness(Set.of()))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> FeatureGateConfiguration.from(Map.of(
                        "RAG_PARTICIPANT_QUERY_ENABLED", true)).validateLegalReadiness(Set.of("LEGAL-03")))
                .isInstanceOf(IllegalStateException.class);
        FeatureGateConfiguration.from(Map.of("RAG_PARTICIPANT_QUERY_ENABLED", true))
                .validateLegalReadiness(Set.of("LEGAL-03", "LEGAL-05"));
    }
}
