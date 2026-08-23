package ai.civic.mainauth.feature;

import static org.assertj.core.api.Assertions.assertThat;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = {
        "PUBLIC_SIGNUP_ENABLED=true",
        "EXTERNAL_LLM_PERSONAL_DATA_ENABLED=true",
        "RAG_PARTICIPANT_QUERY_ENABLED=true",
        "LEGAL_01_APPROVED=true",
        "LEGAL_03_APPROVED=true",
        "LEGAL_04_APPROVED=true",
        "LEGAL_05_APPROVED=true",
        "LEGAL_09_APPROVED=true",
        "LEGAL_10_APPROVED=true"
})
class FeatureGateStartupSynchronizerTest extends PostgresIntegrationTest {
    @Autowired JdbcTemplate jdbc;

    @Test
    void startupConfigurationSynchronizesTheRuntimeDatabaseGateSource() {
        var gates = jdbc.query(
                "select gate_key, enabled from feature_gates",
                rs -> {
                    var values = new java.util.HashMap<String, Boolean>();
                    while (rs.next()) values.put(rs.getString("gate_key"), rs.getBoolean("enabled"));
                    return Map.copyOf(values);
                });

        assertThat(gates).containsEntry("PUBLIC_SIGNUP_ENABLED", true)
                .containsEntry("EXTERNAL_LLM_PERSONAL_DATA_ENABLED", true)
                .containsEntry("RAG_PARTICIPANT_QUERY_ENABLED", true)
                .containsEntry("SINGLE_CELL_RESULT_ENABLED", false)
                .containsEntry("ELECTION_TASK_ENABLED", false)
                .containsEntry("HIGH_IMPACT_USE_ENABLED", false);
    }
}
