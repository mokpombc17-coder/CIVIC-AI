package ai.civic.mainauth.auth;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Locale;
import java.security.SecureRandom;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ai.civic.mainauth.notification.VerificationCodeProtector;
import ai.civic.mainauth.notification.SmtpNotificationService;
import ai.civic.mainauth.notification.NotificationDeliveryException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class AuthenticationFlowService {
    private static final String PUBLIC_FAILURE = "Email or password is invalid";
    private static final String CODE_FAILURE = "Authentication code is invalid";
    private final JdbcTemplate jdbc;
    private final SessionService sessions;
    private final VerificationCodeProtector codeProtector;
    private final SmtpNotificationService smtp;
    private final ObjectMapper json;
    private final Clock clock;
    private final Argon2PasswordEncoder passwords = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    private final String dummyPasswordHash = passwords.encode("CivicDummyPassword1!");

    @Autowired
    public AuthenticationFlowService(
            JdbcTemplate jdbc,
            SessionService sessions,
            VerificationCodeProtector codeProtector,
            SmtpNotificationService smtp,
            ObjectMapper json) {
        this(jdbc, sessions, codeProtector, smtp, json, Clock.systemUTC());
    }

    AuthenticationFlowService(
            JdbcTemplate jdbc,
            SessionService sessions,
            VerificationCodeProtector codeProtector,
            SmtpNotificationService smtp,
            ObjectMapper json,
            Clock clock) {
        this.jdbc = jdbc;
        this.sessions = sessions;
        this.codeProtector = codeProtector;
        this.smtp = smtp;
        this.json = json;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = {AuthenticationException.class, NotificationDeliveryException.class})
    public LoginResult login(String email, String password, String sourceIp) {
        var normalized = normalize(email);
        if (isThrottled(normalized, sourceIp)) throw new AuthenticationException(PUBLIC_FAILURE);
        lockAuthenticationIdentity(normalized);
        if (isThrottled(normalized, sourceIp)) throw new AuthenticationException(PUBLIC_FAILURE);
        var identities = jdbc.query("""
                select id from users where normalized_email = ? for update
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), normalized);
        var account = identities.size() == 1 ? jdbc.queryForObject("""
                select u.id, u.state, c.password_hash, c.two_factor_enabled, c.must_change_password,
                       case
                         when bool_or(r.code = 'SUPER_ADMIN') then 'HIGHEST_ADMIN'
                         when bool_or(r.code = 'ADMIN') then 'ADMIN'
                         when bool_or(r.code = 'RAG_OPERATOR') then 'RAG_ADMIN'
                         else 'PARTICIPANT'
                       end as primary_role
                from users u join credentials c on c.user_id = u.id
                left join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                left join roles r on r.id = ur.role_id
                where u.id = ?
                group by u.id, u.state, c.password_hash, c.two_factor_enabled, c.must_change_password
                """, (rs, rowNum) -> new Account(
                rs.getObject("id", UUID.class), rs.getString("state"), rs.getString("password_hash"),
                rs.getBoolean("two_factor_enabled"), rs.getBoolean("must_change_password"),
                SessionService.SessionRole.valueOf(rs.getString("primary_role"))), identities.getFirst()) : null;
        var eligible = account != null && "ACTIVE".equals(account.state());
        var passwordHash = eligible ? account.passwordHash() : dummyPasswordHash;
        var passwordMatches = password != null && safeMatches(password, passwordHash);
        if (!eligible || !passwordMatches) {
            recordFailure(normalized, sourceIp);
            throw new AuthenticationException(PUBLIC_FAILURE);
        }
        clearFailures(normalized, sourceIp);
        if (account.twoFactorEnabled()) {
            var flow = createChallenge(account.id(), normalized, "TWO_FACTOR").toString();
            return new LoginResult(Next.TWO_FACTOR, null, flow, account.role(), account.mustChangePassword());
        }
        var issued = sessions.issue(account.id(), account.role());
        return new LoginResult(Next.SESSION, issued.sessionId(), null, account.role(), account.mustChangePassword());
    }

    @Transactional
    public void changePassword(
            String sessionId, UUID userId, String currentPassword, String newPassword) {
        requireValidPassword(newPassword);
        lockUser(userId);
        var states = jdbc.queryForList("select state from users where id = ?", String.class, userId);
        if (states.size() != 1 || !"ACTIVE".equals(states.getFirst())) {
            throw new AuthenticationException(PUBLIC_FAILURE);
        }
        var currentSession = sessions.requireLocked(sessionId);
        if (!userId.equals(currentSession.userId())) {
            throw new AuthenticationException(PUBLIC_FAILURE);
        }
        var encoded = jdbc.queryForObject(
                "select password_hash from credentials where user_id = ? for update", String.class, userId);
        if (!safeMatches(currentPassword, encoded)) throw new AuthenticationException(PUBLIC_FAILURE);
        jdbc.update("""
                update credentials set password_hash = ?, must_change_password = false,
                    password_changed_at = now() where user_id = ?
                """, passwords.encode(newPassword), userId);
        consumePendingLoginChallenges(userId);
        consumePendingPasswordResetChallenges(userId);
        sessions.revokeAll(userId, "PASSWORD_CHANGED");
    }

    @Transactional(readOnly = true)
    public void confirmPassword(UUID userId, String password) {
        var encoded = jdbc.queryForObject(
                "select password_hash from credentials where user_id = ?", String.class, userId);
        if (!safeMatches(password, encoded)) throw new AuthenticationException(PUBLIC_FAILURE);
    }

    @Transactional(noRollbackFor = NotificationDeliveryException.class)
    public UUID requestTwoFactorEnable(String sessionId, UUID userId, String email) {
        var lockedIdentity = lockActiveUserIdentity(userId);
        var currentSession = sessions.requireLocked(sessionId);
        if (!userId.equals(currentSession.userId())) {
            throw new AuthenticationException(PUBLIC_FAILURE);
        }
        if (!lockedIdentity.equals(normalize(email))) {
            throw new AuthenticationException(PUBLIC_FAILURE);
        }
        return createChallenge(userId, lockedIdentity, "TWO_FACTOR_ENABLE");
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public void enableTwoFactor(String sessionId, UUID userId, UUID flowId, String code) {
        var lockedUserId = lockChallengeUser(flowId, "TWO_FACTOR_ENABLE");
        if (!userId.equals(lockedUserId)) {
            throw new AuthenticationException("Authentication flow subject mismatch");
        }
        var currentSession = sessions.requireLocked(sessionId);
        if (!userId.equals(currentSession.userId())) {
            throw new AuthenticationException("Authentication flow subject mismatch");
        }
        var verified = consumeChallenge(flowId, "TWO_FACTOR_ENABLE", code);
        if (!userId.equals(verified.userId())) throw new AuthenticationException("Authentication flow subject mismatch");
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
    }

    @Transactional
    public void disableTwoFactor(String sessionId, UUID userId, String password) {
        lockUser(userId);
        var states = jdbc.queryForList("select state from users where id = ?", String.class, userId);
        if (states.size() != 1 || !"ACTIVE".equals(states.getFirst())) {
            throw new AuthenticationException(PUBLIC_FAILURE);
        }
        var currentSession = sessions.requireLocked(sessionId);
        if (!userId.equals(currentSession.userId())) {
            throw new AuthenticationException(PUBLIC_FAILURE);
        }
        confirmPassword(userId, password);
        jdbc.update("""
                update credentials set two_factor_enabled = false,
                    two_factor_secret_ciphertext = null where user_id = ?
                """, userId);
        consumePendingLoginChallenges(userId);
        consumePendingTwoFactorEnableChallenges(userId);
        sessions.revokeAll(userId, "TWO_FACTOR_DISABLED");
    }

    @Transactional(noRollbackFor = NotificationDeliveryException.class)
    public UUID requestPasswordReset(String email) {
        return requestAccountChallenge(email, "ACTIVE", "PASSWORD_RESET", false);
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public void completePasswordReset(UUID flowId, String code, String newPassword) {
        requireValidPassword(newPassword);
        lockChallengeUser(flowId, "PASSWORD_RESET");
        var verified = consumeChallenge(flowId, "PASSWORD_RESET", code);
        jdbc.update("""
                update credentials set password_hash = ?, must_change_password = false,
                    password_changed_at = now() where user_id = ?
                """, passwords.encode(newPassword), verified.userId());
        consumePendingLoginChallenges(verified.userId());
        consumePendingPasswordResetChallenges(verified.userId());
        sessions.revokeAll(verified.userId(), "PASSWORD_RESET");
    }

    private void consumePendingLoginChallenges(UUID userId) {
        jdbc.update("""
                update auth_challenges set consumed_at = now()
                where user_id = ? and purpose = 'TWO_FACTOR' and consumed_at is null
                """, userId);
    }

    private void consumePendingPasswordResetChallenges(UUID userId) {
        jdbc.update("""
                update auth_challenges set consumed_at = now()
                where user_id = ? and purpose = 'PASSWORD_RESET' and consumed_at is null
                """, userId);
    }

    private void consumePendingTwoFactorEnableChallenges(UUID userId) {
        jdbc.update("""
                update auth_challenges set consumed_at = now()
                where user_id = ? and purpose = 'TWO_FACTOR_ENABLE' and consumed_at is null
                """, userId);
    }

    @Transactional(noRollbackFor = NotificationDeliveryException.class)
    public UUID requestReactivation(String email, String password) {
        var normalized = normalize(email);
        lockAuthenticationIdentity(normalized);
        var accounts = jdbc.query("""
                select u.id, c.password_hash, u.normalized_email
                from users u join credentials c on c.user_id = u.id
                where u.normalized_email = ? and u.state = 'DEACTIVATED' and u.deleted_at is null
                for update of u
                """, (rs, rowNum) -> new ReactivationAccount(
                rs.getObject("id", UUID.class), rs.getString("password_hash"),
                rs.getString("normalized_email")), normalized);
        var eligible = accounts.size() == 1;
        var passwordHash = eligible ? accounts.getFirst().passwordHash() : dummyPasswordHash;
        var passwordMatches = password != null && safeMatches(password, passwordHash);
        if (!eligible || !passwordMatches) {
            return createDummyChallenge(normalized, "REACTIVATION");
        }
        return createChallenge(
                accounts.getFirst().id(), accounts.getFirst().normalizedEmail(), "REACTIVATION", false);
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public void completeReactivation(UUID flowId, String code) {
        var lockedUserId = lockChallengeUser(flowId, "REACTIVATION");
        var verified = consumeChallenge(flowId, "REACTIVATION", code);
        if (!lockedUserId.equals(verified.userId())) {
            throw new AuthenticationException(CODE_FAILURE);
        }
        var changed = jdbc.update("""
                update users set state = 'ACTIVE', deactivated_at = null,
                    account_state_version = account_state_version + 1, updated_at = now()
                where id = ? and state = 'DEACTIVATED' and deleted_at is null
                """, verified.userId());
        if (changed != 1) throw new AuthenticationException("Account cannot be reactivated");
        jdbc.update("""
                insert into account_state_outbox(user_id, account_state_version, state, event_payload)
                select id, account_state_version, 'ACTIVE',
                    jsonb_build_object('subject_id', id, 'version', account_state_version,
                                       'state', 'ACTIVE', 'reason', 'SELF_REACTIVATION', 'at', now())
                from users where id = ?
                """, verified.userId());
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public LoginResult verifyTwoFactor(UUID flowId, String code) {
        lockChallengeUser(flowId, "TWO_FACTOR");
        var verified = consumeChallenge(flowId, "TWO_FACTOR", code);
        var account = loadAccount(verified.userId());
        if (!"ACTIVE".equals(account.state())) throw new AuthenticationException(PUBLIC_FAILURE);
        var issued = sessions.issue(account.id(), account.role());
        return new LoginResult(Next.SESSION, issued.sessionId(), null, account.role(), account.mustChangePassword());
    }

    @Transactional(noRollbackFor = NotificationDeliveryException.class)
    public void resend(UUID flowId, String purpose) {
        var rows = jdbc.query("""
                select id, user_id, target_identity, resend_count, last_sent_at,
                       resend_window_started_at, consumed_at, expires_at
                from auth_challenges where flow_hash = ? and purpose = ? for update
                """, (rs, rowNum) -> new Challenge(
                rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getString("target_identity"), rs.getInt("resend_count"),
                rs.getTimestamp("last_sent_at") == null ? null : rs.getTimestamp("last_sent_at").toInstant(),
                rs.getTimestamp("resend_window_started_at") == null ? null
                        : rs.getTimestamp("resend_window_started_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("consumed_at") != null),
                sha256(flowId.toString()), purpose);
        if (rows.size() != 1) throw new AuthenticationException(CODE_FAILURE);
        var challenge = rows.getFirst();
        var now = clock.instant();
        var count = challenge.windowStartedAt() != null
                        && challenge.windowStartedAt().plus(Duration.ofHours(1)).isAfter(now)
                ? challenge.resendCount() : 0;
        if (challenge.consumed() || challenge.expiresAt().isBefore(now)
                || count >= 5 || (challenge.lastSentAt() != null
                        && challenge.lastSentAt().plusSeconds(60).isAfter(now))) {
            throw new AuthenticationException("Authentication code cannot be resent yet");
        }
        var code = verificationCode();
        retirePendingChallengeNotifications(challenge.id(), purpose);
        jdbc.update("""
                update auth_challenges set code_hash = ?, attempt_count = 0,
                    resend_count = ?, last_sent_at = ?, resend_window_started_at = ?,
                    expires_at = ? where id = ?
                """, sha256(code), count + 1, Timestamp.from(now),
                Timestamp.from(count == 0 ? now : challenge.windowStartedAt()),
                Timestamp.from(now.plus(Duration.ofMinutes(10))), challenge.id());
        enqueueChallengeMail(purpose, challenge.targetIdentity(), challenge.id(), code, true);
    }

    private UUID requestAccountChallenge(
            String email, String requiredState, String purpose, boolean deliverSynchronously) {
        var normalized = normalize(email);
        lockAuthenticationIdentity(normalized);
        var ids = jdbc.query("""
                select id from users where normalized_email = ? and state = ? for update
                """,
                (rs, rowNum) -> rs.getObject(1, UUID.class), normalized, requiredState);
        if (ids.isEmpty()) return createDummyChallenge(normalized, purpose);
        return createChallenge(ids.getFirst(), normalized, purpose, deliverSynchronously);
    }

    private UUID createDummyChallenge(String targetIdentity, String purpose) {
        try {
            var userId = UUID.randomUUID();
            var flow = UUID.randomUUID();
            var challengeId = UUID.randomUUID();
            var code = verificationCode();
            var now = clock.instant();
            jdbc.update("""
                    update auth_challenges set consumed_at = now()
                    where user_id = ? and purpose = ? and consumed_at is null
                    """, userId, purpose);
            jdbc.update("""
                    insert into auth_challenges(
                        id, flow_hash, user_id, purpose, target_identity, code_hash,
                        expires_at, last_sent_at, resend_window_started_at
                    ) select ?, ?, ?, ?, ?, ?, ?, ?, ? where false
                    """, challengeId, sha256(flow.toString()), userId, purpose, targetIdentity,
                    sha256(code), Timestamp.from(now.plus(Duration.ofMinutes(10))),
                    Timestamp.from(now), Timestamp.from(now));
            jdbc.update("""
                    insert into notification_outbox(event_type, recipient, payload)
                    select ?, ?, ?::jsonb where false
                    """, purpose, targetIdentity, challengePayload(purpose, challengeId, code));
            return flow;
        } catch (Exception exception) {
            throw new IllegalStateException("Could not perform opaque authentication work", exception);
        }
    }

    private UUID createChallenge(UUID userId, String targetIdentity, String purpose) {
        return createChallenge(userId, targetIdentity, purpose, true);
    }

    private UUID createChallenge(
            UUID userId, String targetIdentity, String purpose, boolean deliverSynchronously) {
        retirePendingChallengeNotificationsForUser(userId, purpose);
        jdbc.update("""
                update auth_challenges set consumed_at = now()
                where user_id = ? and purpose = ? and consumed_at is null
                """, userId, purpose);
        var flow = UUID.randomUUID();
        var challengeId = UUID.randomUUID();
        var code = verificationCode();
        var now = clock.instant();
        jdbc.update("""
                insert into auth_challenges(
                    id, flow_hash, user_id, purpose, target_identity, code_hash,
                    expires_at, last_sent_at, resend_window_started_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, challengeId, sha256(flow.toString()), userId, purpose, targetIdentity,
                sha256(code), Timestamp.from(now.plus(Duration.ofMinutes(10))),
                Timestamp.from(now), Timestamp.from(now));
        enqueueChallengeMail(purpose, targetIdentity, challengeId, code, deliverSynchronously);
        return flow;
    }

    private void retirePendingChallengeNotifications(UUID challengeId, String purpose) {
        jdbc.update("""
                update notification_outbox set delivered_at = now(), leased_until = null,
                    last_error_code = 'CHALLENGE_SUPERSEDED'
                where delivered_at is null and event_type = ?
                  and payload ->> 'challenge_id' = ?
                """, purpose, challengeId.toString());
    }

    private void retirePendingChallengeNotificationsForUser(UUID userId, String purpose) {
        jdbc.update("""
                update notification_outbox notification set delivered_at = now(), leased_until = null,
                    last_error_code = 'CHALLENGE_SUPERSEDED'
                from auth_challenges challenge
                where notification.delivered_at is null
                  and notification.event_type = ?
                  and challenge.user_id = ? and challenge.purpose = ?
                  and notification.payload ->> 'challenge_id' = challenge.id::text
                """, purpose, userId, purpose);
    }

    private VerifiedChallenge consumeChallenge(UUID flowId, String purpose, String code) {
        var rows = jdbc.query("""
                select id, user_id, code_hash, attempt_count, expires_at, consumed_at
                from auth_challenges where flow_hash = ? and purpose = ? for update
                """, (rs, rowNum) -> new ChallengeVerification(
                rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getBytes("code_hash"), rs.getInt("attempt_count"),
                rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("consumed_at") != null),
                sha256(flowId.toString()), purpose);
        if (rows.size() != 1) throw new AuthenticationException(CODE_FAILURE);
        var challenge = rows.getFirst();
        if (challenge.consumed() || challenge.expiresAt().isBefore(clock.instant())
                || challenge.attemptCount() >= 5
                || code == null || !MessageDigest.isEqual(challenge.codeHash(), sha256(code))) {
            jdbc.update("update auth_challenges set attempt_count = attempt_count + 1 where id = ?",
                    challenge.id());
            throw new AuthenticationException(CODE_FAILURE);
        }
        jdbc.update("update auth_challenges set consumed_at = now() where id = ?", challenge.id());
        return new VerifiedChallenge(challenge.userId());
    }

    private UUID lockChallengeUser(UUID flowId, String purpose) {
        var users = jdbc.query("""
                select user_id from auth_challenges where flow_hash = ? and purpose = ?
                """, (rs, rowNum) -> rs.getObject("user_id", UUID.class), sha256(flowId.toString()), purpose);
        if (users.size() != 1) {
            recordOpaqueCompletionAttempt(flowId, purpose);
            throw new AuthenticationException(CODE_FAILURE);
        }
        lockUser(users.getFirst());
        return users.getFirst();
    }

    private void recordOpaqueCompletionAttempt(UUID flowId, String purpose) {
        var attemptKey = sha256("opaque-completion\0" + purpose + "\0" + flowId);
        var lockKey = ByteBuffer.wrap(attemptKey).getLong();
        jdbc.queryForObject(
                "select pg_advisory_xact_lock(?)", (rs, rowNum) -> Boolean.TRUE, lockKey);

        // A bounded set of non-personal sentinel rows gives unknown flows the same serialized
        // lock-and-write shape as real invalid-code attempts without retaining the submitted flow.
        var shard = Byte.toUnsignedInt(attemptKey[Long.BYTES]);
        var shardHash = sha256("opaque-completion-shard\0" + purpose + "\0" + shard);
        jdbc.update("""
                insert into auth_challenges(
                    flow_hash, user_id, purpose, target_identity, code_hash,
                    attempt_count, expires_at, consumed_at
                ) values (?, null, 'OPAQUE_COMPLETION', null, null, 1,
                          now() + interval '100 years', now())
                on conflict(flow_hash) do update set
                    attempt_count = case
                        when auth_challenges.attempt_count >= 2147483646 then 1
                        else auth_challenges.attempt_count + 1
                    end,
                    consumed_at = now()
                """, shardHash);
    }

    private void lockUser(UUID userId) {
        var locked = jdbc.query("select id from users where id = ? for update",
                (rs, rowNum) -> rs.getObject("id", UUID.class), userId);
        if (locked.size() != 1) throw new AuthenticationException(PUBLIC_FAILURE);
    }

    private void lockAuthenticationIdentity(String normalizedEmail) {
        var lockKey = ByteBuffer.wrap(sha256(normalizedEmail)).getLong();
        jdbc.queryForObject(
                "select pg_advisory_xact_lock(?)", (rs, rowNum) -> Boolean.TRUE, lockKey);
    }

    private String lockActiveUserIdentity(UUID userId) {
        var identities = jdbc.query("""
                select normalized_email from users
                where id = ? and state = 'ACTIVE' and deleted_at is null
                for update
                """, (rs, rowNum) -> rs.getString("normalized_email"), userId);
        if (identities.size() != 1) throw new AuthenticationException(PUBLIC_FAILURE);
        return identities.getFirst();
    }

    private Account loadAccount(UUID userId) {
        return jdbc.queryForObject("""
                select u.id, u.state, c.password_hash, c.two_factor_enabled, c.must_change_password,
                       case
                         when bool_or(r.code = 'SUPER_ADMIN') then 'HIGHEST_ADMIN'
                         when bool_or(r.code = 'ADMIN') then 'ADMIN'
                         when bool_or(r.code = 'RAG_OPERATOR') then 'RAG_ADMIN'
                         else 'PARTICIPANT'
                       end as primary_role
                from users u join credentials c on c.user_id = u.id
                left join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                left join roles r on r.id = ur.role_id
                where u.id = ?
                group by u.id, u.state, c.password_hash, c.two_factor_enabled, c.must_change_password
                """, (rs, rowNum) -> new Account(
                rs.getObject("id", UUID.class), rs.getString("state"), rs.getString("password_hash"),
                rs.getBoolean("two_factor_enabled"), rs.getBoolean("must_change_password"),
                SessionService.SessionRole.valueOf(rs.getString("primary_role"))), userId);
    }

    private void enqueueChallengeMail(
            String purpose, String target, UUID challengeId, String code, boolean deliverSynchronously) {
        try {
            var payload = challengePayload(purpose, challengeId, code);
            var notificationId = jdbc.queryForObject("""
                    insert into notification_outbox(event_type, recipient, payload)
                    values (?, ?, ?::jsonb) returning id
                    """, UUID.class, purpose, target, payload);
            if (!deliverSynchronously) return;
            try {
                smtp.sendChallenge(target, code, purpose);
                jdbc.update("""
                        update notification_outbox set delivered_at = now(), attempt_count = 1
                        where id = ?
                        """, notificationId);
            } catch (RuntimeException deliveryFailure) {
                jdbc.update("""
                        update notification_outbox set attempt_count = 1,
                            last_error_code = 'SMTP_DELIVERY_FAILED'
                        where id = ?
                        """, notificationId);
                throw new NotificationDeliveryException();
            }
        } catch (NotificationDeliveryException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Could not enqueue authentication notification", exception);
        }
    }

    private String challengePayload(String purpose, UUID challengeId, String code) throws Exception {
        return json.writeValueAsString(Map.of(
                "challenge_id", challengeId.toString(),
                "protected_code", codeProtector.protect(code),
                "template", purpose.toLowerCase(Locale.ROOT)));
    }

    private static String verificationCode() {
        return "%06d".formatted(new SecureRandom().nextInt(1_000_000));
    }

    private static void requireValidPassword(String password) {
        if (password == null || !password.matches(
                "^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\\-=])[A-Za-z0-9!@#$%^&*()_+\\-=]{8,1024}$")) {
            throw new AuthenticationException("New password does not satisfy the password policy");
        }
    }

    private boolean safeMatches(String raw, String encoded) {
        try {
            return passwords.matches(raw, encoded);
        } catch (RuntimeException malformedHash) {
            return false;
        }
    }

    private void recordFailure(String normalizedEmail, String sourceIp) {
        jdbc.update("delete from login_throttles where last_failure_at < now() - interval '24 hours'");
        jdbc.update("""
                insert into login_throttles(
                    identity_hash, source_ip, failure_count, next_allowed_at, last_failure_at
                ) values (?, ?::inet, 1, now() + interval '1 second', now())
                on conflict(identity_hash, source_ip) do update set
                    failure_count = least(login_throttles.failure_count + 1, 20),
                    next_allowed_at = now() + make_interval(secs => least(30, login_throttles.failure_count + 1)),
                    last_failure_at = now()
                """, sha256(normalizedEmail), sourceIp);
    }

    private boolean isThrottled(String normalizedEmail, String sourceIp) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(
                    select 1 from login_throttles
                    where identity_hash = ? and source_ip = ?::inet and next_allowed_at > now()
                )
                """, Boolean.class, sha256(normalizedEmail), sourceIp));
    }

    private void clearFailures(String normalizedEmail, String sourceIp) {
        jdbc.update("delete from login_throttles where identity_hash = ? and source_ip = ?::inet",
                sha256(normalizedEmail), sourceIp);
    }

    private String normalize(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public enum Next { SESSION, TWO_FACTOR }

    public record LoginResult(
            Next next,
            String sessionId,
            String authFlowId,
            SessionService.SessionRole role,
            boolean mustChangePassword) {}

    private record Account(
            UUID id,
            String state,
            String passwordHash,
            boolean twoFactorEnabled,
            boolean mustChangePassword,
            SessionService.SessionRole role) {}

    private record Challenge(
            UUID id,
            UUID userId,
            String targetIdentity,
            int resendCount,
            Instant lastSentAt,
            Instant windowStartedAt,
            Instant expiresAt,
            boolean consumed) {}

    private record ChallengeVerification(
            UUID id, UUID userId, byte[] codeHash, int attemptCount, Instant expiresAt, boolean consumed) {}

    private record VerifiedChallenge(UUID userId) {}
    private record ReactivationAccount(UUID id, String passwordHash, String normalizedEmail) {}
}
