package ai.civic.mainauth.account;

import ai.civic.mainauth.auth.SessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountProfileService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public AccountProfileService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public AccountProfile get(SessionService.SessionView session) {
        var account = jdbc.queryForMap("""
                select u.email, u.state, c.two_factor_enabled
                from users u join credentials c on c.user_id = u.id where u.id = ?
                """, session.userId());
        var language = activeAnswer(session.userId(), "preferred_language", "ko");
        var detail = activeAnswer(session.userId(), "rag_answer_detail", "balanced");
        var version = jdbc.queryForObject("""
                select coalesce(max(response_version), 1) from questionnaire_responses where user_id = ?
                """, Integer.class, session.userId());
        return new AccountProfile(
                session.userId(), account.get("email").toString(), session.role().name(),
                "DEACTIVATED".equals(account.get("state")) ? "INACTIVE" : account.get("state").toString(),
                language, detail, (Boolean) account.get("two_factor_enabled"), version == null ? 1 : version);
    }

    @Transactional
    public AccountProfile update(
            SessionService.SessionView session, String preferredLanguage, String ragAnswerDetail) {
        if (preferredLanguage == null && ragAnswerDetail == null) {
            throw new IllegalArgumentException("At least one profile value is required");
        }
        if (preferredLanguage != null && !java.util.Set.of("ko", "en").contains(preferredLanguage)) {
            throw new IllegalArgumentException("Preferred language is invalid");
        }
        if (ragAnswerDetail != null
                && !java.util.Set.of("concise", "balanced", "detailed").contains(ragAnswerDetail)) {
            throw new IllegalArgumentException("RAG answer detail is invalid");
        }
        jdbc.queryForObject(
                "select id from users where id = ? for update", UUID.class, session.userId());
        var schemaIds = jdbc.query("""
                select schema_id from questionnaire_responses where user_id = ? and active limit 1
                """, (rs, rowNum) -> rs.getObject(1, UUID.class), session.userId());
        var schemaId = schemaIds.isEmpty()
                ? jdbc.queryForObject("""
                        select id from questionnaire_schemas
                        where active_for_new_signup order by version desc limit 1
                        """, UUID.class)
                : schemaIds.getFirst();
        if (preferredLanguage != null) replaceAnswer(session.userId(), schemaId, "preferred_language", preferredLanguage);
        if (ragAnswerDetail != null) replaceAnswer(session.userId(), schemaId, "rag_answer_detail", ragAnswerDetail);
        return get(session);
    }

    private String activeAnswer(UUID userId, String key, String fallback) {
        var answers = jdbc.query("""
                select response_value::text from questionnaire_responses
                where user_id = ? and question_key = ? and active
                """, (rs, rowNum) -> rs.getString(1), userId, key);
        if (answers.isEmpty()) return fallback;
        try {
            return json.readTree(answers.getFirst()).path("value").asText(fallback);
        } catch (Exception exception) {
            throw new IllegalStateException("Stored questionnaire response is invalid", exception);
        }
    }

    private void replaceAnswer(UUID userId, UUID schemaId, String key, String value) {
        var next = jdbc.queryForObject("""
                select coalesce(max(response_version), 0) + 1 from questionnaire_responses
                where user_id = ? and question_key = ?
                """, Integer.class, userId, key);
        jdbc.update("""
                update questionnaire_responses set active = false, superseded_at = now()
                where user_id = ? and question_key = ? and active
                """, userId, key);
        jdbc.update("""
                insert into questionnaire_responses(
                    user_id, schema_id, question_key, response_version, response_value
                ) values (?, ?, ?, ?, jsonb_build_object('value', ?::text))
                """, userId, schemaId, key, next, value);
    }

    public record AccountProfile(
            UUID userId,
            String email,
            String role,
            String accountState,
            String preferredLanguage,
            String ragAnswerDetail,
            boolean twoFactorEnabled,
            int responseVersion) {}
}
