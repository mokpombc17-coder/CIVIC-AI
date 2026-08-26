package ai.civic.mainauth;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ControllerSurfaceTest {
    @Test
    void accountAdminAndRefreshControllersCoverTheContractWithoutForbiddenRoutes() throws Exception {
        var account = source("account/AccountController.java");
        assertThat(account).contains(
                "@GetMapping(\"/profile\")", "@PatchMapping(\"/profile\")",
                "@PutMapping(\"/password\")", "@PostMapping(\"/2fa/enable\")",
                "@PostMapping(\"/2fa/disable\")", "@PostMapping(\"/deactivate\")");

        var admin = source("admin/AdminUserController.java");
        assertThat(admin).contains("@GetMapping", "@PutMapping(\"/{userId}/roles\")", "/api/v1/admin/users");
        assertThat(admin).doesNotContain("deactivateUser", "deleteUser");

        var auth = source("auth/AuthController.java");
        assertThat(auth).contains(
                "@PostMapping(\"/refresh\")", "RefreshTokenService",
                "@GetMapping(\"/me\")", "AuthCookieFactory.ACCESS_TOKEN_COOKIE",
                "AuthCookieFactory.REFRESH_TOKEN_COOKIE");
        assertThat(auth).doesNotContain(
                "@GetMapping(\"/session\")", "@PostMapping(\"/access-token\")",
                "SessionService", "SessionCookieFactory");
        assertThat(Files.exists(Path.of(
                "src/main/java/ai/civic/mainauth/token/InternalTokenController.java"))).isFalse();

        var gates = source("feature/FeatureGateController.java");
        assertThat(gates).doesNotContain("@PostMapping", "@PutMapping", "@PatchMapping", "@DeleteMapping");
    }

    private String source(String relative) throws Exception {
        return Files.readString(Path.of("src/main/java/ai/civic/mainauth").resolve(relative));
    }
}
