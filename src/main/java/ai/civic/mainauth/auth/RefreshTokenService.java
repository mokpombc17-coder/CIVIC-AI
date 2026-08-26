package ai.civic.mainauth.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefreshTokenService {
    public static final Duration TOKEN_LIFETIME = Duration.ofDays(7);
    public static final Duration FAMILY_LIFETIME = Duration.ofDays(30);
    static final Duration CONCURRENT_ROTATION_GRACE = Duration.ofSeconds(10);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final Clock clock;

    @Autowired
    public RefreshTokenService(JdbcTemplate jdbc) {
        this(jdbc, Clock.systemUTC());
    }

    RefreshTokenService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional
    public IssuedRefreshToken issue(UUID userId) {
        var now = clock.instant();
        return insert(userId, UUID.randomUUID(), now.plus(FAMILY_LIFETIME), now);
    }

    @Transactional(noRollbackFor = {AuthenticationException.class, RefreshTokenConflictException.class})
    public IssuedRefreshToken rotate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) throw invalid();
        var tokenHash = sha256(rawToken);
        var subjects = jdbc.query(
                "select user_id from refresh_tokens where token_hash = ?",
                (rs, rowNum) -> rs.getObject("user_id", UUID.class), tokenHash);
        if (subjects.size() != 1) throw invalid();
        var states = jdbc.query(
                "select state from users where id = ? and deleted_at is null for update",
                (rs, rowNum) -> rs.getString("state"), subjects.getFirst());
        var rows = jdbc.query("""
                select id, family_id, user_id, expires_at, family_expires_at,
                       rotated_at, revoked_at
                from refresh_tokens where token_hash = ? for update
                """, (rs, rowNum) -> new StoredRefreshToken(
                rs.getObject("id", UUID.class), rs.getObject("family_id", UUID.class),
                rs.getObject("user_id", UUID.class), rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("family_expires_at").toInstant(),
                rs.getTimestamp("rotated_at") == null ? null : rs.getTimestamp("rotated_at").toInstant(),
                rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant()),
                tokenHash);
        if (rows.size() != 1) throw invalid();

        var stored = rows.getFirst();
        var now = clock.instant();
        if (stored.revokedAt() != null) throw invalid();
        if (states.size() != 1 || !"ACTIVE".equals(states.getFirst())) {
            revokeFamily(stored.familyId(), "ACCOUNT_INACTIVE");
            throw invalid();
        }
        if (stored.rotatedAt() != null) {
            if (stored.rotatedAt().plus(CONCURRENT_ROTATION_GRACE).isAfter(now)) {
                throw new RefreshTokenConflictException();
            }
            revokeFamily(stored.familyId(), "REUSE_DETECTED");
            throw invalid();
        }
        if (!stored.expiresAt().isAfter(now) || !stored.familyExpiresAt().isAfter(now)) {
            revokeFamily(stored.familyId(), "EXPIRED");
            throw invalid();
        }
        var next = insert(stored.userId(), stored.familyId(), stored.familyExpiresAt(), now);
        jdbc.update("""
                update refresh_tokens set rotated_at = ?, replaced_by_id = ?, last_used_at = ?
                where id = ? and rotated_at is null and revoked_at is null
                """, Timestamp.from(now), next.id(), Timestamp.from(now), stored.id());
        return next;
    }

    @Transactional
    public void revokeFamily(String rawToken, String reason) {
        if (rawToken == null || rawToken.isBlank()) return;
        var families = jdbc.query(
                "select family_id from refresh_tokens where token_hash = ? for update",
                (rs, rowNum) -> rs.getObject("family_id", UUID.class), sha256(rawToken));
        if (families.size() == 1) revokeFamily(families.getFirst(), reason);
    }

    @Transactional
    public void revokeAll(UUID userId, String reason) {
        jdbc.update("""
                update refresh_tokens set revoked_at = now(), revocation_reason = ?
                where user_id = ? and revoked_at is null
                """, reason, userId);
    }

    @Transactional
    public boolean purgeExpiredFamilies() {
        return jdbc.update("""
                with expired_families as (
                    select family_id
                    from refresh_tokens
                    where family_expires_at < now()
                    order by family_expires_at
                    limit 100
                )
                delete from refresh_tokens token
                using expired_families expired
                where token.family_id = expired.family_id
                """) > 0;
    }

    private IssuedRefreshToken insert(UUID userId, UUID familyId, Instant familyExpiresAt, Instant now) {
        var id = UUID.randomUUID();
        var rawToken = opaqueToken();
        var expiresAt = now.plus(TOKEN_LIFETIME);
        if (expiresAt.isAfter(familyExpiresAt)) expiresAt = familyExpiresAt;
        jdbc.update("""
                insert into refresh_tokens(
                    id, family_id, token_hash, user_id, expires_at, family_expires_at,
                    issued_at, last_used_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?)
                """, id, familyId, sha256(rawToken), userId, Timestamp.from(expiresAt),
                Timestamp.from(familyExpiresAt), Timestamp.from(now), Timestamp.from(now));
        return new IssuedRefreshToken(id, rawToken, userId, familyId, expiresAt, familyExpiresAt);
    }

    private void revokeFamily(UUID familyId, String reason) {
        jdbc.update("""
                update refresh_tokens set revoked_at = now(), revocation_reason = ?
                where family_id = ? and revoked_at is null
                """, reason, familyId);
    }

    static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String opaqueToken() {
        var bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static AuthenticationException invalid() {
        return new AuthenticationException("Refresh token is invalid or expired");
    }

    public record IssuedRefreshToken(
            UUID id,
            String token,
            UUID userId,
            UUID familyId,
            Instant expiresAt,
            Instant familyExpiresAt) {}

    private record StoredRefreshToken(
            UUID id,
            UUID familyId,
            UUID userId,
            Instant expiresAt,
            Instant familyExpiresAt,
            Instant rotatedAt,
            Instant revokedAt) {}
}
