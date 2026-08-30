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
public class PwaRefreshTokenService {
    public static final Duration IDLE_LIFETIME = Duration.ofDays(90);
    static final Duration CONCURRENT_ROTATION_GRACE = Duration.ofSeconds(10);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final Clock clock;

    @Autowired
    public PwaRefreshTokenService(JdbcTemplate jdbc) {
        this(jdbc, Clock.systemUTC());
    }

    PwaRefreshTokenService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional
    public IssuedPwaRefreshToken issue(UUID userId) {
        var now = clock.instant();
        var sessionId = UUID.randomUUID();
        var familyId = UUID.randomUUID();
        var expiresAt = now.plus(IDLE_LIFETIME);
        jdbc.update("""
                insert into pwa_refresh_sessions(
                    id, family_id, user_id, created_at, last_used_at, expires_at
                ) values (?, ?, ?, ?, ?, ?)
                """, sessionId, familyId, userId, Timestamp.from(now), Timestamp.from(now),
                Timestamp.from(expiresAt));
        return insert(userId, sessionId, familyId, expiresAt, now);
    }

    @Transactional(noRollbackFor = {AuthenticationException.class, RefreshTokenConflictException.class})
    public IssuedPwaRefreshToken rotate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) throw invalid();
        var tokenHash = sha256(rawToken);
        var subjects = jdbc.query("""
                select session.user_id
                from pwa_refresh_tokens token
                join pwa_refresh_sessions session on session.id = token.session_id
                where token.token_hash = ?
                """, (rs, rowNum) -> rs.getObject("user_id", UUID.class), tokenHash);
        if (subjects.size() != 1) throw invalid();

        var states = jdbc.query(
                "select state from users where id = ? and deleted_at is null for update",
                (rs, rowNum) -> rs.getString("state"), subjects.getFirst());
        var rows = jdbc.query("""
                select token.id as token_id, token.session_id, token.rotated_at as token_rotated_at,
                       token.revoked_at as token_revoked_at, session.family_id, session.user_id,
                       session.expires_at, session.revoked_at as session_revoked_at
                from pwa_refresh_tokens token
                join pwa_refresh_sessions session on session.id = token.session_id
                where token.token_hash = ?
                for update of session, token
                """, (rs, rowNum) -> new StoredPwaRefreshToken(
                rs.getObject("token_id", UUID.class), rs.getObject("session_id", UUID.class),
                rs.getObject("family_id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("token_rotated_at") == null
                        ? null : rs.getTimestamp("token_rotated_at").toInstant(),
                rs.getTimestamp("token_revoked_at") == null
                        ? null : rs.getTimestamp("token_revoked_at").toInstant(),
                rs.getTimestamp("session_revoked_at") == null
                        ? null : rs.getTimestamp("session_revoked_at").toInstant()), tokenHash);
        if (rows.size() != 1) throw invalid();

        var stored = rows.getFirst();
        var now = clock.instant();
        if (stored.tokenRevokedAt() != null || stored.sessionRevokedAt() != null) throw invalid();
        if (states.size() != 1 || !"ACTIVE".equals(states.getFirst())) {
            revokeSession(stored.sessionId(), "ACCOUNT_INACTIVE", now);
            throw invalid();
        }
        if (stored.tokenRotatedAt() != null) {
            if (stored.tokenRotatedAt().plus(CONCURRENT_ROTATION_GRACE).isAfter(now)) {
                throw new RefreshTokenConflictException();
            }
            revokeSession(stored.sessionId(), "REUSE_DETECTED", now);
            throw invalid();
        }
        if (!stored.expiresAt().isAfter(now)) {
            revokeSession(stored.sessionId(), "EXPIRED", now);
            throw invalid();
        }

        var nextExpiresAt = now.plus(IDLE_LIFETIME);
        var next = insert(
                stored.userId(), stored.sessionId(), stored.familyId(), nextExpiresAt, now);
        jdbc.update("""
                update pwa_refresh_tokens set rotated_at = ?, replaced_by_id = ?
                where id = ? and rotated_at is null and revoked_at is null
                """, Timestamp.from(now), next.id(), stored.tokenId());
        jdbc.update("""
                update pwa_refresh_sessions set last_used_at = ?, expires_at = ?
                where id = ? and revoked_at is null
                """, Timestamp.from(now), Timestamp.from(nextExpiresAt), stored.sessionId());
        return next;
    }

    @Transactional
    public void revokeSession(String rawToken, String reason) {
        if (rawToken == null || rawToken.isBlank()) return;
        var sessionIds = jdbc.query(
                "select session_id from pwa_refresh_tokens where token_hash = ? for update",
                (rs, rowNum) -> rs.getObject("session_id", UUID.class), sha256(rawToken));
        if (sessionIds.size() == 1) revokeSession(sessionIds.getFirst(), reason, clock.instant());
    }

    @Transactional
    public void revokeAll(UUID userId, String reason) {
        var now = clock.instant();
        jdbc.update("""
                update pwa_refresh_tokens token set revoked_at = ?, revocation_reason = ?
                from pwa_refresh_sessions session
                where token.session_id = session.id and session.user_id = ?
                  and token.revoked_at is null
                """, Timestamp.from(now), reason, userId);
        jdbc.update("""
                update pwa_refresh_sessions set revoked_at = ?, revocation_reason = ?
                where user_id = ? and revoked_at is null
                """, Timestamp.from(now), reason, userId);
    }

    @Transactional
    public boolean purgeExpiredSessions() {
        return jdbc.update("""
                with expired as (
                    select id from pwa_refresh_sessions
                    where expires_at < now()
                    order by expires_at
                    for update skip locked
                    limit 100
                )
                delete from pwa_refresh_sessions session
                using expired
                where session.id = expired.id
                """) > 0;
    }

    private IssuedPwaRefreshToken insert(
            UUID userId, UUID sessionId, UUID familyId, Instant expiresAt, Instant now) {
        var id = UUID.randomUUID();
        var rawToken = opaqueToken();
        jdbc.update("""
                insert into pwa_refresh_tokens(id, session_id, token_hash, issued_at)
                values (?, ?, ?, ?)
                """, id, sessionId, sha256(rawToken), Timestamp.from(now));
        return new IssuedPwaRefreshToken(
                id, rawToken, userId, sessionId, familyId, expiresAt);
    }

    private void revokeSession(UUID sessionId, String reason, Instant now) {
        jdbc.update("""
                update pwa_refresh_tokens set revoked_at = ?, revocation_reason = ?
                where session_id = ? and revoked_at is null
                """, Timestamp.from(now), reason, sessionId);
        jdbc.update("""
                update pwa_refresh_sessions set revoked_at = ?, revocation_reason = ?
                where id = ? and revoked_at is null
                """, Timestamp.from(now), reason, sessionId);
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
        return new AuthenticationException("PWA refresh token is invalid or expired");
    }

    public record IssuedPwaRefreshToken(
            UUID id,
            String token,
            UUID userId,
            UUID sessionId,
            UUID familyId,
            Instant expiresAt) {}

    private record StoredPwaRefreshToken(
            UUID tokenId,
            UUID sessionId,
            UUID familyId,
            UUID userId,
            Instant expiresAt,
            Instant tokenRotatedAt,
            Instant tokenRevokedAt,
            Instant sessionRevokedAt) {}
}
