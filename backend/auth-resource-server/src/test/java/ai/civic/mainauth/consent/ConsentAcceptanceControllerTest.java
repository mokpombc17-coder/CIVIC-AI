package ai.civic.mainauth.consent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.auth.AccessCredentialTestFactory;
import ai.civic.mainauth.auth.AuthCookieFactory;
import ai.civic.mainauth.support.PostgresIntegrationTest;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest
@AutoConfigureMockMvc
class ConsentAcceptanceControllerTest extends PostgresIntegrationTest {
    private static final String PATH = "/api/v1/me/consent-acceptances";
    private static final String BODY = """
            {
              "documentCode":"SENSITIVE_INFORMATION_CONSENT",
              "documentVersion":"2026-09-04",
              "roundId":"00000000-0000-0000-0000-000000000001",
              "clientClickedAt":"2026-09-04T03:10:20.123Z"
            }
            """;

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccessCredentialTestFactory credentials;

    @BeforeEach
    void resetReceiptsAndPolicy() {
        jdbc.update("delete from consent_acceptances");
        jdbc.update("""
                update consent_acceptance_policies
                set active = true, deactivated_at = null
                where document_code = 'SENSITIVE_INFORMATION_CONSENT'
                  and document_version = '2026-09-04'
                """);
    }

    @Test
    void loggedInUserCreatesAnExactlyCamelCaseReceiptOwnedByTokenSubject() throws Exception {
        var credential = createCredential();

        var result = mvc.perform(validRequest(credential, UUID.randomUUID(), BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.consentReceiptId").isString())
                .andExpect(jsonPath("$.acceptedAt").isString())
                .andExpect(jsonPath("$.consent_receipt_id").doesNotExist())
                .andExpect(jsonPath("$.accepted_at").doesNotExist())
                .andReturn();

        var response = json.readTree(result.getResponse().getContentAsString());
        assertThat(response.size()).isEqualTo(2);
        assertThat(jdbc.queryForObject("""
                select user_id from consent_acceptances where consent_receipt_id = ?
                """, UUID.class, UUID.fromString(response.path("consentReceiptId").asText())))
                .isEqualTo(credential.user().userId());
    }

    @Test
    void loggedInSameOriginRequestDoesNotRequireCsrfHeader() throws Exception {
        var credential = createCredential();

        mvc.perform(post(PATH)
                        .cookie(new Cookie(
                                AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isCreated());
        assertThat(receiptCount()).isOne();
    }

    @Test
    void matchingRetryReturnsTheExactOriginalResponseAndOneRow() throws Exception {
        var credential = createCredential();
        var key = UUID.randomUUID();

        var first = mvc.perform(validRequest(credential, key, BODY))
                .andExpect(status().isCreated()).andReturn();
        var replay = mvc.perform(validRequest(credential, key, BODY))
                .andExpect(status().isCreated()).andReturn();

        assertThat(replay.getResponse().getContentAsString())
                .isEqualTo(first.getResponse().getContentAsString());
        assertThat(receiptCount()).isOne();
    }

    @Test
    void changedRequestWithTheSameKeyReturnsConflict() throws Exception {
        var credential = createCredential();
        var key = UUID.randomUUID();
        mvc.perform(validRequest(credential, key, BODY)).andExpect(status().isCreated());
        var changed = BODY.replace(
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000099");

        mvc.perform(validRequest(credential, key, changed))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(
                        "Idempotency-Key was already used for a different consent request"));
        assertThat(receiptCount()).isOne();
    }

    @Test
    void unsupportedPolicyPairReturnsBadRequestWithoutPersistence() throws Exception {
        var credential = createCredential();
        var unsupported = BODY.replace("2026-09-04", "2026-09-05");

        mvc.perform(validRequest(credential, UUID.randomUUID(), unsupported))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(
                        "Consent document code and version are not active"));
        assertThat(receiptCount()).isZero();
    }

    @Test
    void missingMalformedAndNoncanonicalIdempotencyKeysReturnBadRequest() throws Exception {
        var credential = createCredential();
        mvc.perform(authenticatedRequest(credential).content(BODY))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("https://civic.example/problems/400"))
                .andExpect(jsonPath("$.title").value("Request rejected"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value("Required request header is missing"));
        mvc.perform(authenticatedRequest(credential)
                        .header("Idempotency-Key", "not-a-uuid")
                        .content(BODY))
                .andExpect(status().isBadRequest());
        mvc.perform(authenticatedRequest(credential)
                        .header("Idempotency-Key", "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA")
                        .content(BODY))
                .andExpect(status().isBadRequest());
        assertThat(receiptCount()).isZero();
    }

    @Test
    void malformedAndInvalidBodiesReturnSanitizedProblemDetails() throws Exception {
        var credential = createCredential();

        mvc.perform(validRequest(credential, UUID.randomUUID(), "{"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("https://civic.example/problems/400"))
                .andExpect(jsonPath("$.title").value("Request rejected"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value("Request body is malformed"));

        mvc.perform(validRequest(credential, UUID.randomUUID(),
                        BODY.replace("\"documentCode\":\"SENSITIVE_INFORMATION_CONSENT\",", "")))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("https://civic.example/problems/400"))
                .andExpect(jsonPath("$.title").value("Request rejected"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value("Request body validation failed"));
        assertThat(receiptCount()).isZero();
    }

    @Test
    void unsupportedContentTypeReturnsBadRequestProblemDetails() throws Exception {
        var credential = createCredential();

        mvc.perform(post(PATH)
                        .cookie(new Cookie(
                                AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                        .header("X-CSRF-Token", credential.csrfToken())
                        .header("Idempotency-Key", UUID.randomUUID())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.TEXT_PLAIN)
                        .content(BODY))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("https://civic.example/problems/400"))
                .andExpect(jsonPath("$.title").value("Request rejected"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value("Content-Type is not allowed"));
        assertThat(receiptCount()).isZero();
    }

    @Test
    void missingLoginCookieReturnsUnauthorizedWithoutPersistence() throws Exception {
        mvc.perform(post(PATH)
                        .header("X-CSRF-Token", "invalid")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isUnauthorized());
        assertThat(receiptCount()).isZero();
    }

    @Test
    void crossSiteRequestWithoutCsrfHeaderReturnsBadRequestWithoutPersistence() throws Exception {
        var credential = createCredential();
        mvc.perform(post(PATH)
                        .cookie(new Cookie(
                                AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .header("Origin", "https://evil.example")
                        .header("Sec-Fetch-Site", "cross-site")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isBadRequest());
        assertThat(receiptCount()).isZero();
    }

    @Test
    void browserSecurityBoundariesAreIndependentlyEnforced() throws Exception {
        var credential = createCredential();
        var key = UUID.randomUUID();

        mvc.perform(boundaryRequest(
                        credential, key, "https://evil.example", "same-origin", null))
                .andExpect(status().isBadRequest());
        mvc.perform(boundaryRequest(
                        credential, key, "https://localhost", "cross-site", null))
                .andExpect(status().isBadRequest());
        mvc.perform(boundaryRequest(
                        credential, key, "https://localhost", "same-origin",
                        "Bearer rejected-on-public-route"))
                .andExpect(status().isBadRequest());
        mvc.perform(post(PATH)
                        .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, "invalid"))
                        .header("X-CSRF-Token", "invalid")
                        .header("Idempotency-Key", key)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isUnauthorized());
        assertThat(receiptCount()).isZero();
    }

    @Test
    void inactiveTokenSubjectIsRejected() throws Exception {
        var credential = createCredential();
        jdbc.update("""
                update users set state = 'DEACTIVATED', deactivated_at = now()
                where id = ?
                """, credential.user().userId());

        mvc.perform(validRequest(credential, UUID.randomUUID(), BODY))
                .andExpect(status().isUnauthorized());
        assertThat(receiptCount()).isZero();
    }

    @Test
    void snakeCaseRequestPropertiesAreRejected() throws Exception {
        var credential = createCredential();
        var snakeCase = """
                {
                  "document_code":"SENSITIVE_INFORMATION_CONSENT",
                  "document_version":"2026-09-04",
                  "round_id":"00000000-0000-0000-0000-000000000001",
                  "client_clicked_at":"2026-09-04T03:10:20.123Z"
                }
                """;

        mvc.perform(validRequest(credential, UUID.randomUUID(), snakeCase))
                .andExpect(status().isBadRequest());
        assertThat(receiptCount()).isZero();
    }

    private MockHttpServletRequestBuilder validRequest(
            AccessCredentialTestFactory.IssuedCredential credential,
            UUID idempotencyKey,
            String body) {
        return authenticatedRequest(credential)
                .header("Idempotency-Key", idempotencyKey.toString())
                .content(body);
    }

    private MockHttpServletRequestBuilder authenticatedRequest(
            AccessCredentialTestFactory.IssuedCredential credential) {
        return post(PATH)
                .cookie(new Cookie(
                        AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                .header("X-CSRF-Token", credential.csrfToken())
                .header("Origin", "https://localhost")
                .header("Sec-Fetch-Site", "same-origin")
                .contentType(MediaType.APPLICATION_JSON);
    }

    private MockHttpServletRequestBuilder boundaryRequest(
            AccessCredentialTestFactory.IssuedCredential credential,
            UUID idempotencyKey,
            String origin,
            String fetchSite,
            String authorization) {
        var request = post(PATH)
                .cookie(new Cookie(
                        AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                .header("X-CSRF-Token", credential.csrfToken())
                .header("Idempotency-Key", idempotencyKey)
                .header("Origin", origin)
                .header("Sec-Fetch-Site", fetchSite)
                .contentType(MediaType.APPLICATION_JSON)
                .content(BODY);
        if (authorization != null) request.header("Authorization", authorization);
        return request;
    }

    private AccessCredentialTestFactory.IssuedCredential createCredential() {
        var email = "consent-controller-" + UUID.randomUUID() + "@example.test";
        var userId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now())
                returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", userId);
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'PARTICIPANT'
                """, userId);
        return credentials.issue(userId);
    }

    private int receiptCount() {
        return jdbc.queryForObject("select count(*) from consent_acceptances", Integer.class);
    }
}
