package ai.civic.mainauth.questionnaire;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QuestionnaireSchemaService {
    private final JdbcTemplate jdbc;

    public QuestionnaireSchemaService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public void publishForNewSignups(int version, String definition) {
        if (version < 1 || definition == null || definition.isBlank()) {
            throw new IllegalArgumentException("Questionnaire version and definition are required");
        }
        jdbc.update("update questionnaire_schemas set active_for_new_signup = false where active_for_new_signup");
        jdbc.update("""
                insert into questionnaire_schemas(version, definition, active_for_new_signup, activated_at)
                values (?, ?::jsonb, true, now())
                """, version, definition);
    }
}
