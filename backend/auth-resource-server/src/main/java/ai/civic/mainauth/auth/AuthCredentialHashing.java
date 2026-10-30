package ai.civic.mainauth.auth;

import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class AuthCredentialHashing {
    private final byte[] hmacSecret;

    @Autowired
    public AuthCredentialHashing(
            @Value("${civic.auth.hmac-secret:local-development-auth-hmac-secret-change-me}") String secret) {
        this(secret.getBytes(StandardCharsets.UTF_8));
    }

    AuthCredentialHashing(byte[] hmacSecret) {
        if (hmacSecret.length < 32) {
            throw new IllegalArgumentException("Authentication HMAC secret must be at least 32 bytes");
        }
        this.hmacSecret = hmacSecret.clone();
    }

    public byte[] hmac(String value) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacSecret, "HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("HMAC-SHA-256 is unavailable", exception);
        }
    }

    public byte[] opaqueCompletionIdentity(String normalizedIdentity, String purpose) {
        if (normalizedIdentity == null || normalizedIdentity.isBlank()
                || purpose == null || purpose.isBlank()) {
            throw new IllegalArgumentException("Opaque completion identity inputs are required");
        }
        return hmac("opaque-completion-identity\0" + purpose + "\0" + normalizedIdentity);
    }
}
