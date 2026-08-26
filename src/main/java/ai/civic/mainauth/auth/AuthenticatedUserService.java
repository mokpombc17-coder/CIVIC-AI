package ai.civic.mainauth.auth;

import ai.civic.mainauth.token.AccessTokenService;
import ai.civic.mainauth.token.Rs256KeyRing;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jwt.SignedJWT;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthenticatedUserService {
    private final JdbcTemplate jdbc;
    private final Rs256KeyRing keyRing;
    private final String issuer;
    private final Clock clock;

    @Autowired
    public AuthenticatedUserService(
            JdbcTemplate jdbc,
            Rs256KeyRing keyRing,
            @Value("${civic.issuer:https://localhost}") String issuer) {
        this(jdbc, keyRing, issuer, Clock.systemUTC());
    }

    AuthenticatedUserService(JdbcTemplate jdbc, Rs256KeyRing keyRing, String issuer, Clock clock) {
        this.jdbc = jdbc;
        this.keyRing = keyRing;
        this.issuer = issuer;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AuthenticatedUser require(String rawAccessToken) {
        var credential = verify(rawAccessToken);
        var current = loadCurrentByEmail(credential.subjectEmail());
        if (!"ACTIVE".equals(current.accountState())
                || current.accountStateVersion() != credential.accountStateVersion()) {
            throw invalid();
        }
        return current.withCredential(
                credential.jwtId(), credential.issuedAt(), credential.expiresAt(), credential.scopes(),
                credential.mustChangePassword());
    }

    @Transactional
    public AuthenticatedUser requireLocked(String rawAccessToken) {
        var credential = verify(rawAccessToken);
        var userId = lockUserByEmail(credential.subjectEmail());
        var current = loadCurrent(userId);
        if (!"ACTIVE".equals(current.accountState())
                || current.accountStateVersion() != credential.accountStateVersion()) {
            throw invalid();
        }
        return current.withCredential(
                credential.jwtId(), credential.issuedAt(), credential.expiresAt(), credential.scopes(),
                credential.mustChangePassword());
    }

    @Transactional(readOnly = true)
    public AuthenticatedUser current(UUID userId) {
        return loadCurrent(userId);
    }

    @Transactional
    public AuthenticatedUser currentLocked(UUID userId) {
        lockUser(userId);
        return loadCurrent(userId);
    }

    @Transactional
    public AuthenticatedUser currentActiveLocked(UUID userId) {
        var current = currentLocked(userId);
        if (!"ACTIVE".equals(current.accountState())) throw invalid();
        return current;
    }

    private TokenCredential verify(String rawAccessToken) {
        if (rawAccessToken == null || rawAccessToken.isBlank()) throw invalid();
        try {
            var jwt = SignedJWT.parse(rawAccessToken);
            if (!JWSAlgorithm.RS256.equals(jwt.getHeader().getAlgorithm())) throw invalid();
            var key = keyRing.verificationKey(jwt.getHeader().getKeyID());
            if (key == null || !jwt.verify(new RSASSAVerifier(key))) throw invalid();

            var claims = jwt.getJWTClaimsSet();
            var serializedAudience = jwt.getPayload().toJSONObject().get("aud");
            var now = clock.instant();
            var issuedAt = claims.getIssueTime();
            var expiresAt = claims.getExpirationTime();
            var jwtId = claims.getJWTID();
            var subjectEmail = claims.getSubject();
            var scope = claims.getStringClaim("scope");
            var accountStateVersion = claims.getLongClaim("account_state_version");
            var mustChangePassword = claims.getBooleanClaim("must_change_password");
            if (!issuer.equals(claims.getIssuer())
                    || claims.getAudience() == null
                    || !claims.getAudience().contains(AccessTokenService.AUDIENCE)
                    || !(serializedAudience instanceof java.util.List<?> audience)
                    || !audience.contains(AccessTokenService.AUDIENCE)
                    || issuedAt == null
                    || expiresAt == null
                    || jwtId == null
                    || jwtId.isBlank()
                    || subjectEmail == null
                    || subjectEmail.isBlank()
                    || scope == null
                    || accountStateVersion == null
                    || mustChangePassword == null
                    || !expiresAt.toInstant().isAfter(now)
                    || issuedAt.toInstant().isAfter(now.plusSeconds(30))) {
                throw invalid();
            }
            var scopes = scope.isBlank() ? Set.<String>of() : Set.copyOf(Arrays.asList(scope.split(" ")));
            return new TokenCredential(
                    subjectEmail, jwtId, issuedAt.toInstant(), expiresAt.toInstant(),
                    accountStateVersion, scopes, mustChangePassword);
        } catch (AuthenticationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalid();
        }
    }

    private AuthenticatedUser loadCurrent(UUID userId) {
        var rows = jdbc.query("""
                select u.id, u.email, u.state, u.account_state_version, c.must_change_password,
                       case
                         when bool_or(r.code = 'SUPER_ADMIN') then 'HIGHEST_ADMIN'
                         when bool_or(r.code = 'ADMIN') then 'ADMIN'
                         else 'PARTICIPANT'
                       end as primary_role
                from users u
                join credentials c on c.user_id = u.id
                left join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                left join roles r on r.id = ur.role_id
                where u.id = ?
                group by u.id, u.email, u.state, u.account_state_version, c.must_change_password
                """, (rs, rowNum) -> new AuthenticatedUser(
                rs.getObject("id", UUID.class), rs.getString("email"),
                UserRole.valueOf(rs.getString("primary_role")),
                currentPermissions(userId), rs.getString("state"), rs.getLong("account_state_version"),
                rs.getBoolean("must_change_password"), null, null, null, Set.of()), userId);
        if (rows.size() != 1) throw invalid();
        return rows.getFirst();
    }

    private AuthenticatedUser loadCurrentByEmail(String subjectEmail) {
        var userIds = jdbc.query(
                "select id from users where email = ? and deleted_at is null",
                (rs, rowNum) -> rs.getObject("id", UUID.class), subjectEmail);
        if (userIds.size() != 1) throw invalid();
        return loadCurrent(userIds.getFirst());
    }

    private Set<String> currentPermissions(UUID userId) {
        return Set.copyOf(jdbc.queryForList("""
                select p.code
                from user_permissions up join permissions p on p.id = up.permission_id
                where up.user_id = ? and up.revoked_at is null order by p.code
                """, String.class, userId));
    }

    private void lockUser(UUID userId) {
        var locked = jdbc.query("select id from users where id = ? for update",
                (rs, rowNum) -> rs.getObject("id", UUID.class), userId);
        if (locked.size() != 1) throw invalid();
    }

    private UUID lockUserByEmail(String subjectEmail) {
        var locked = jdbc.query(
                "select id from users where email = ? and deleted_at is null for update",
                (rs, rowNum) -> rs.getObject("id", UUID.class), subjectEmail);
        if (locked.size() != 1) throw invalid();
        return locked.getFirst();
    }

    private static AuthenticationException invalid() {
        return new AuthenticationException("Access token is invalid or expired");
    }

    public enum UserRole { PARTICIPANT, ADMIN, HIGHEST_ADMIN }

    public record AuthenticatedUser(
            UUID userId,
            String email,
            UserRole role,
            Set<String> permissions,
            String accountState,
            long accountStateVersion,
            boolean mustChangePassword,
            String jwtId,
            Instant issuedAt,
            Instant expiresAt,
            Set<String> scopes) {
        AuthenticatedUser withCredential(
                String jwtId,
                Instant issuedAt,
                Instant expiresAt,
                Set<String> scopes,
                boolean credentialRequiresPasswordChange) {
            return new AuthenticatedUser(
                    userId, email, role, permissions, accountState, accountStateVersion,
                    // A token issued under mandatory rotation stays restricted for its full life.
                    mustChangePassword || credentialRequiresPasswordChange,
                    jwtId, issuedAt, expiresAt, scopes);
        }
    }

    private record TokenCredential(
            String subjectEmail,
            String jwtId,
            Instant issuedAt,
            Instant expiresAt,
            long accountStateVersion,
            Set<String> scopes,
            boolean mustChangePassword) {}
}
