package ai.civic.mainauth.admin;

import ai.civic.mainauth.auth.AuthenticatedUserService;
import org.springframework.stereotype.Service;

@Service
public class AdminAuthorizationService {
    private final AuthenticatedUserService authenticatedUsers;

    public AdminAuthorizationService(AuthenticatedUserService authenticatedUsers) {
        this.authenticatedUsers = authenticatedUsers;
    }

    public AuthenticatedUserService.AuthenticatedUser requireAdmin(
            String accessToken, boolean highestOnly) {
        return requireAdmin(authenticatedUsers.require(accessToken), highestOnly);
    }

    public AuthenticatedUserService.AuthenticatedUser requireCurrentAdmin(
            String accessToken, boolean highestOnly) {
        return requireAdmin(authenticatedUsers.requireLocked(accessToken), highestOnly);
    }

    public AuthenticatedUserService.AuthenticatedUser requireOperator(String accessToken) {
        var user = authenticatedUsers.require(accessToken);
        if (user.mustChangePassword()) {
            throw new AdminPolicyException("Administrator password rotation is required");
        }
        var operator = user.role() == AuthenticatedUserService.UserRole.ADMIN
                || user.role() == AuthenticatedUserService.UserRole.HIGHEST_ADMIN;
        if (!operator) throw new AdminPolicyException("Administrator role is required");
        return user;
    }

    private AuthenticatedUserService.AuthenticatedUser requireAdmin(
            AuthenticatedUserService.AuthenticatedUser user, boolean highestOnly) {
        if (user.mustChangePassword()) {
            throw new AdminPolicyException("Administrator password rotation is required");
        }
        var admin = user.role() == AuthenticatedUserService.UserRole.ADMIN
                || user.role() == AuthenticatedUserService.UserRole.HIGHEST_ADMIN;
        if (!admin || (highestOnly && user.role() != AuthenticatedUserService.UserRole.HIGHEST_ADMIN)) {
            throw new AdminPolicyException("Administrator role is required");
        }
        return user;
    }
}
