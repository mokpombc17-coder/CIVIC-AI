package ai.civic.mainauth.signup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import ai.civic.mainauth.notification.VerificationCodeProtector;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;
import java.util.stream.Stream;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class SignupInvariantTest extends PostgresIntegrationTest {
    @Autowired SignupFlowService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired VerificationCodeProtector codeProtector;

    @BeforeEach
    void cleanSignupData() {
        jdbc.update("update feature_gates set enabled = true where gate_key = 'PUBLIC_SIGNUP_ENABLED'");
        jdbc.update("delete from account_state_outbox where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from notification_outbox");
        jdbc.update("delete from auth_challenges");
        jdbc.update("delete from consent_evidence");
        jdbc.update("delete from questionnaire_responses");
        jdbc.update("delete from signup_flows");
        jdbc.update("delete from pwa_refresh_sessions where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from user_permissions where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from user_roles where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from credentials where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from users where origin = 'SIGNUP'");
    }

    @Test
    void publicSignupCannotStartWhileTheProductionGateIsDisabled() {
        jdbc.update("update feature_gates set enabled = false where gate_key = 'PUBLIC_SIGNUP_ENABLED'");

        assertThatThrownBy(() -> service.startSignup("blocked@example.com"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PUBLIC_SIGNUP_ENABLED");

        assertThat(count("signup_flows", "normalized_email = 'blocked@example.com'")).isZero();
    }

    @Test
    void disablingTheSignupKillSwitchInvalidatesAnInFlightFlowBeforeAccountCreation() {
        var flow = service.startSignup("in-flight@example.com");
        jdbc.update("update feature_gates set enabled = false where gate_key = 'PUBLIC_SIGNUP_ENABLED'");

        assertThatThrownBy(() -> service.completeSignup(
                flow.flowId(), validRequest("in-flight@example.com", "Valid123!")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PUBLIC_SIGNUP_ENABLED");
        assertThat(count("users", "normalized_email = 'in-flight@example.com'")).isZero();
    }

    @Test
    void startingAFlowPinsVersionsAndSendsVerificationBeforeCreatingAnAccount() {
        var flow = service.startSignup("  Person@Example.COM  ");

        assertThat(flow.flowId()).isNotNull();
        assertThat(flow.acceptanceControls()).containsExactly("TERMS");
        assertThat(flow.documents().get("TERMS").documentVersion()).isEqualTo("2");
        assertThat(flow.documents().get("TERMS").bodySha256())
                .isEqualTo("50dc88e608395e505f81fb14bd1913fb2266447980e5527a87c0fd4d50c9c6ef");
        assertThat(flow.documents().get("ACCOUNT_RAG_PRIVACY").path())
                .isEqualTo("/legal/required-service-information/2");
        assertThat(flow.initialAcceptanceValues()).containsExactlyEntriesOf(
                java.util.Map.of("TERMS", false));
        assertThat(count("users", "origin = 'SIGNUP'")).isZero();
        assertThat(count("credentials", "true")).isOne(); // bootstrap credential only
        assertThat(count("auth_challenges", "purpose = 'SIGNUP_EMAIL_VERIFICATION' and user_id is null"))
                .isOne();
        assertThat(count("notification_outbox", "event_type = 'SIGNUP_EMAIL_VERIFICATION'"))
                .isOne();
        assertThat(count("refresh_tokens", "true")).isZero();
    }

    @Test
    void startingSignupWaitsForTheIdentityPrivacyLock() throws Exception {
        var identity = "privacy-lock@example.com";
        var lockKey = ByteBuffer.wrap(MessageDigest.getInstance("SHA-256")
                .digest(identity.getBytes(StandardCharsets.UTF_8))).getLong();
        try (var executor = Executors.newSingleThreadExecutor();
                var connection = jdbc.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            try (var identityLock = connection.prepareStatement(
                    "select pg_advisory_xact_lock(?)")) {
                identityLock.setLong(1, lockKey);
                identityLock.executeQuery();
            }

            var attempt = executor.submit(() -> service.startSignup(identity));
            assertThatThrownBy(() -> attempt.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            assertThat(count("signup_flows", "normalized_email = 'privacy-lock@example.com'"))
                    .isZero();
            connection.rollback();

            assertThat(attempt.get(10, TimeUnit.SECONDS).flowId()).isNotNull();
        }
    }

    @Test
    void workerRetentionPurgesExpiredRawEmailsButKeepsFreshFlows() {
        var expired = service.startSignup("expired-flow@example.com");
        var fresh = service.startSignup("fresh-flow@example.com");
        jdbc.update("update signup_flows set expires_at = now() - interval '1 second' where id = ?",
                expired.flowId());

        assertThat(service.purgeExpiredSignupFlows()).isTrue();

        assertThat(count("signup_flows", "normalized_email = 'expired-flow@example.com'")).isZero();
        assertThat(count("signup_flows", "normalized_email = 'fresh-flow@example.com'")).isOne();
        assertThat(count("auth_challenges", "purpose = 'SIGNUP_EMAIL_VERIFICATION'"))
                .isOne();
        assertThat(count("notification_outbox", "event_type = 'SIGNUP_EMAIL_VERIFICATION'"))
                .isOne();
        assertThat(service.purgeExpiredSignupFlows()).isFalse();
        assertThat(fresh.flowId()).isNotNull();
    }

    @Test
    void workerRetentionPurgesAnAbandonedPreAccountVerificationFlow() {
        var flow = service.startSignup("abandoned@example.com");
        jdbc.update("""
                update auth_challenges set expires_at = now() - interval '1 hour'
                where purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """);
        jdbc.update("update signup_flows set expires_at = now() - interval '1 hour'");

        assertThat(service.purgeExpiredSignupFlows()).isTrue();

        assertThat(count("users", "normalized_email = 'abandoned@example.com'")).isZero();
        assertThat(count("credentials", "user_id not in (select id from users)")).isZero();
        assertThat(count("auth_challenges", "purpose = 'SIGNUP_EMAIL_VERIFICATION'")).isZero();
        assertThat(count("notification_outbox", "recipient = 'abandoned@example.com'")).isZero();
        assertThat(count("consent_evidence", "true")).isZero();
        assertThat(count("questionnaire_responses", "true")).isZero();
        assertThat(count("signup_flows", "normalized_email = 'abandoned@example.com'")).isZero();
    }

    @ParameterizedTest(name = "rejects invalid password: {0}")
    @MethodSource("invalidPasswords")
    void invalidCompletionIsAtomic(String password) {
        var flow = service.startSignup("person@example.com");
        verify(flow);
        var request = validRequest("person@example.com", password);

        assertThatThrownBy(() -> service.completeSignup(flow.flowId(), request))
                .isInstanceOf(SignupValidationException.class);

        assertThat(count("users", "origin = 'SIGNUP'")).isZero();
        assertThat(count("notification_outbox", "event_type = 'SIGNUP_EMAIL_VERIFICATION'"))
                .isOne();
        assertThat(count("refresh_tokens", "true")).isZero();
    }

    @Test
    void completionRequiresEmailVerificationAndVerificationCreatesNoAccount() {
        var flow = service.startSignup("verify-first@example.com");

        assertThatThrownBy(() -> service.completeSignup(
                flow.flowId(), validRequest("verify-first@example.com", "Valid123!")))
                .isInstanceOf(SignupValidationException.class)
                .hasMessageContaining("Email verification is required");
        assertThat(count("users", "normalized_email = 'verify-first@example.com'")).isZero();

        verify(flow);

        assertThat(count("users", "normalized_email = 'verify-first@example.com'")).isZero();
        assertThat(count("signup_flows", "normalized_email = 'verify-first@example.com'"
                + " and email_verified_at is not null and completed_at is null")).isOne();
    }

    @Test
    void completionCreatesAnActiveVerifiedAccountWithoutSendingASecondMail() {
        var flow = service.startSignup("person+alias@example.com");
        verify(flow);

        service.completeSignup(flow.flowId(), validRequest(" PERSON+ALIAS@EXAMPLE.COM ", "Valid123!"));

        assertThat(count("users", "origin = 'SIGNUP' and state = 'ACTIVE' and email_verified_at is not null"))
                .isOne();
        assertThat(count("questionnaire_responses", "active")).isEqualTo(2);
        assertThat(count("consent_evidence", "accepted")).isOne();
        assertThat(count("notification_outbox", "event_type = 'SIGNUP_EMAIL_VERIFICATION'"))
                .isOne();
        assertThat(count("refresh_tokens", "true")).isZero();
    }

    @Test
    void completionPersistsServerTimeInsteadOfClientSuppliedConsentTime() {
        var flow = service.startSignup("server-consent-time@example.com");
        verify(flow);
        var valid = validRequest("server-consent-time@example.com", "Valid123!");
        var clientFuture = Instant.parse("2099-01-01T00:00:00Z");
        var request = new SignupFlowService.CompletionRequest(
                valid.email(), valid.password(), valid.preferredLanguage(), valid.ragAnswerDetail(),
                valid.age14Confirmed(),
                new SignupFlowService.Evidence(
                        valid.termsEvidence().documentId(), valid.termsEvidence().documentVersion(),
                        valid.termsEvidence().bodySha256(), clientFuture, valid.termsEvidence().path()),
                null);
        var before = Instant.now().minusSeconds(1);

        service.completeSignup(flow.flowId(), request);

        var accepted = jdbc.queryForList("""
                select accepted_at from consent_evidence
                where user_id = (select id from users where normalized_email = ?)
                order by document_code
                """, java.sql.Timestamp.class, "server-consent-time@example.com");
        var after = Instant.now().plusSeconds(1);
        assertThat(accepted).hasSize(1).allSatisfy(timestamp -> {
            assertThat(timestamp.toInstant()).isBetween(before, after);
            assertThat(timestamp.toInstant()).isNotEqualTo(clientFuture);
        });
    }

    @Test
    void completedVerifiedSignupPublishesInitialActiveAccountState() {
        var flow = service.startSignup("verified@example.com");
        verify(flow);
        service.completeSignup(flow.flowId(), validRequest("verified@example.com", "Valid123!"));

        assertThat(count("users", "origin = 'SIGNUP' and state = 'ACTIVE'")).isOne();
        assertThat(count("account_state_outbox", "state = 'ACTIVE' and account_state_version = 0"
                + " and user_id in (select id from users where origin = 'SIGNUP')"))
                .isOne();
    }

    @Test
    void signupVerificationLocksTheFlowBeforeConsumingItsChallenge() throws Exception {
        var flow = service.startSignup("verify-lock-order@example.com");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where flow_hash = digest(?, 'sha256') and purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """, codeProtector.verifier("123456"), flow.flowId().toString());

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            connection.createStatement().execute("set local lock_timeout = '500ms'");
            try (var lock = connection.prepareStatement("select id from signup_flows where id = ? for update")) {
                lock.setObject(1, flow.flowId());
                lock.executeQuery();
            }
            var verification = executor.submit(() -> service.verifyEmail(flow.flowId(), "123456"));

            assertThatThrownBy(() -> verification.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var delete = connection.prepareStatement("""
                        delete from auth_challenges
                        where flow_hash = digest(?, 'sha256') and purpose = 'SIGNUP_EMAIL_VERIFICATION'
                        """)) {
                delete.setString(1, flow.flowId().toString());
                assertThat(delete.executeUpdate()).isOne();
            }
            connection.commit();

            assertThatThrownBy(() -> verification.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(SignupValidationException.class);
        }
    }

    @Test
    void invalidSignupVerificationAttemptRemainsCommitted() {
        var flow = service.startSignup("invalid-code@example.com");

        assertThatThrownBy(() -> service.verifyEmail(flow.flowId(), "wrong-code"))
                .isInstanceOf(SignupValidationException.class);

        assertThat(jdbc.queryForObject("""
                select attempt_count from auth_challenges
                where purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """, Integer.class)).isOne();
    }

    @Test
    void resendingSignupVerificationRetiresTheObsoleteRetry() {
        var flow = service.startSignup("resend-mail@example.com");
        jdbc.update("""
                update auth_challenges set last_sent_at = now() - interval '2 minutes'
                where purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """);
        jdbc.update("""
                update notification_outbox set attempt_count = 1,
                    available_at = now() - interval '1 second',
                    last_error_code = 'SMTP_DELIVERY_FAILED'
                where event_type = 'SIGNUP_EMAIL_VERIFICATION'
                """);

        service.resendSignupVerification(flow.flowId());

        assertThat(count("notification_outbox",
                "event_type = 'SIGNUP_EMAIL_VERIFICATION' and delivered_at is null"
                        + " and attempt_count = 0 and last_error_code is null"))
                .isOne();
        assertThat(count("notification_outbox",
                "event_type = 'SIGNUP_EMAIL_VERIFICATION' and delivered_at is not null"
                        + " and last_error_code = 'CHALLENGE_SUPERSEDED'"))
                .isOne();
    }

    @Test
    void aliasAddressIsDistinctButCaseAndOuterWhitespaceAreNot() {
        var first = service.startSignup("person@example.com");
        verify(first);
        service.completeSignup(first.flowId(), validRequest("person@example.com", "Valid123!"));

        assertThatThrownBy(() -> service.startSignup(" PERSON@EXAMPLE.COM "))
                .isInstanceOf(SignupConflictException.class);
        assertThat(count("notification_outbox", "recipient = 'person@example.com'"))
                .isOne();

        var alias = service.startSignup("person+alias@example.com");
        verify(alias);
        service.completeSignup(alias.flowId(), validRequest("person+alias@example.com", "Valid123!"));
        assertThat(count("users", "origin = 'SIGNUP'")).isEqualTo(2);
    }

    @Test
    void expiredVerifiedFlowCanRestartWithoutLeavingAnUnusableAccount() {
        var first = service.startSignup("restart@example.com");
        verify(first);
        jdbc.update("""
                update signup_flows set expires_at = now() - interval '1 minute'
                where id = ?
                """, first.flowId());
        service.purgeExpiredSignupFlows();

        assertThat(count("users", "normalized_email = 'restart@example.com'"))
                .isZero();

        var replacement = service.startSignup("restart@example.com");
        verify(replacement);
        service.completeSignup(
                replacement.flowId(), validRequest("restart@example.com", "Replacement123!"));

        assertThat(count("users", "normalized_email = 'restart@example.com' and state = 'ACTIVE'"))
                .isOne();
        assertThat(count("auth_challenges", "purpose = 'SIGNUP_EMAIL_VERIFICATION'"))
                .isOne();
        assertThat(count("notification_outbox", "recipient = 'restart@example.com'"))
                .isOne();
    }

    @Test
    void legacyPendingAccountDoesNotBlockNewVerifiedFlow() {
        var staleUserId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state)
                values ('legacy-pending@example.com', 'legacy-pending@example.com',
                        'SIGNUP', 'PENDING_EMAIL_VERIFICATION')
                returning id
                """, UUID.class);
        jdbc.update("""
                insert into credentials(user_id, password_hash)
                values (?, 'stale-password-hash')
                """, staleUserId);
        jdbc.update("""
                insert into auth_challenges(
                    flow_hash, user_id, purpose, target_identity, expires_at
                ) values (
                    digest(gen_random_uuid()::text, 'sha256'), ?,
                    'SIGNUP_EMAIL_VERIFICATION', 'legacy-pending@example.com',
                    now() + interval '9 minutes'
                )
                """, staleUserId);

        var replacement = service.startSignup("legacy-pending@example.com");
        verify(replacement);
        service.completeSignup(
                replacement.flowId(),
                validRequest("legacy-pending@example.com", "Replacement123!"));

        assertThat(count("users",
                "normalized_email = 'legacy-pending@example.com' and state = 'ACTIVE'"))
                .isOne();
        assertThat(jdbc.queryForObject(
                "select count(*) from users where id = ?", Integer.class, staleUserId))
                .isZero();
    }

    @Test
    void completionLocksTheVerifiedFlowBeforeCreatingTheAccount() throws Exception {
        var flow = service.startSignup("lock-order@example.com");
        verify(flow);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var flowLock = connection.prepareStatement(
                    "select id from signup_flows where id = ? for update")) {
                flowLock.setObject(1, flow.flowId());
                flowLock.executeQuery();
            }
            var completion = executor.submit(() -> service.completeSignup(
                    flow.flowId(), validRequest("lock-order@example.com", "Valid123!")));

            assertThatThrownBy(() -> completion.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            assertThat(count("users", "normalized_email = 'lock-order@example.com'"))
                    .isZero();
            connection.commit();

            assertThat(completion.get(10, TimeUnit.SECONDS).next()).isEqualTo("LOGIN");
            assertThat(count("users", "normalized_email = 'lock-order@example.com' and state = 'ACTIVE'"))
                    .isOne();
        }
    }

    static Stream<String> invalidPasswords() {
        return Stream.of(
                "Short1!", "onlyletters!", "NoSymbol123", "Whitespace 1!",
                "Invalid123?", "한글Pass123!");
    }

    private void verify(SignupFlowService.SignupFlowView flow) {
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where flow_hash = digest(?, 'sha256')
                  and purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """, codeProtector.verifier("123456"), flow.flowId().toString());
        service.verifyEmail(flow.flowId(), "123456");
    }

    private SignupFlowService.CompletionRequest validRequest(String email, String password) {
        var now = Instant.now();
        return new SignupFlowService.CompletionRequest(
                email, password, "ko", "balanced", true,
                new SignupFlowService.Evidence(
                        "TERMS", "2",
                        "50dc88e608395e505f81fb14bd1913fb2266447980e5527a87c0fd4d50c9c6ef",
                        now, "/legal/terms/2"),
                null);
    }

    private int count(String table, String predicate) {
        return jdbc.queryForObject("select count(*) from " + table + " where " + predicate, Integer.class);
    }
}
