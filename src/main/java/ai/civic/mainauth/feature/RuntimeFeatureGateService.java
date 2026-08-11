package ai.civic.mainauth.feature;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public final class RuntimeFeatureGateService {
    private final JdbcTemplate jdbc;

    public RuntimeFeatureGateService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void requireEnabled(String gateKey) {
        requireEnabled(gateKey, false);
    }

    public void requireEnabledForUpdate(String gateKey) {
        requireEnabled(gateKey, true);
    }

    private void requireEnabled(String gateKey, boolean lock) {
        var values = jdbc.query(
                "select enabled from feature_gates where gate_key = ?" + (lock ? " for share" : ""),
                (rs, rowNum) -> rs.getBoolean("enabled"),
                gateKey);
        if (values.size() != 1 || !values.getFirst()) {
            throw new FeatureGateDisabledException(gateKey);
        }
    }
}
