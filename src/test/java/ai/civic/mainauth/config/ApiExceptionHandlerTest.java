package ai.civic.mainauth.config;

import static org.assertj.core.api.Assertions.assertThat;

import ai.civic.mainauth.admin.AdminPolicyException;
import ai.civic.mainauth.admin.AdminVersionConflictException;
import org.junit.jupiter.api.Test;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void mapsAuthorizationAndVersionFailuresWithoutLeakingInternals() {
        assertThat(handler.forbidden(new AdminPolicyException("role required")).getStatus()).isEqualTo(403);
        assertThat(handler.versionConflict(new AdminVersionConflictException("stale")).getStatus()).isEqualTo(409);
        assertThat(handler.internalClientRejected(new SecurityException("secret mismatch")).getStatus()).isEqualTo(403);
    }
}
