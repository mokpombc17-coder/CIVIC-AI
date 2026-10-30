package ai.civic.mainauth.token;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** A single explicitly enabled client, with no user account, cookies, or refresh credentials. */
@RestController
public final class ServiceTokenController {
    private static final int MAX_AUTHORIZATION_LENGTH = 6144;
    private static final int MAX_FORM_BYTES = 1024;
    private final AccessTokenService tokens;
    private final boolean enabled;
    private final byte[] secretDigest;

    public ServiceTokenController(
            AccessTokenService tokens,
            @Value("${civic.service-token.enabled:false}") boolean enabled,
            @Value("${civic.service-token.persona-client-secret:}") String secret) {
        this.tokens = tokens;
        this.enabled = enabled;
        if (enabled && !validSecret(secret)) {
            throw new IllegalStateException("CIVIC_PERSONA_SERVICE_CLIENT_SECRET must be a non-placeholder secret of 32 to 4096 characters when service tokens are enabled");
        }
        this.secretDigest = digest(enabled ? secret : "disabled");
    }

    @PostMapping("/api/v1/auth/service-token")
    public ResponseEntity<Map<String, Object>> issue(HttpServletRequest request) {
        if (!authenticated(request)) return error(401, "invalid_client");
        Map<String, String> form;
        try {
            if (request.getQueryString() != null
                    || request.getContentType() == null
                    || !MediaType.APPLICATION_FORM_URLENCODED.isCompatibleWith(MediaType.parseMediaType(request.getContentType()))) {
                return error(400, "invalid_request");
            }
            var bytes = request.getInputStream().readNBytes(MAX_FORM_BYTES + 1);
            if (bytes.length > MAX_FORM_BYTES) return error(400, "invalid_request");
            form = parseForm(new String(bytes, StandardCharsets.UTF_8));
        } catch (IOException | IllegalArgumentException exception) {
            return error(400, "invalid_request");
        }
        if (!form.containsKey("grant_type")) return error(400, "invalid_request");
        if (!"client_credentials".equals(form.get("grant_type"))) return error(400, "unsupported_grant_type");
        if (!AccessTokenService.PERSONA_SERVICE_SCOPE.equals(form.get("scope"))) return error(400, "invalid_scope");
        AccessTokenService.IssuedAccessToken issued;
        try {
            issued = tokens.issuePersonaServiceToken();
        } catch (IllegalStateException exception) {
            return error(500, "server_error");
        }
        return response(200).body(Map.of(
                "access_token", issued.token(),
                "token_type", "Bearer",
                "expires_in", AccessTokenService.LIFETIME.toSeconds(),
                "scope", AccessTokenService.PERSONA_SERVICE_SCOPE));
    }

    private boolean authenticated(HttpServletRequest request) {
        if (!enabled) return false;
        var headers = request.getHeaders(HttpHeaders.AUTHORIZATION);
        if (headers == null || !headers.hasMoreElements()) return false;
        var header = headers.nextElement();
        if (headers.hasMoreElements() || header.length() > MAX_AUTHORIZATION_LENGTH
                || !header.regionMatches(true, 0, "Basic ", 0, 6)) return false;
        try {
            var credentials = new String(Base64.getDecoder().decode(header.substring(6)), StandardCharsets.UTF_8);
            var separator = credentials.indexOf(':');
            if (separator < 1) return false;
            // OAuth Basic client id and password are individually form-encoded (RFC 6749 2.3.1).
            var clientId = URLDecoder.decode(credentials.substring(0, separator), StandardCharsets.UTF_8);
            var secret = URLDecoder.decode(credentials.substring(separator + 1), StandardCharsets.UTF_8);
            // Hashes have equal length even for malformed supplied secrets. Evaluate both comparisons.
            return MessageDigest.isEqual(secretDigest, digest(secret))
                    & MessageDigest.isEqual(digest(AccessTokenService.PERSONA_CLIENT_ID), digest(clientId));
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static Map<String, String> parseForm(String body) {
        var values = new HashMap<String, String>();
        for (var field : body.split("&", -1)) {
            var pair = field.split("=", 2);
            if (pair.length != 2) throw new IllegalArgumentException("Invalid form field");
            var name = URLDecoder.decode(pair[0], StandardCharsets.UTF_8);
            var value = URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
            if ((!name.equals("grant_type") && !name.equals("scope")) || values.putIfAbsent(name, value) != null) {
                throw new IllegalArgumentException("Unexpected or duplicate form field");
            }
        }
        return values;
    }

    private static boolean validSecret(String secret) {
        if (secret == null || secret.length() < 32 || secret.length() > 4096 || secret.isBlank()
                || !secret.equals(secret.strip()) || secret.chars().anyMatch(Character::isISOControl)) return false;
        var normalized = secret.toLowerCase(Locale.ROOT).replace('_', '-');
        return !normalized.contains("local-development") && !normalized.contains("change-me")
                && !normalized.contains("changeme") && !normalized.contains("placeholder")
                && !normalized.contains("replace-me") && !normalized.contains("example");
    }

    private static byte[] digest(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    private static ResponseEntity.BodyBuilder response(int status) {
        return ResponseEntity.status(status)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.PRAGMA, "no-cache");
    }

    private static ResponseEntity<Map<String, Object>> error(int status, String error) {
        var response = response(status);
        if (status == 401) response.header(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"service-token\"");
        return response.body(Map.of("error", error));
    }
}
