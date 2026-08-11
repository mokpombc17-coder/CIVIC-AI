package ai.civic.mainauth.privacy;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public final class PrivacyOperatorCommand {
    public Request validate(Request request, Instant now) {
        if (request == null
                || request.externalRequestEvidenceId() == null
                || request.externalRequestEvidenceId().isBlank()
                || request.subjectId() == null
                || request.scopes() == null
                || request.scopes().isEmpty()
                || !Set.of("ACCOUNT", "RAG").containsAll(request.scopes())
                || !request.operatorAuthorizationVerified()
                || request.authorizationExpiresAt() == null
                || !request.authorizationExpiresAt().isAfter(now)
                || request.directDelete()) {
            throw new IllegalArgumentException("Privacy operator authorization is invalid");
        }
        return request;
    }

    public record Request(
            String externalRequestEvidenceId,
            UUID subjectId,
            Set<String> scopes,
            boolean operatorAuthorizationVerified,
            Instant authorizationExpiresAt,
            boolean directDelete) {}
}
