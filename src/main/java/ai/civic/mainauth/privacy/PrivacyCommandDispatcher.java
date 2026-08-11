package ai.civic.mainauth.privacy;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PrivacyCommandDispatcher {
    private final JdbcTemplate jdbc;

    public PrivacyCommandDispatcher(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public boolean markDelivered(UUID commandId) {
        return jdbc.update("""
                update privacy_command_outbox set delivered_at = now(), leased_until = null
                where id = ? and delivered_at is null
                """, commandId) == 1;
    }
}
