package ai.civic.mainauth.consent;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConsentAcceptanceService {
    private final JdbcTemplate jdbc;
    private final Clock clock;

    @Autowired
    public ConsentAcceptanceService(JdbcTemplate jdbc) {
        this(jdbc, Clock.systemUTC());
    }

    ConsentAcceptanceService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional
    public ConsentReceipt accept(
            UUID userId, UUID idempotencyKey, AcceptanceRequest request) {
        var requestSha256 = fingerprint(request);
        var existing = findExisting(userId, idempotencyKey);
        if (existing.isPresent()) return resolve(existing.get(), requestSha256);

        var candidate = new ConsentReceipt(
                UUID.randomUUID(), clock.instant().truncatedTo(ChronoUnit.MICROS));
        var inserted = jdbc.update("""
                insert into consent_acceptances(
                    consent_receipt_id, user_id, document_code, document_version,
                    round_id, client_clicked_at, accepted_at, idempotency_key, request_sha256
                )
                select ?, ?, ?, ?, ?, ?, ?, ?, ?
                where exists(
                    select 1 from consent_acceptance_policies
                    where document_code = ? and document_version = ? and active
                )
                on conflict (user_id, idempotency_key) do nothing
                """,
                candidate.consentReceiptId(), userId,
                request.documentCode(), request.documentVersion(), request.roundId(),
                java.sql.Timestamp.from(request.clientClickedAt()),
                java.sql.Timestamp.from(candidate.acceptedAt()), idempotencyKey, requestSha256,
                request.documentCode(), request.documentVersion());
        if (inserted == 1) return candidate;

        existing = findExisting(userId, idempotencyKey);
        if (existing.isPresent()) return resolve(existing.get(), requestSha256);
        throw new ConsentAcceptanceValidationException(
                "Consent document code and version are not active");
    }

    private ConsentReceipt resolve(ExistingReceipt existing, String requestSha256) {
        if (!existing.requestSha256().equals(requestSha256)) {
            throw new ConsentAcceptanceConflictException(
                    "Idempotency-Key was already used for a different consent request");
        }
        return new ConsentReceipt(existing.consentReceiptId(), existing.acceptedAt());
    }

    private Optional<ExistingReceipt> findExisting(UUID userId, UUID idempotencyKey) {
        var rows = jdbc.query("""
                select consent_receipt_id, accepted_at, request_sha256
                from consent_acceptances
                where user_id = ? and idempotency_key = ?
                """, (rs, rowNum) -> new ExistingReceipt(
                rs.getObject("consent_receipt_id", UUID.class),
                rs.getTimestamp("accepted_at").toInstant(),
                rs.getString("request_sha256")), userId, idempotencyKey);
        if (rows.size() > 1) throw new IllegalStateException("Multiple consent receipts found");
        return rows.stream().findFirst();
    }

    private String fingerprint(AcceptanceRequest request) {
        var canonical = String.join("\n",
                request.documentCode(),
                request.documentVersion(),
                request.roundId().toString(),
                request.clientClickedAt().toString());
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record AcceptanceRequest(
            String documentCode,
            String documentVersion,
            UUID roundId,
            Instant clientClickedAt) {}

    public record ConsentReceipt(UUID consentReceiptId, Instant acceptedAt) {}

    private record ExistingReceipt(
            UUID consentReceiptId, Instant acceptedAt, String requestSha256) {}
}
