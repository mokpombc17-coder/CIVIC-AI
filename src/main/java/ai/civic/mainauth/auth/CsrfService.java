package ai.civic.mainauth.auth;

import java.security.MessageDigest;
import java.util.Base64;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CsrfService {
    private final JdbcTemplate jdbc;
    private final SessionService sessions;

    public CsrfService(JdbcTemplate jdbc, SessionService sessions) {
        this.jdbc = jdbc;
        this.sessions = sessions;
    }

    @Transactional
    public String issue(String rawSessionId) {
        sessions.require(rawSessionId);
        var raw = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(sessions.hmac("csrf-token:" + rawSessionId));
        jdbc.update("update sessions set csrf_hash = ? where session_hash = ? and revoked_at is null",
                sessions.hmac(raw), sessions.hmac(rawSessionId));
        return raw;
    }

    @Transactional(readOnly = true)
    public boolean matches(String rawSessionId, String suppliedToken) {
        if (rawSessionId == null || suppliedToken == null) return false;
        var hashes = jdbc.query("select csrf_hash from sessions where session_hash = ? and revoked_at is null",
                (rs, rowNum) -> rs.getBytes(1), sessions.hmac(rawSessionId));
        return hashes.size() == 1 && MessageDigest.isEqual(hashes.getFirst(), sessions.hmac(suppliedToken));
    }
}
