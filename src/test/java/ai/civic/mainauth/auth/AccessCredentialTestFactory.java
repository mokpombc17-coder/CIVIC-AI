package ai.civic.mainauth.auth;

import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public final class AccessCredentialTestFactory {
    private final CredentialIssuanceService credentialIssuance;
    private final AuthenticatedUserService authenticatedUsers;
    private final CsrfService csrf;

    public AccessCredentialTestFactory(
            CredentialIssuanceService credentialIssuance,
            AuthenticatedUserService authenticatedUsers,
            CsrfService csrf) {
        this.credentialIssuance = credentialIssuance;
        this.authenticatedUsers = authenticatedUsers;
        this.csrf = csrf;
    }

    public IssuedCredential issue(UUID userId) {
        var issued = credentialIssuance.issueForLogin(userId);
        var authenticated = authenticatedUsers.require(issued.accessToken());
        return new IssuedCredential(
                issued.accessToken(), issued.refreshToken(), csrf.issue(authenticated), authenticated);
    }

    public record IssuedCredential(
            String accessToken,
            String refreshToken,
            String csrfToken,
            AuthenticatedUserService.AuthenticatedUser user) {}
}
