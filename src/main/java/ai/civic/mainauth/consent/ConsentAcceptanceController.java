package ai.civic.mainauth.consent;

import ai.civic.mainauth.auth.AuthCookieFactory;
import ai.civic.mainauth.auth.AuthenticatedUserService;
import ai.civic.mainauth.auth.BrowserRequestPolicy;
import ai.civic.mainauth.auth.BrowserRequestRejectedException;
import ai.civic.mainauth.auth.CsrfService;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
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
@RequestMapping("/api/v1/me/consent-acceptances")
public class ConsentAcceptanceController {
    private final AuthenticatedUserService authenticatedUsers;
    private final CsrfService csrf;
    private final BrowserRequestPolicy browser;
    private final ConsentAcceptanceService acceptances;

    public ConsentAcceptanceController(
            AuthenticatedUserService authenticatedUsers,
            CsrfService csrf,
            BrowserRequestPolicy browser,
            ConsentAcceptanceService acceptances) {
        this.authenticatedUsers = authenticatedUsers;
        this.csrf = csrf;
        this.browser = browser;
        this.acceptances = acceptances;
    }

    @PostMapping
    ResponseEntity<CreateResponse> create(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestHeader("Idempotency-Key") String rawIdempotencyKey,
            @Valid @RequestBody CreateRequest body,
            HttpServletRequest request) {
        var user = authenticatedUsers.require(accessToken);
        if (!csrf.matches(user, csrfToken)) {
            throw new BrowserRequestRejectedException("CSRF token is invalid");
        }
        browser.requireAuthenticatedMutation(new BrowserRequestPolicy.RequestMetadata(
                request.getMethod(), request.getHeader(HttpHeaders.ORIGIN),
                request.getHeader("Sec-Fetch-Site"), request.getContentType(),
                request.getHeader(HttpHeaders.AUTHORIZATION)), csrfToken, csrfToken);
        var idempotencyKey = canonicalUuid(rawIdempotencyKey);
        var receipt = acceptances.accept(user.userId(), idempotencyKey,
                new ConsentAcceptanceService.AcceptanceRequest(
                        body.documentCode(), body.documentVersion(),
                        body.roundId(), body.clientClickedAt()));
        return ResponseEntity.status(201).body(new CreateResponse(
                receipt.consentReceiptId(), receipt.acceptedAt()));
    }

    private UUID canonicalUuid(String raw) {
        try {
            var parsed = UUID.fromString(raw);
            if (!parsed.toString().equals(raw)) throw invalidIdempotencyKey();
            return parsed;
        } catch (IllegalArgumentException exception) {
            throw invalidIdempotencyKey();
        }
    }

    private ConsentAcceptanceValidationException invalidIdempotencyKey() {
        return new ConsentAcceptanceValidationException(
                "Idempotency-Key must be a canonical UUID");
    }

    record CreateRequest(
            @JsonProperty("documentCode") @NotBlank @Size(max = 64) String documentCode,
            @JsonProperty("documentVersion") @NotBlank @Size(max = 100) String documentVersion,
            @JsonProperty("roundId") @NotNull UUID roundId,
            @JsonProperty("clientClickedAt") @NotNull Instant clientClickedAt) {}

    record CreateResponse(
            @JsonProperty("consentReceiptId") UUID consentReceiptId,
            @JsonProperty("acceptedAt") Instant acceptedAt) {}
}
