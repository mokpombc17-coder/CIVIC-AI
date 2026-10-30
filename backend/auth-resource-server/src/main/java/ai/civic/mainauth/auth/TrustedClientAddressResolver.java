package ai.civic.mainauth.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class TrustedClientAddressResolver {
    public static final String CLIENT_IP_HEADER = "X-CIVIC-Client-IP";
    public static final String INTERNAL_SECRET_HEADER = "X-CIVIC-Internal-Client-Secret";
    public static final String REVERSE_PROXY_IP_HEADER = "X-Real-IP";
    private final byte[] internalSecret;
    private final List<Cidr> trustedProxies;

    @Autowired
    public TrustedClientAddressResolver(
            @Value("${civic.internal.client-secret:local-development-internal-client-secret}")
                    String internalSecret,
            @Value("${civic.trusted-proxy-cidrs:127.0.0.1/32,::1/128}")
                    String trustedProxyCidrs) {
        this.internalSecret = internalSecret.getBytes(StandardCharsets.UTF_8);
        this.trustedProxies = parseCidrs(trustedProxyCidrs);
    }

    TrustedClientAddressResolver(String internalSecret) {
        this(internalSecret, "");
    }

    public String resolve(HttpServletRequest request) {
        var remoteAddress = literalAddress(request.getRemoteAddr());
        var fallback = remoteAddress == null ? request.getRemoteAddr() : remoteAddress.getHostAddress();
        var suppliedAddress = request.getHeader(CLIENT_IP_HEADER);
        var suppliedSecret = request.getHeader(INTERNAL_SECRET_HEADER);
        if (suppliedAddress != null && suppliedSecret != null && MessageDigest.isEqual(
                internalSecret, suppliedSecret.getBytes(StandardCharsets.UTF_8))) {
            var signedAddress = literalAddress(suppliedAddress);
            return signedAddress == null ? fallback : signedAddress.getHostAddress();
        }

        if (remoteAddress != null && trustedProxies.stream().anyMatch(cidr -> cidr.matches(remoteAddress))) {
            var forwardedAddress = literalAddress(request.getHeader(REVERSE_PROXY_IP_HEADER));
            if (forwardedAddress != null) return forwardedAddress.getHostAddress();
        }
        return fallback;
    }

    private static List<Cidr> parseCidrs(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        return Arrays.stream(raw.split(","))
                .map(String::strip)
                .filter(value -> !value.isEmpty())
                .map(Cidr::parse)
                .toList();
    }

    private static InetAddress literalAddress(String raw) {
        if (raw == null || raw.isBlank()) return null;
        var value = raw.strip();
        try {
            if (value.contains(":")) {
                if (!value.matches("[0-9A-Fa-f:]+")) return null;
                var address = InetAddress.getByName(value);
                return address.getAddress().length == 16 ? address : null;
            }
            var parts = value.split("\\.", -1);
            if (parts.length != 4) return null;
            var bytes = new byte[4];
            for (var index = 0; index < parts.length; index++) {
                if (!parts[index].matches("[0-9]{1,3}")) return null;
                var part = Integer.parseInt(parts[index]);
                if (part > 255) return null;
                bytes[index] = (byte) part;
            }
            return InetAddress.getByAddress(bytes);
        } catch (Exception invalidAddress) {
            return null;
        }
    }

    private record Cidr(byte[] network, int prefixLength) {
        static Cidr parse(String raw) {
            var separator = raw.lastIndexOf('/');
            if (separator <= 0 || separator == raw.length() - 1) {
                throw new IllegalArgumentException("Trusted proxy CIDR is invalid: " + raw);
            }
            var address = literalAddress(raw.substring(0, separator));
            if (address == null) throw new IllegalArgumentException("Trusted proxy CIDR is invalid: " + raw);
            var bytes = address.getAddress();
            var prefix = Integer.parseInt(raw.substring(separator + 1));
            if (prefix < 0 || prefix > bytes.length * 8) {
                throw new IllegalArgumentException("Trusted proxy CIDR is invalid: " + raw);
            }
            return new Cidr(bytes, prefix);
        }

        boolean matches(InetAddress candidate) {
            var value = candidate.getAddress();
            if (value.length != network.length) return false;
            var fullBytes = prefixLength / 8;
            var remainingBits = prefixLength % 8;
            for (var index = 0; index < fullBytes; index++) {
                if (network[index] != value[index]) return false;
            }
            if (remainingBits == 0) return true;
            var mask = 0xff << (8 - remainingBits);
            return (Byte.toUnsignedInt(network[fullBytes]) & mask)
                    == (Byte.toUnsignedInt(value[fullBytes]) & mask);
        }
    }
}
