package ai.civic.mainauth.consent;

import ai.civic.mainauth.signup.SignupFlowService;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ConsentEvidenceService {
    private final JdbcTemplate jdbc;

    public ConsentEvidenceService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(UUID userId, SignupFlowService.Evidence evidence, Instant acceptedAt) {
        jdbc.update("""
                insert into consent_evidence(
                    user_id, document_code, document_version, document_sha256,
                    accepted, client_checked_at, accepted_at, user_agent
                ) values (?, ?, ?, ?, true, ?, ?, ?)
                """,
                userId, evidence.documentId(), evidence.documentVersion(), evidence.bodySha256(),
                java.sql.Timestamp.from(evidence.clientCheckedAt()),
                java.sql.Timestamp.from(acceptedAt), "signup-api");
    }
}
