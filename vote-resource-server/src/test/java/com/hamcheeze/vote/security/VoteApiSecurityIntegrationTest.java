package com.hamcheeze.vote.security;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.security.local.LocalJwtProperties;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@Import({
        TestcontainersConfiguration.class,
        VoteApiSecurityIntegrationTest.TestApiController.class
})
class VoteApiSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LocalJwtProperties properties;

    @Autowired
    private VoteApiSecurityProblemWriter problemWriter;

    @Test
    void healthIsPublicAndApiRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/test/current-user"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentType(
                        MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.title")
                        .value("Authentication required"))
                .andExpect(jsonPath("$.detail")
                        .value("A valid Bearer token is required."))
                .andExpect(jsonPath("$.instance")
                        .value("/api/v1/test/current-user"));
    }

    @Test
    void authenticatesAuthorizationHeaderAndCookie() throws Exception {
        String token = validToken("user-a");

        mockMvc.perform(get("/api/v1/test/current-user")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requesterUserId")
                        .value("user-a"));

        mockMvc.perform(get("/api/v1/test/current-user")
                        .cookie(authenticationCookie(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requesterUserId")
                        .value("user-a"));
    }

    @Test
    void rejectsInvalidIssuerAudienceExpirySignatureAndSubject()
            throws Exception {
        List<String> invalidTokens = List.of(
                token(
                        properties.getSecret(),
                        "user-a",
                        "other-issuer",
                        List.of(properties.getAudience()),
                        Instant.now().plusSeconds(300)),
                token(
                        properties.getSecret(),
                        "user-a",
                        properties.getIssuer(),
                        List.of("other-service"),
                        Instant.now().plusSeconds(300)),
                token(
                        properties.getSecret(),
                        "user-a",
                        properties.getIssuer(),
                        List.of(properties.getAudience()),
                        Instant.now().minusSeconds(120)),
                token(
                        "different-local-signing-key-that-is-long-enough",
                        "user-a",
                        properties.getIssuer(),
                        List.of(properties.getAudience()),
                        Instant.now().plusSeconds(300)),
                token(
                        properties.getSecret(),
                        null,
                        properties.getIssuer(),
                        List.of(properties.getAudience()),
                        Instant.now().plusSeconds(300)),
                token(
                        properties.getSecret(),
                        " ",
                        properties.getIssuer(),
                        List.of(properties.getAudience()),
                        Instant.now().plusSeconds(300)));

        for (String invalidToken : invalidTokens) {
            mockMvc.perform(get("/api/v1/test/current-user")
                            .header(
                                    HttpHeaders.AUTHORIZATION,
                                    "Bearer " + invalidToken))
                    .andExpect(status().isUnauthorized())
                    .andExpect(content().contentType(
                            MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.code")
                            .value("UNAUTHENTICATED"));
        }
    }

    @Test
    void rejectsMalformedTokenAndConflictingHeaderAndCookie()
            throws Exception {
        mockMvc.perform(get("/api/v1/test/current-user")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer malformed-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"));

        mockMvc.perform(get("/api/v1/test/current-user")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + validToken("header-user"))
                        .cookie(authenticationCookie(
                                validToken("cookie-user"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"));
    }

    @Test
    void requesterUserIdAlwaysComesFromJwtSubject() throws Exception {
        mockMvc.perform(post("/api/v1/test/current-user")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + validToken("user-a"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"user-b\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requesterUserId")
                        .value("user-a"));
    }

    @Test
    void authorizesConfirmedUserScopesFromScopeClaim()
            throws Exception {
        mockMvc.perform(get("/api/v1/me/surveys/security-probe")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + scopedToken(
                                        "user-a",
                                        VoteScopes.SURVEYS_READ)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/me/survey-responses/security-probe")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + scopedToken(
                                        "user-a",
                                        VoteScopes
                                                .SURVEY_RESPONSES_WRITE)))
                .andExpect(status().isOk());

        String taskReadToken = scopedToken(
                "user-a",
                VoteScopes.TASKS_READ);
        mockMvc.perform(get("/api/v1/me/tasks")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + taskReadToken))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/me/tasks/task-1")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + taskReadToken))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/me/submissions")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + scopedToken(
                                        "user-a",
                                        VoteScopes.SUBMISSIONS_READ)))
                .andExpect(status().isOk());

        mockMvc.perform(post(
                        "/api/v1/me/tasks/task-1/submission")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + scopedToken(
                                        "user-a",
                                        VoteScopes.SUBMISSIONS_WRITE)))
                .andExpect(status().isOk());
    }

    @Test
    void rejectsMissingOrWrongUserScopeWithProblemDetail()
            throws Exception {
        mockMvc.perform(get("/api/v1/me/surveys/security-probe"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"));

        mockMvc.perform(get("/api/v1/me/surveys/security-probe")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + validToken("user-a")))
                .andExpect(status().isForbidden())
                .andExpect(content().contentType(
                        MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code")
                        .value("ACCESS_DENIED"));

        mockMvc.perform(get("/api/v1/me/surveys/security-probe")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + scopedToken(
                                        "user-a",
                                        VoteScopes.TASKS_READ)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("ACCESS_DENIED"));
    }

    @Test
    void allowsAuthenticatedUserOnAdminApiOnlyInLocalProfile()
            throws Exception {
        String allUserScopesToken = scopedToken(
                "user-a",
                VoteScopes.SURVEYS_READ,
                VoteScopes.SURVEY_RESPONSES_WRITE,
                VoteScopes.TASKS_READ,
                VoteScopes.SUBMISSIONS_READ,
                VoteScopes.SUBMISSIONS_WRITE);

        mockMvc.perform(get("/api/v1/admin/tasks")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + allUserScopesToken))
                .andExpect(status().isOk());
    }

    @Test
    void allowsCredentialCorsOnlyFromFrontendOrigin()
            throws Exception {
        mockMvc.perform(options("/api/v1/test/current-user")
                        .header(
                                HttpHeaders.ORIGIN,
                                "http://localhost:3000")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD,
                                "POST")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                                "content-type,idempotency-key,authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN,
                        "http://localhost:3000"))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS,
                        "true"));

        mockMvc.perform(options("/api/v1/test/current-user")
                        .header(
                                HttpHeaders.ORIGIN,
                                "http://evil.example")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD,
                                "POST"))
                .andExpect(status().isForbidden());
    }

    @Test
    void writesAccessDeniedAsProblemDetail() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/v1/admin/test");
        MockHttpServletResponse response =
                new MockHttpServletResponse();

        problemWriter.handle(
                request,
                response,
                new AccessDeniedException("denied"));

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentType())
                .isEqualTo(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        assertThat(response.getContentAsString())
                .contains("\"code\":\"ACCESS_DENIED\"")
                .contains("\"status\":403")
                .contains("\"instance\":\"/api/v1/admin/test\"");
    }

    private String validToken(String subject) throws Exception {
        return token(
                properties.getSecret(),
                subject,
                properties.getIssuer(),
                List.of(properties.getAudience()),
                Instant.now().plusSeconds(300));
    }

    private String scopedToken(
            String subject,
            String... scopes
    ) throws Exception {
        return token(
                properties.getSecret(),
                subject,
                properties.getIssuer(),
                List.of(properties.getAudience()),
                Instant.now().plusSeconds(300),
                String.join(" ", scopes));
    }

    private String token(
            String secret,
            String subject,
            String issuer,
            List<String> audience,
            Instant expiresAt
    ) throws Exception {
        return token(
                secret,
                subject,
                issuer,
                audience,
                expiresAt,
                null);
    }

    private String token(
            String secret,
            String subject,
            String issuer,
            List<String> audience,
            Instant expiresAt,
            String scope
    ) throws Exception {
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(issuer)
                .audience(audience)
                .issueTime(Date.from(Instant.now().minusSeconds(5)))
                .expirationTime(Date.from(expiresAt));
        if (subject != null) {
            claims.subject(subject);
        }
        if (scope != null) {
            claims.claim("scope", scope);
        }

        SignedJWT jwt = new SignedJWT(
                new JWSHeader(JWSAlgorithm.HS256),
                claims.build());
        jwt.sign(new MACSigner(secret.getBytes(StandardCharsets.UTF_8)));
        return jwt.serialize();
    }

    private Cookie authenticationCookie(String token) {
        return new Cookie(
                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                token);
    }

    @RestController
    static class TestApiController {

        private final AuthenticatedUserIdResolver userIdResolver;

        TestApiController(
                AuthenticatedUserIdResolver userIdResolver
        ) {
            this.userIdResolver = userIdResolver;
        }

        @GetMapping("/api/v1/test/current-user")
        Map<String, String> currentUser(Authentication authentication) {
            return Map.of(
                    "requesterUserId",
                    userIdResolver.resolve(authentication));
        }

        @PostMapping("/api/v1/test/current-user")
        Map<String, String> currentUserFromPost(
                Authentication authentication,
                @RequestBody Map<String, String> ignoredRequestBody
        ) {
            return Map.of(
                    "requesterUserId",
                    userIdResolver.resolve(authentication));
        }

        @GetMapping({
                "/api/v1/me/surveys/security-probe",
                "/api/v1/me/tasks",
                "/api/v1/me/tasks/{taskId}",
                "/api/v1/me/submissions",
                "/api/v1/admin/tasks"
        })
        Map<String, String> scopedGet() {
            return Map.of("status", "ok");
        }

        @PostMapping({
                "/api/v1/me/survey-responses/security-probe",
                "/api/v1/me/tasks/{taskId}/submission"
        })
        Map<String, String> scopedPost() {
            return Map.of("status", "ok");
        }
    }
}
