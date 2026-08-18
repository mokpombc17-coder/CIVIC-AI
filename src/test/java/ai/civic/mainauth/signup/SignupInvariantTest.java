package ai.civic.mainauth.signup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
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

    @BeforeEach
    void cleanSignupData() {
        jdbc.update("update feature_gates set enabled = true where gate_key = 'PUBLIC_SIGNUP_ENABLED'");
        jdbc.update("delete from account_state_outbox where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from notification_outbox");
        jdbc.update("delete from auth_challenges");
        jdbc.update("delete from consent_evidence");
        jdbc.update("delete from questionnaire_responses");
        jdbc.update("delete from signup_flows");
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
    void startingAFlowPinsVersionsAndCreatesNoAccount() {
        var flow = service.startSignup("  Person@Example.COM  ");

        assertThat(flow.flowId()).isNotNull();
        assertThat(flow.acceptanceControls()).containsExactly("TERMS", "ACCOUNT_RAG_PRIVACY");
        assertThat(flow.documents().get("TERMS").documentVersion()).isEqualTo("1");
        assertThat(flow.documents().get("TERMS").bodySha256())
                .isEqualTo("c6b86097a6d97104129a969f3669e49faa735382ffb2fbd06f93ca993cd2f076");
        assertThat(flow.documents().get("ACCOUNT_RAG_PRIVACY").path())
                .isEqualTo("/legal/account-rag-privacy/1");
        assertThat(flow.initialAcceptanceValues()).containsEntry("TERMS", false)
                .containsEntry("ACCOUNT_RAG_PRIVACY", false);
        assertThat(count("users", "origin = 'SIGNUP'")).isZero();
        assertThat(count("credentials", "true")).isOne(); // bootstrap credential only
        assertThat(count("sessions", "true")).isZero();
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
        assertThat(service.purgeExpiredSignupFlows()).isFalse();
        assertThat(fresh.flowId()).isNotNull();
    }

    @ParameterizedTest(name = "rejects invalid password: {0}")
    @MethodSource("invalidPasswords")
    void invalidCompletionIsAtomic(String password) {
        var flow = service.startSignup("person@example.com");
        var request = validRequest("person@example.com", password);

        assertThatThrownBy(() -> service.completeSignup(flow.flowId(), request))
                .isInstanceOf(SignupValidationException.class);

        assertThat(count("users", "origin = 'SIGNUP'")).isZero();
        assertThat(count("notification_outbox", "true")).isZero();
        assertThat(count("sessions", "true")).isZero();
    }

    @Test
    void completionCreatesPendingAccountCredentialEvidenceAnswersAndOneMailAtomically() {
        var flow = service.startSignup("person+alias@example.com");

        service.completeSignup(flow.flowId(), validRequest(" PERSON+ALIAS@EXAMPLE.COM ", "Valid123!"));

        assertThat(count("users", "origin = 'SIGNUP' and state = 'PENDING_EMAIL_VERIFICATION'"))
                .isOne();
        assertThat(count("questionnaire_responses", "active")).isEqualTo(2);
        assertThat(count("consent_evidence", "accepted")).isEqualTo(2);
        assertThat(count("notification_outbox", "event_type = 'SIGNUP_EMAIL_VERIFICATION'"))
                .isOne();
        assertThat(count("sessions", "true")).isZero();
    }

    @Test
    void completionPersistsServerTimeInsteadOfClientSuppliedConsentTime() {
        var flow = service.startSignup("server-consent-time@example.com");
        var valid = validRequest("server-consent-time@example.com", "Valid123!");
        var clientFuture = Instant.parse("2099-01-01T00:00:00Z");
        var request = new SignupFlowService.CompletionRequest(
                valid.email(), valid.password(), valid.preferredLanguage(), valid.ragAnswerDetail(),
                valid.age14Confirmed(),
                new SignupFlowService.Evidence(
                        valid.termsEvidence().documentId(), valid.termsEvidence().documentVersion(),
                        valid.termsEvidence().bodySha256(), clientFuture, valid.termsEvidence().path()),
                new SignupFlowService.Evidence(
                        valid.privacyEvidence().documentId(), valid.privacyEvidence().documentVersion(),
                        valid.privacyEvidence().bodySha256(), clientFuture, valid.privacyEvidence().path()));
        var before = Instant.now().minusSeconds(1);

        service.completeSignup(flow.flowId(), request);

        var accepted = jdbc.queryForList("""
                select accepted_at from consent_evidence
                where user_id = (select id from users where normalized_email = ?)
                order by document_code
                """, java.sql.Timestamp.class, "server-consent-time@example.com");
        var after = Instant.now().plusSeconds(1);
        assertThat(accepted).hasSize(2).allSatisfy(timestamp -> {
            assertThat(timestamp.toInstant()).isBetween(before, after);
            assertThat(timestamp.toInstant()).isNotEqualTo(clientFuture);
        });
    }

    @Test
    void verifiedSignupPublishesInitialActiveAccountState() throws Exception {
        var flow = service.startSignup("verified@example.com");
        service.completeSignup(flow.flowId(), validRequest("verified@example.com", "Valid123!"));
        var digest = MessageDigest.getInstance("SHA-256")
                .digest("123456".getBytes(StandardCharsets.UTF_8));
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where flow_hash is not null and purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """, digest);

        service.verifyEmail(flow.flowId(), "123456");

        assertThat(count("users", "origin = 'SIGNUP' and state = 'ACTIVE'")).isOne();
        assertThat(count("account_state_outbox", "state = 'ACTIVE' and account_state_version = 0"
                + " and user_id in (select id from users where origin = 'SIGNUP')"))
                .isOne();
    }

    @Test
    void signupVerificationLocksTheUserBeforeConsumingItsChallenge() throws Exception {
        var flow = service.startSignup("verify-lock-order@example.com");
        service.completeSignup(
                flow.flowId(), validRequest("verify-lock-order@example.com", "Valid123!"));
        var userId = jdbc.queryForObject(
                "select id from users where normalized_email = 'verify-lock-order@example.com'",
                java.util.UUID.class);
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """, MessageDigest.getInstance("SHA-256")
                        .digest("123456".getBytes(StandardCharsets.UTF_8)), userId);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            connection.createStatement().execute("set local lock_timeout = '500ms'");
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var verification = executor.submit(() -> service.verifyEmail(flow.flowId(), "123456"));

            assertThatThrownBy(() -> verification.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var delete = connection.prepareStatement("""
                        delete from auth_challenges
                        where user_id = ? and purpose = 'SIGNUP_EMAIL_VERIFICATION'
                    """)) {
                delete.setObject(1, userId);
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
        service.completeSignup(flow.flowId(), validRequest("invalid-code@example.com", "Valid123!"));

        assertThatThrownBy(() -> service.verifyEmail(flow.flowId(), "wrong-code"))
                .isInstanceOf(SignupValidationException.class);

        assertThat(jdbc.queryForObject("""
                select attempt_count from auth_challenges
                where purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """, Integer.class)).isOne();
    }

    @Test
    void aliasAddressIsDistinctButCaseAndOuterWhitespaceAreNot() {
        var first = service.startSignup("person@example.com");
        service.completeSignup(first.flowId(), validRequest("person@example.com", "Valid123!"));

        assertThatThrownBy(() -> {
            var duplicate = service.startSignup(" PERSON@EXAMPLE.COM ");
            service.completeSignup(duplicate.flowId(), validRequest("person@example.com", "Valid123!"));
        }).isInstanceOf(SignupConflictException.class);

        var alias = service.startSignup("person+alias@example.com");
        service.completeSignup(alias.flowId(), validRequest("person+alias@example.com", "Valid123!"));
        assertThat(count("users", "origin = 'SIGNUP'")).isEqualTo(2);
    }

    @Test
    void expiredPendingEmailRegistrationCanRestartWithANewFlow() {
        var first = service.startSignup("restart@example.com");
        service.completeSignup(first.flowId(), validRequest("restart@example.com", "Valid123!"));
        jdbc.update("""
                update auth_challenges set expires_at = now() - interval '1 minute'
                where purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """);

        var replacement = service.startSignup("restart@example.com");
        service.completeSignup(
                replacement.flowId(), validRequest("restart@example.com", "Replacement123!"));

        assertThat(count("users", "normalized_email = 'restart@example.com'"
                + " and state = 'PENDING_EMAIL_VERIFICATION'"))
                .isOne();
        assertThat(count("auth_challenges", "purpose = 'SIGNUP_EMAIL_VERIFICATION'"))
                .isOne();
        assertThat(count("notification_outbox", "recipient = 'restart@example.com'"))
                .isOne();
    }

    @Test
    void replacementSignupLocksThePendingUserBeforeItsFlow() throws Exception {
        var first = service.startSignup("lock-order@example.com");
        service.completeSignup(first.flowId(), validRequest("lock-order@example.com", "Valid123!"));
        jdbc.update("""
                update auth_challenges set expires_at = now() - interval '1 minute'
                where purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """);
        var pendingUserId = jdbc.queryForObject(
                "select id from users where normalized_email = 'lock-order@example.com'",
                java.util.UUID.class);
        var replacement = service.startSignup("lock-order@example.com");

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var userLock = connection.prepareStatement("select id from users where id = ? for update")) {
                userLock.setObject(1, pendingUserId);
                userLock.executeQuery();
            }
            var completion = executor.submit(() -> service.completeSignup(
                    replacement.flowId(),
                    validRequest("lock-order@example.com", "Replacement123!")));

            assertThatThrownBy(() -> completion.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var flowLock = connection.prepareStatement(
                    "select id from signup_flows where id = ? for update nowait")) {
                flowLock.setObject(1, replacement.flowId());
                assertThat(flowLock.executeQuery().next()).isTrue();
            }
            connection.commit();

            assertThat(completion.get(10, TimeUnit.SECONDS).next()).isEqualTo("EMAIL_VERIFICATION");
        }
    }

    static Stream<String> invalidPasswords() {
        return Stream.of(
                "Short1!", "onlyletters!", "NoSymbol123", "Whitespace 1!",
                "Invalid123?", "한글Pass123!");
    }

    private SignupFlowService.CompletionRequest validRequest(String email, String password) {
        var now = Instant.now();
        return new SignupFlowService.CompletionRequest(
                email, password, "ko", "balanced", true,
                new SignupFlowService.Evidence(
                        "TERMS", "1",
                        "c6b86097a6d97104129a969f3669e49faa735382ffb2fbd06f93ca993cd2f076",
                        now, "/legal/terms/1"),
                new SignupFlowService.Evidence(
                        "ACCOUNT_RAG_PRIVACY", "1",
                        "e452368f1c93ba423c16904037a9080b81822974e804afef028457c2265ac78a",
                        now, "/legal/account-rag-privacy/1"));
    }

    private int count(String table, String predicate) {
        return jdbc.queryForObject("select count(*) from " + table + " where " + predicate, Integer.class);
    }
}
