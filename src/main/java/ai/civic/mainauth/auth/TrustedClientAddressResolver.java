package ai.civic.mainauth.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class TrustedClientAddressResolver {
    public static final String CLIENT_IP_HEADER = "X-CIVIC-Client-IP";
    public static final String INTERNAL_SECRET_HEADER = "X-CIVIC-Internal-Client-Secret";
    private final byte[] internalSecret;

    public TrustedClientAddressResolver(
            @Value("${civic.internal.client-secret:local-development-internal-client-secret}")
                    String internalSecret) {
        this.internalSecret = internalSecret.getBytes(StandardCharsets.UTF_8);
    }

    public String resolve(HttpServletRequest request) {
        var suppliedAddress = request.getHeader(CLIENT_IP_HEADER);
        var suppliedSecret = request.getHeader(INTERNAL_SECRET_HEADER);
        if (suppliedAddress == null || suppliedSecret == null || !MessageDigest.isEqual(
                internalSecret, suppliedSecret.getBytes(StandardCharsets.UTF_8))) {
            return request.getRemoteAddr();
        }
        try {
            return InetAddress.getByName(suppliedAddress).getHostAddress();
        } catch (Exception invalidAddress) {
            return request.getRemoteAddr();
        }
    }
}
