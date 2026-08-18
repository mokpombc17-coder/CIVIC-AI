package ai.civic.mainauth.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PreSessionRateLimitService {
    static final int ATTEMPTS_PER_WINDOW = 20;
    private static final String SOURCE_BUCKET_IDENTITY = "<source-ip-bucket>";
    private static final Pattern UUID_TEXT = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$");
    private final JdbcTemplate jdbc;
    private final AuthenticationIdentityLock identityLocks;

    public PreSessionRateLimitService(
            JdbcTemplate jdbc, AuthenticationIdentityLock identityLocks) {
        this.jdbc = jdbc;
        this.identityLocks = identityLocks;
    }

    @Transactional(noRollbackFor = RateLimitExceededException.class)
    public void checkAndRecord(String suppliedIdentity, String sourceIp) {
        jdbc.update("""
                delete from pre_session_rate_limits
                where last_attempt_at < now() - interval '24 hours'
                """);
        recordAttempt(SOURCE_BUCKET_IDENTITY, sourceIp);
        var identity = resolveAccountIdentity(suppliedIdentity);
        identityLocks.lock(identity);
        recordAttempt(identity, sourceIp);
    }

    private void recordAttempt(String identity, String sourceIp) {
        var result = jdbc.queryForMap("""
                insert into pre_session_rate_limits(
                    identity_hash, source_ip, attempt_count, window_started_at, last_attempt_at
                ) values (?, ?::inet, 1, now(), now())
                on conflict(identity_hash, source_ip) do update set
                    attempt_count = case
                        when pre_session_rate_limits.window_started_at <= now() - interval '10 minutes' then 1
                        else pre_session_rate_limits.attempt_count + 1
                    end,
                    window_started_at = case
                        when pre_session_rate_limits.window_started_at <= now() - interval '10 minutes' then now()
                        else pre_session_rate_limits.window_started_at
                    end,
                    blocked_until = case
                        when pre_session_rate_limits.window_started_at <= now() - interval '10 minutes' then null
                        when pre_session_rate_limits.attempt_count >= ? then
                            greatest(pre_session_rate_limits.blocked_until,
                                     pre_session_rate_limits.window_started_at + interval '10 minutes')
                        else pre_session_rate_limits.blocked_until
                    end,
                    last_attempt_at = now()
                returning attempt_count, blocked_until
                """, sha256(identity), sourceIp, ATTEMPTS_PER_WINDOW);
        var blockedUntil = (Timestamp) result.get("blocked_until");
        if (blockedUntil != null && blockedUntil.toInstant().isAfter(Instant.now())) {
            throw new RateLimitExceededException();
        }
    }

    private String resolveAccountIdentity(String suppliedIdentity) {
        var normalized = suppliedIdentity == null
                ? "anonymous"
                : suppliedIdentity.strip().toLowerCase(Locale.ROOT);
        if (!UUID_TEXT.matcher(normalized).matches()) return normalized;

        var challengeIdentities = jdbc.query(
                "select target_identity from auth_challenges where flow_hash = ? order by created_at desc limit 1",
                (rs, rowNum) -> rs.getString(1), sha256(normalized));
        if (!challengeIdentities.isEmpty()) return challengeIdentities.getFirst().strip().toLowerCase(Locale.ROOT);

        var signupIdentities = jdbc.query(
                "select normalized_email from signup_flows where id = ?",
                (rs, rowNum) -> rs.getString(1), UUID.fromString(normalized));
        return signupIdentities.isEmpty()
                ? normalized
                : signupIdentities.getFirst().strip().toLowerCase(Locale.ROOT);
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
