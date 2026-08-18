package ai.civic.mainauth.auth;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public final class AuthenticationIdentityLock {
    private final JdbcTemplate jdbc;

    public AuthenticationIdentityLock(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void lock(String normalizedIdentity) {
        if (normalizedIdentity == null || normalizedIdentity.isBlank()) {
            throw new IllegalArgumentException("Authentication identity is required");
        }
        var lockKey = ByteBuffer.wrap(sha256(normalizedIdentity)).getLong();
        jdbc.queryForObject(
                "select pg_advisory_xact_lock(?)", (rs, rowNum) -> Boolean.TRUE, lockKey);
    }

    private byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
