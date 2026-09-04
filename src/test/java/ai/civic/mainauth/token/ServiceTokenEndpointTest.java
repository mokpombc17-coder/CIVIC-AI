package ai.civic.mainauth.token;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jwt.SignedJWT;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

class ServiceTokenEndpointTest {
    private static final String SECRET = "test-credential-6d2b71a891e84613bce305272e";
    private static final String FORM = "grant_type=client_credentials&scope=vote%3Atasks%3Aadmin";
    private AnnotationConfigWebApplicationContext context;
    private MockMvc mvc;

    @TestConfiguration
    @EnableWebMvc
    @ComponentScan(basePackageClasses = AccessTokenService.class)
    static class TokenConfiguration {}

    @AfterEach
    void close() {
        if (context != null) context.close();
    }

    private void start(boolean enabled, String secret) {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test", Map.of(
                "civic.service-token.enabled", enabled,
                "civic.service-token.persona-client-secret", secret,
                "civic.issuer", "https://auth.civic.example")));
        context.register(TokenConfiguration.class);
        context.refresh();
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    @Test
    void clientCredentialsIssueOnlyTheBoundedScopeWithVoteCompatibleSignedClaims() throws Exception {
        start(true, SECRET);
        var response = mvc.perform(post("/api/v1/auth/service-token")
                        .contentType("application/x-www-form-urlencoded")
                        .header("Authorization", basic("individual-persona-runtime", SECRET)).content(FORM))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Pragma", "no-cache"))
                .andExpect(header().doesNotExist("Set-Cookie"))
                .andExpect(jsonPath("token_type").value("Bearer"))
                .andExpect(jsonPath("expires_in").value(900))
                .andExpect(jsonPath("scope").value("vote:tasks:admin"))
                .andExpect(jsonPath("refresh_token").doesNotExist())
                .andReturn().getResponse();
        var payload = new ObjectMapper().readTree(response.getContentAsString());
        var jwt = SignedJWT.parse(payload.get("access_token").asText());
        var claims = jwt.getJWTClaimsSet();
        var key = context.getBean(Rs256KeyRing.class).verificationKey(jwt.getHeader().getKeyID());
        assertThat(jwt.verify(new RSASSAVerifier(key.toRSAPublicKey()))).isTrue();
        assertThat(jwt.getHeader().getAlgorithm().getName()).isEqualTo("RS256");
        assertThat(jwt.getHeader().getType().toString()).isEqualTo("JWT");
        assertThat(claims.getIssuer()).isEqualTo("https://auth.civic.example");
        assertThat(jwt.getPayload().toJSONObject().get("aud")).isEqualTo(List.of("civic-ai-api"));
        assertThat(claims.getSubject()).isEqualTo("d2e3c201-7b81-4c94-a832-88acbe72b106");
        assertThat(UUID.fromString(claims.getJWTID()).toString()).isEqualTo(claims.getJWTID());
        assertThat(claims.getStringClaim("email")).isEqualTo("individual-persona-runtime@services.civic.invalid");
        assertThat(claims.getLongClaim("account_state_version")).isZero();
        assertThat(claims.getBooleanClaim("must_change_password")).isFalse();
        assertThat(claims.getStringClaim("token_use")).isEqualTo("service");
        assertThat(claims.getStringClaim("client_id")).isEqualTo("individual-persona-runtime");
        assertThat(claims.getStringClaim("scope")).isEqualTo("vote:tasks:admin");
        assertThat(claims.getClaims()).doesNotContainKeys("permissions", "roles", "user_id", "refresh_token");
        assertThat(claims.getExpirationTime().getTime() - claims.getIssueTime().getTime()).isEqualTo(900_000);
        var second = mvc.perform(post("/api/v1/auth/service-token")
                        .contentType("application/x-www-form-urlencoded")
                        .header("Authorization", basic("individual-persona-runtime", SECRET)).content(FORM))
                .andReturn().getResponse();
        var secondJwt = SignedJWT.parse(new ObjectMapper().readTree(second.getContentAsString()).get("access_token").asText());
        assertThat(secondJwt.getJWTClaimsSet().getSubject()).isEqualTo(claims.getSubject());
        assertThat(secondJwt.getJWTClaimsSet().getJWTID()).isNotEqualTo(claims.getJWTID());
    }

    @Test
    void invalidAndOversizedClientAuthenticationAlwaysFailsWithoutCookiesOrCache() throws Exception {
        start(true, SECRET);
        for (var auth : List.of("", "Bearer existing-human-token", "Basic !!!", "Basic " + "a".repeat(5000),
                basic("unknown-client", SECRET), basic("individual-persona-runtime", "wrong-secret"),
                basic("individual-persona-runtime", ""))) {
            mvc.perform(post("/api/v1/auth/service-token").contentType("application/x-www-form-urlencoded")
                            .header("Authorization", auth).content(FORM))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("error").value("invalid_client"))
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(header().string("WWW-Authenticate", "Basic realm=\"service-token\""))
                    .andExpect(header().doesNotExist("Set-Cookie"));
        }
        mvc.perform(post("/api/v1/auth/service-token").contentType("application/x-www-form-urlencoded").content(FORM))
                .andExpect(status().isUnauthorized()).andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void rejectsUnsupportedGrantUnauthorizedScopeAndMalformedOrAmbiguousRequests() throws Exception {
        start(true, SECRET);
        for (var entry : Map.of(
                "grant_type=password&scope=vote:tasks:admin", "unsupported_grant_type",
                "scope=vote:tasks:admin", "invalid_request",
                "grant_type=client_credentials", "invalid_scope",
                "grant_type=client_credentials&scope=vote:tasks:read", "invalid_scope",
                "grant_type=client_credentials&scope=vote:tasks:admin+rag:documents:write", "invalid_scope",
                FORM + "&scope=vote:tasks:admin", "invalid_request",
                FORM + "&client_secret=body-secret", "invalid_request",
                "grant_type=client_credentials&scope=%xx", "invalid_request",
                "x=" + "a".repeat(5000), "invalid_request").entrySet()) {
            mvc.perform(post("/api/v1/auth/service-token").contentType("application/x-www-form-urlencoded")
                            .header("Authorization", basic("individual-persona-runtime", SECRET)).content(entry.getKey()))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("error").value(entry.getValue()))
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(header().doesNotExist("Set-Cookie"));
        }
        mvc.perform(post("/api/v1/auth/service-token?scope=vote:tasks:admin")
                        .contentType("application/x-www-form-urlencoded")
                        .header("Authorization", basic("individual-persona-runtime", SECRET)).content(FORM))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("error").value("invalid_request"));
        mvc.perform(post("/api/v1/auth/service-token").contentType("application/json")
                        .header("Authorization", basic("individual-persona-runtime", SECRET)).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(post("/api/v1/auth/service-token").contentType("application/x-www-form-urlencoded")
                        .header("Authorization", basic("individual-persona-runtime", SECRET), basic("individual-persona-runtime", SECRET))
                        .content(FORM))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void signerFailureReturnsAnUncacheableErrorWithoutLeakingInternalDetails() throws Exception {
        var unavailableSigner = mock(AccessTokenService.class);
        when(unavailableSigner.issuePersonaServiceToken()).thenThrow(new IllegalStateException("private signing failure details"));
        var endpoint = MockMvcBuilders.standaloneSetup(new ServiceTokenController(unavailableSigner, true, SECRET)).build();
        assertThatCode(() -> endpoint.perform(post("/api/v1/auth/service-token")
                        .contentType("application/x-www-form-urlencoded")
                        .header("Authorization", basic("individual-persona-runtime", SECRET)).content(FORM))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("error").value("server_error"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().doesNotExist("Set-Cookie"))
                .andExpect(content().json("{\"error\":\"server_error\"}", org.springframework.test.json.JsonCompareMode.STRICT)))
                .doesNotThrowAnyException();
    }

    @Test
    void disabledFeatureCannotIssueEvenWithAValidCredential() throws Exception {
        start(false, SECRET);
        mvc.perform(post("/api/v1/auth/service-token").contentType("application/x-www-form-urlencoded")
                        .header("Authorization", basic("individual-persona-runtime", SECRET)).content(FORM))
                .andExpect(status().isUnauthorized()).andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void noCredentialIsSafeWhenDisabledAndFailsStartupWhenEnabled() throws Exception {
        start(false, "");
        mvc.perform(post("/api/v1/auth/service-token").contentType("application/x-www-form-urlencoded")
                        .header("Authorization", basic("individual-persona-runtime", "")).content(FORM))
                .andExpect(status().isUnauthorized());
        context.close();
        for (var secret : List.of("", "short", "local-development-persona-client-secret", "change-me-".repeat(6),
                "placeholder-".repeat(4), "x".repeat(4097))) {
            assertThatThrownBy(() -> start(true, secret)).hasRootCauseInstanceOf(IllegalStateException.class);
            context.close();
        }
    }

    private static String basic(String client, String secret) {
        return "Basic " + Base64.getEncoder().encodeToString((client + ":" + secret).getBytes(StandardCharsets.UTF_8));
    }
}
