package ai.civic.mainauth.feature;

import ai.civic.mainauth.admin.AdminAuthorizationService;
import ai.civic.mainauth.auth.AuthCookieFactory;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/feature-gates")
public class FeatureGateController {
    private final JdbcTemplate jdbc;
    private final AdminAuthorizationService authorization;

    public FeatureGateController(JdbcTemplate jdbc, AdminAuthorizationService authorization) {
        this.jdbc = jdbc;
        this.authorization = authorization;
    }

    @GetMapping
    public Map<String, GateView> list(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken) {
        authorization.requireAdmin(accessToken, false);
        var result = new LinkedHashMap<String, GateView>();
        jdbc.query("""
                select gate_key, enabled from feature_gates order by gate_key
                """, rs -> {
            while (rs.next()) {
                var key = rs.getString("gate_key");
                result.put(key, new GateView(rs.getBoolean("enabled"), legalRequirements(key)));
            }
            return null;
        });
        return result;
    }

    private List<String> legalRequirements(String key) {
        return switch (key) {
            case "PUBLIC_SIGNUP_ENABLED" -> List.of("LEGAL-01", "LEGAL-03", "LEGAL-04", "LEGAL-09", "LEGAL-10");
            case "EXTERNAL_LLM_PERSONAL_DATA_ENABLED" -> List.of("LEGAL-03");
            case "RAG_PARTICIPANT_QUERY_ENABLED" -> List.of("LEGAL-03", "LEGAL-05");
            default -> List.of();
        };
    }

    public record GateView(boolean enabled, List<String> legalRequirements) {}
}
