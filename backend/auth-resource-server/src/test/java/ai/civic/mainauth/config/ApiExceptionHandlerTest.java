package ai.civic.mainauth.config;

import static org.assertj.core.api.Assertions.assertThat;

import ai.civic.mainauth.admin.AdminPolicyException;
import ai.civic.mainauth.admin.AdminVersionConflictException;
import ai.civic.mainauth.auth.RateLimitExceededException;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.web.bind.MissingRequestCookieException;
import static org.mockito.Mockito.mock;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void mapsAuthorizationAndVersionFailuresWithoutLeakingInternals() {
        assertThat(handler.forbidden(new AdminPolicyException("role required")).getStatus()).isEqualTo(403);
        assertThat(handler.versionConflict(new AdminVersionConflictException("stale")).getStatus()).isEqualTo(409);
        assertThat(handler.internalClientRejected(new SecurityException("secret mismatch")).getStatus()).isEqualTo(403);
        assertThat(handler.missingAuthenticationCookie(
                new MissingRequestCookieException("civic_ai_refresh_token", mock(MethodParameter.class)))
                .getStatus()).isEqualTo(401);
        assertThat(handler.rateLimited(new RateLimitExceededException()).getStatus()).isEqualTo(429);
    }
}
