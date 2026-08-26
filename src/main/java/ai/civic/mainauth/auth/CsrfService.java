package ai.civic.mainauth.auth;

import java.security.MessageDigest;
import java.util.Base64;
import org.springframework.stereotype.Service;

@Service
public final class CsrfService {
    private final AuthCredentialHashing credentialHashing;

    public CsrfService(AuthCredentialHashing credentialHashing) {
        this.credentialHashing = credentialHashing;
    }

    public String issue(AuthenticatedUserService.AuthenticatedUser user) {
        requireCredential(user);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
                credentialHashing.hmac(material(user)));
    }

    public boolean matches(
            AuthenticatedUserService.AuthenticatedUser user, String suppliedToken) {
        if (user == null || suppliedToken == null || suppliedToken.isBlank()) return false;
        try {
            var expected = credentialHashing.hmac(material(user));
            var supplied = Base64.getUrlDecoder().decode(suppliedToken);
            return MessageDigest.isEqual(expected, supplied);
        } catch (IllegalArgumentException invalidEncoding) {
            return false;
        }
    }

    private static String material(AuthenticatedUserService.AuthenticatedUser user) {
        requireCredential(user);
        return "csrf-token:" + user.userId() + ":" + user.jwtId();
    }

    private static void requireCredential(AuthenticatedUserService.AuthenticatedUser user) {
        if (user == null || user.userId() == null || user.jwtId() == null || user.jwtId().isBlank()) {
            throw new AuthenticationException("Access token is invalid or expired");
        }
    }
}
