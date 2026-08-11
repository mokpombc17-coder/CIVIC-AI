package ai.civic.mainauth.signup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.stream.Stream;
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
    void startingAFlowPinsVersionsAndCreatesNoAccount() {
        var flow = service.startSignup("  Person@Example.COM  ");

        assertThat(flow.flowId()).isNotNull();
        assertThat(flow.acceptanceControls()).containsExactly("TERMS", "ACCOUNT_RAG_PRIVACY");
        assertThat(flow.initialAcceptanceValues()).containsEntry("TERMS", false)
                .containsEntry("ACCOUNT_RAG_PRIVACY", false);
        assertThat(count("users", "origin = 'SIGNUP'")).isZero();
        assertThat(count("credentials", "true")).isOne(); // bootstrap credential only
        assertThat(count("sessions", "true")).isZero();
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

    static Stream<String> invalidPasswords() {
        return Stream.of(
                "Short1!", "onlyletters!", "NoSymbol123", "Whitespace 1!",
                "Invalid123?", "한글Pass123!");
    }

    private SignupFlowService.CompletionRequest validRequest(String email, String password) {
        var now = Instant.now();
        return new SignupFlowService.CompletionRequest(
                email, password, "ko", "balanced", true,
                new SignupFlowService.Evidence("TERMS", "1", "a".repeat(64), now, "/terms"),
                new SignupFlowService.Evidence(
                        "ACCOUNT_RAG_PRIVACY", "1", "b".repeat(64), now, "/privacy"));
    }

    private int count(String table, String predicate) {
        return jdbc.queryForObject("select count(*) from " + table + " where " + predicate, Integer.class);
    }
}
