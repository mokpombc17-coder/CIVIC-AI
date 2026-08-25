package ai.civic.mainauth.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SessionService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final byte[] hmacSecret;
    private final Clock clock;

    @Autowired
    public SessionService(
            JdbcTemplate jdbc,
            @Value("${civic.session.hmac-secret:local-development-session-hmac-secret-change-me}") String secret) {
        this(jdbc, secret.getBytes(StandardCharsets.UTF_8), Clock.systemUTC());
    }

    SessionService(JdbcTemplate jdbc, byte[] hmacSecret, Clock clock) {
        if (hmacSecret.length < 32) throw new IllegalArgumentException("Session HMAC secret must be at least 32 bytes");
        this.jdbc = jdbc;
        this.hmacSecret = hmacSecret.clone();
        this.clock = clock;
    }

    @Transactional
    public IssuedSession issue(UUID userId, SessionRole role) {
        var now = clock.instant();
        var rawSessionId = opaqueToken();
        var rawCsrf = opaqueToken();
        var idle = now.plus(role == SessionRole.PARTICIPANT ? Duration.ofHours(24) : Duration.ofMinutes(30));
        var absolute = now.plus(role == SessionRole.PARTICIPANT ? Duration.ofDays(7) : Duration.ofHours(12));
        jdbc.update("""
                insert into sessions(
                    session_hash, user_id, role_snapshot, csrf_hash,
                    idle_expires_at, absolute_expires_at, last_seen_at
                ) values (?, ?, jsonb_build_object('primary', ?::text), ?, ?, ?, ?)
                """, hmac(rawSessionId), userId, role.name(), hmac(rawCsrf),
                Timestamp.from(idle), Timestamp.from(absolute), Timestamp.from(now));
        return new IssuedSession(rawSessionId, rawCsrf, role, idle, absolute);
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public SessionView require(String rawSessionId) {
        if (rawSessionId == null || rawSessionId.isBlank()) throw invalid();
        var rows = jdbc.query("""
                select s.user_id, s.role_snapshot->>'primary' as role,
                       s.idle_expires_at, s.absolute_expires_at, s.last_seen_at,
                       u.state, u.account_state_version, c.must_change_password
                from sessions s
                join users u on u.id = s.user_id
                join credentials c on c.user_id = u.id
                where s.session_hash = ? and s.revoked_at is null
                """, (rs, rowNum) -> new SessionView(
                rs.getObject("user_id", UUID.class), SessionRole.valueOf(rs.getString("role")),
                rs.getString("state"), rs.getLong("account_state_version"),
                rs.getTimestamp("idle_expires_at").toInstant(),
                rs.getTimestamp("absolute_expires_at").toInstant(),
                rs.getTimestamp("last_seen_at").toInstant(), rs.getBoolean("must_change_password")),
                hmac(rawSessionId));
        if (rows.size() != 1) throw invalid();
        var view = rows.getFirst();
        var now = clock.instant();
        if (!"ACTIVE".equals(view.accountState())
                || !view.idleExpiresAt().isAfter(now)
                || !view.absoluteExpiresAt().isAfter(now)) {
            revoke(rawSessionId, "EXPIRED_OR_INACTIVE");
            throw invalid();
        }
        if (!view.lastSeenAt().plus(Duration.ofMinutes(5)).isAfter(now)) {
            var newIdle = now.plus(view.role() == SessionRole.PARTICIPANT
                    ? Duration.ofHours(24) : Duration.ofMinutes(30));
            if (newIdle.isAfter(view.absoluteExpiresAt())) newIdle = view.absoluteExpiresAt();
            jdbc.update("""
                    update sessions set last_seen_at = ?, idle_expires_at = ?
                    where session_hash = ? and revoked_at is null
                    """, Timestamp.from(now), Timestamp.from(newIdle), hmac(rawSessionId));
            return new SessionView(
                    view.userId(), view.role(), view.accountState(), view.accountStateVersion(),
                    newIdle, view.absoluteExpiresAt(), now, view.mustChangePassword());
        }
        return view;
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public SessionView requireLocked(String rawSessionId) {
        if (rawSessionId == null || rawSessionId.isBlank()) throw invalid();
        var locked = jdbc.query("""
                select user_id from sessions
                where session_hash = ? and revoked_at is null
                for update
                """, (rs, rowNum) -> rs.getObject("user_id", UUID.class), hmac(rawSessionId));
        if (locked.size() != 1) throw invalid();
        return require(rawSessionId);
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public SessionView requireForTokenIssuance(String rawSessionId) {
        if (rawSessionId == null || rawSessionId.isBlank()) throw invalid();
        var users = jdbc.query("""
                select u.id from sessions s join users u on u.id = s.user_id
                where s.session_hash = ? and s.revoked_at is null
                for update of u
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), hmac(rawSessionId));
        if (users.size() != 1) throw invalid();

        var session = requireLocked(rawSessionId);
        var currentRole = jdbc.queryForObject("""
                select case
                         when bool_or(r.code = 'SUPER_ADMIN') then 'HIGHEST_ADMIN'
                         when bool_or(r.code = 'ADMIN') then 'ADMIN'
                         when bool_or(r.code = 'RAG_OPERATOR') then 'RAG_ADMIN'
                         else 'PARTICIPANT'
                       end
                from users u
                left join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                left join roles r on r.id = ur.role_id
                where u.id = ? group by u.id
                """, String.class, session.userId());
        return new SessionView(
                session.userId(), SessionRole.valueOf(currentRole), session.accountState(),
                session.accountStateVersion(), session.idleExpiresAt(), session.absoluteExpiresAt(),
                session.lastSeenAt(), session.mustChangePassword());
    }

    @Transactional
    public void revoke(String rawSessionId, String reason) {
        if (rawSessionId == null || rawSessionId.isBlank()) return;
        jdbc.update("""
                update sessions set revoked_at = now(), revocation_reason = ?
                where session_hash = ? and revoked_at is null
                """, reason, hmac(rawSessionId));
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public void revokeAllFromSession(String rawSessionId, String reason) {
        if (rawSessionId == null || rawSessionId.isBlank()) throw invalid();
        var users = jdbc.query("""
                select u.id from sessions s join users u on u.id = s.user_id
                where s.session_hash = ? and s.revoked_at is null
                for update of u
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), hmac(rawSessionId));
        if (users.size() != 1) throw invalid();

        var session = requireLocked(rawSessionId);
        revokeAll(session.userId(), reason);
    }

    @Transactional
    public void revokeAll(UUID userId, String reason) {
        var locked = jdbc.query("select id from users where id = ? for update",
                (rs, rowNum) -> rs.getObject("id", UUID.class), userId);
        if (locked.size() != 1) throw invalid();
        jdbc.update("""
                update sessions set revoked_at = now(), revocation_reason = ?
                where user_id = ? and revoked_at is null
                """, reason, userId);
    }

    byte[] hmac(String value) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacSecret, "HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("HMAC-SHA-256 is unavailable", exception);
        }
    }

    public byte[] opaqueCompletionIdentity(String normalizedIdentity, String purpose) {
        if (normalizedIdentity == null || normalizedIdentity.isBlank()
                || purpose == null || purpose.isBlank()) {
            throw new IllegalArgumentException("Opaque completion identity inputs are required");
        }
        return hmac(
                "opaque-completion-identity\0" + purpose + "\0" + normalizedIdentity);
    }

    private static String opaqueToken() {
        var bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static AuthenticationException invalid() {
        return new AuthenticationException("Session is invalid or expired");
    }

    public enum SessionRole { PARTICIPANT, RAG_ADMIN, ADMIN, HIGHEST_ADMIN }

    public record IssuedSession(
            String sessionId, String csrfToken, SessionRole role, Instant idleExpiresAt, Instant absoluteExpiresAt) {}

    public record SessionView(
            UUID userId,
            SessionRole role,
            String accountState,
            long accountStateVersion,
            Instant idleExpiresAt,
            Instant absoluteExpiresAt,
            Instant lastSeenAt,
            boolean mustChangePassword) {}
}
