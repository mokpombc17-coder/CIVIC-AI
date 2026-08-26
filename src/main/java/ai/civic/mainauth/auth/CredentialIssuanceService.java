package ai.civic.mainauth.auth;

import ai.civic.mainauth.token.AccessTokenService;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CredentialIssuanceService {
    private final AuthenticatedUserService authenticatedUsers;
    private final RefreshTokenService refreshTokens;
    private final AccessTokenService accessTokens;

    public CredentialIssuanceService(
            AuthenticatedUserService authenticatedUsers,
            RefreshTokenService refreshTokens,
            AccessTokenService accessTokens) {
        this.authenticatedUsers = authenticatedUsers;
        this.refreshTokens = refreshTokens;
        this.accessTokens = accessTokens;
    }

    @Transactional
    public IssuedCredentials issueForLogin(UUID userId) {
        var user = authenticatedUsers.currentActiveLocked(userId);
        var refresh = refreshTokens.issue(user.userId());
        return issue(user, refresh);
    }

    @Transactional(noRollbackFor = {
            AuthenticationException.class,
            RefreshTokenConflictException.class
    })
    public IssuedCredentials refresh(String rawRefreshToken) {
        var refresh = refreshTokens.rotate(rawRefreshToken);
        final AuthenticatedUserService.AuthenticatedUser user;
        try {
            user = authenticatedUsers.currentActiveLocked(refresh.userId());
        } catch (AuthenticationException accountChangedDuringRotation) {
            refreshTokens.revokeFamily(refresh.token(), "ACCOUNT_INACTIVE");
            throw accountChangedDuringRotation;
        }
        return issue(user, refresh);
    }

    private IssuedCredentials issue(
            AuthenticatedUserService.AuthenticatedUser user,
            RefreshTokenService.IssuedRefreshToken refresh) {
        var access = accessTokens.issue(
                user.email(), user.accountStateVersion(), user.permissions(), user.mustChangePassword());
        return new IssuedCredentials(
                access.token(), access.expiresAt(), refresh.token(), refresh.expiresAt());
    }

    public record IssuedCredentials(
            String accessToken,
            Instant accessExpiresAt,
            String refreshToken,
            Instant refreshExpiresAt) {}
}
