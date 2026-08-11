package ai.civic.mainauth.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class BrowserRequestPolicy {
    private static final Set<String> MUTATION_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final Set<String> CONTENT_TYPES = Set.of(
            "application/json", "application/x-www-form-urlencoded", "multipart/form-data");
    private final String allowedOrigin;

    public BrowserRequestPolicy(@Value("${civic.browser.origin:https://localhost}") String allowedOrigin) {
        this.allowedOrigin = allowedOrigin;
    }

    public void requirePreSessionMutation(RequestMetadata request) {
        requireBrowserMutationBoundary(request);
    }

    public void requireAuthenticatedMutation(
            RequestMetadata request, String expectedCsrfToken, String suppliedCsrfToken) {
        requireBrowserMutationBoundary(request);
        if (expectedCsrfToken == null || suppliedCsrfToken == null
                || !MessageDigest.isEqual(
                        expectedCsrfToken.getBytes(StandardCharsets.UTF_8),
                        suppliedCsrfToken.getBytes(StandardCharsets.UTF_8))) {
            throw rejected("Session-bound CSRF token is missing or invalid");
        }
    }

    public void rejectPublicAuthorization(String authorization) {
        if (authorization != null && !authorization.isBlank()) {
            throw rejected("Public browser routes do not accept Authorization");
        }
    }

    private void requireBrowserMutationBoundary(RequestMetadata request) {
        if (request == null || !MUTATION_METHODS.contains(request.method())) {
            throw rejected("State changes require POST, PUT, PATCH, or DELETE");
        }
        if (!allowedOrigin.equals(request.origin())) throw rejected("Origin is not allowed");
        if (!"same-origin".equals(request.fetchSite())) throw rejected("Request is not same-origin");
        var baseType = request.contentType() == null ? "" : request.contentType().split(";", 2)[0].strip();
        if (!CONTENT_TYPES.contains(baseType)) throw rejected("Content-Type is not allowed");
        rejectPublicAuthorization(request.authorization());
    }

    private BrowserRequestRejectedException rejected(String message) {
        return new BrowserRequestRejectedException(message);
    }

    public record RequestMetadata(
            String method, String origin, String fetchSite, String contentType, String authorization) {}
}
