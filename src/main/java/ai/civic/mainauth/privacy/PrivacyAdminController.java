package ai.civic.mainauth.privacy;

import ai.civic.mainauth.admin.AdminAuthorizationService;
import ai.civic.mainauth.auth.BrowserRequestPolicy;
import ai.civic.mainauth.auth.BrowserRequestRejectedException;
import ai.civic.mainauth.auth.CsrfService;
import ai.civic.mainauth.auth.SessionCookieFactory;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.Clock;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/privacy-operations")
public class PrivacyAdminController {
    private final AdminAuthorizationService authorization;
    private final CsrfService csrf;
    private final BrowserRequestPolicy browser;
    private final PrivacyOperatorCommand operatorCommand;
    private final PrivacyOperationService operations;
    private final Clock clock = Clock.systemUTC();

    public PrivacyAdminController(
            AdminAuthorizationService authorization,
            CsrfService csrf,
            BrowserRequestPolicy browser,
            PrivacyOperatorCommand operatorCommand,
            PrivacyOperationService operations) {
        this.authorization = authorization;
        this.csrf = csrf;
        this.browser = browser;
        this.operatorCommand = operatorCommand;
        this.operations = operations;
    }

    @PostMapping
    ResponseEntity<OperationResponse> start(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @Valid @RequestBody StartRequest body,
            HttpServletRequest request) {
        var actor = authorization.requireAdmin(sessionId, true);
        if (!csrf.matches(sessionId, csrfToken)) {
            throw new BrowserRequestRejectedException("CSRF token is invalid");
        }
        browser.requireAuthenticatedMutation(new BrowserRequestPolicy.RequestMetadata(
                request.getMethod(), request.getHeader(HttpHeaders.ORIGIN),
                request.getHeader("Sec-Fetch-Site"), request.getContentType(),
                request.getHeader(HttpHeaders.AUTHORIZATION)), csrfToken, csrfToken);
        var validated = operatorCommand.validate(new PrivacyOperatorCommand.Request(
                body.externalRequestEvidenceId(), body.subjectId(), body.scopes(), true,
                actor.absoluteExpiresAt(), false), clock.instant());
        var operationId = operations.start(
                validated.externalRequestEvidenceId(), validated.subjectId(),
                validated.scopes(), validated.operatorAuthorizationVerified());
        return ResponseEntity.accepted().body(new OperationResponse(operationId, operations.status(operationId)));
    }

    record StartRequest(
            @NotBlank String externalRequestEvidenceId,
            @NotNull UUID subjectId,
            @NotEmpty Set<@NotBlank String> scopes) {}

    record OperationResponse(UUID operationId, String status) {}
}
