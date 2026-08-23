package ai.civic.mainauth.feature;

import java.util.LinkedHashSet;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class FeatureGateStartupSynchronizer implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final Map<String, Boolean> gates;

    public FeatureGateStartupSynchronizer(
            JdbcTemplate jdbc,
            @Value("${PUBLIC_SIGNUP_ENABLED:false}") boolean publicSignupEnabled,
            @Value("${EXTERNAL_LLM_PERSONAL_DATA_ENABLED:false}") boolean externalLlmEnabled,
            @Value("${RAG_PARTICIPANT_QUERY_ENABLED:false}") boolean ragParticipantQueryEnabled,
            @Value("${LEGAL_01_APPROVED:false}") boolean legal01Approved,
            @Value("${LEGAL_03_APPROVED:false}") boolean legal03Approved,
            @Value("${LEGAL_04_APPROVED:false}") boolean legal04Approved,
            @Value("${LEGAL_05_APPROVED:false}") boolean legal05Approved,
            @Value("${LEGAL_09_APPROVED:false}") boolean legal09Approved,
            @Value("${LEGAL_10_APPROVED:false}") boolean legal10Approved) {
        this.jdbc = jdbc;
        var configuration = FeatureGateConfiguration.from(Map.of(
                "PUBLIC_SIGNUP_ENABLED", publicSignupEnabled,
                "EXTERNAL_LLM_PERSONAL_DATA_ENABLED", externalLlmEnabled,
                "RAG_PARTICIPANT_QUERY_ENABLED", ragParticipantQueryEnabled,
                "SINGLE_CELL_RESULT_ENABLED", false,
                "ELECTION_TASK_ENABLED", false,
                "HIGH_IMPACT_USE_ENABLED", false));
        var legalEvidence = new LinkedHashSet<String>();
        if (legal01Approved) legalEvidence.add("LEGAL-01");
        if (legal03Approved) legalEvidence.add("LEGAL-03");
        if (legal04Approved) legalEvidence.add("LEGAL-04");
        if (legal05Approved) legalEvidence.add("LEGAL-05");
        if (legal09Approved) legalEvidence.add("LEGAL-09");
        if (legal10Approved) legalEvidence.add("LEGAL-10");
        configuration.validateLegalReadiness(legalEvidence);
        this.gates = configuration.values();
    }

    @Override
    @Transactional
    public void run(ApplicationArguments arguments) {
        for (var gateKey : gates.keySet().stream().sorted().toList()) {
            var updated = jdbc.update(
                    "update feature_gates set enabled = ? where gate_key = ?",
                    gates.get(gateKey),
                    gateKey);
            if (updated != 1) {
                throw new IllegalStateException("Missing feature gate row: " + gateKey);
            }
        }
    }
}
