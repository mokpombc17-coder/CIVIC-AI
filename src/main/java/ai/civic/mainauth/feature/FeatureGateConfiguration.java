package ai.civic.mainauth.feature;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public final class FeatureGateConfiguration {
    private static final Set<String> KEYS = Set.of(
            "PUBLIC_SIGNUP_ENABLED",
            "EXTERNAL_LLM_PERSONAL_DATA_ENABLED",
            "RAG_PARTICIPANT_QUERY_ENABLED",
            "SINGLE_CELL_RESULT_ENABLED",
            "ELECTION_TASK_ENABLED",
            "HIGH_IMPACT_USE_ENABLED");
    private final Map<String, Boolean> values;

    private FeatureGateConfiguration(Map<String, Boolean> values) {
        this.values = Map.copyOf(values);
    }

    public static FeatureGateConfiguration defaults() {
        var defaults = new LinkedHashMap<String, Boolean>();
        KEYS.stream().sorted().forEach(key -> defaults.put(key, false));
        return new FeatureGateConfiguration(defaults);
    }

    public static FeatureGateConfiguration from(Map<String, Boolean> overrides) {
        if (overrides == null || !KEYS.containsAll(overrides.keySet())) {
            throw new IllegalStateException("Unknown feature gate key");
        }
        var values = new LinkedHashMap<>(defaults().values);
        values.putAll(overrides);
        return new FeatureGateConfiguration(values);
    }

    public Map<String, Boolean> values() {
        return values;
    }

    public void validateLegalReadiness(Set<String> readyLegalItems) {
        requireIfEnabled("PUBLIC_SIGNUP_ENABLED", readyLegalItems,
                Set.of("LEGAL-01", "LEGAL-03", "LEGAL-04", "LEGAL-09", "LEGAL-10"));
        requireIfEnabled("EXTERNAL_LLM_PERSONAL_DATA_ENABLED", readyLegalItems, Set.of("LEGAL-03"));
        requireIfEnabled("RAG_PARTICIPANT_QUERY_ENABLED", readyLegalItems, Set.of("LEGAL-03", "LEGAL-05"));
        if (Boolean.TRUE.equals(values.get("ELECTION_TASK_ENABLED"))) {
            throw new IllegalStateException("Decision and election work is deferred");
        }
    }

    private void requireIfEnabled(String key, Set<String> actual, Set<String> required) {
        if (Boolean.TRUE.equals(values.get(key)) && (actual == null || !actual.containsAll(required))) {
            throw new IllegalStateException(key + " legal dependencies are not ready");
        }
    }
}
