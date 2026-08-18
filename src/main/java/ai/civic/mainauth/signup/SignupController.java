package ai.civic.mainauth.signup;

import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import ai.civic.mainauth.auth.BrowserRequestPolicy;
import ai.civic.mainauth.auth.SessionCookieFactory;
import ai.civic.mainauth.auth.PreSessionRateLimitService;
import ai.civic.mainauth.auth.TrustedClientAddressResolver;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/signup")
public class SignupController {
    public static final String FLOW_COOKIE = "__Host-civic-auth-flow";
    private final SignupFlowService signup;
    private final BrowserRequestPolicy browserPolicy;
    private final SessionCookieFactory cookies;
    private final PreSessionRateLimitService preSessionRateLimits;
    private final TrustedClientAddressResolver clientAddresses;

    public SignupController(
            SignupFlowService signup,
            BrowserRequestPolicy browserPolicy,
            SessionCookieFactory cookies,
            PreSessionRateLimitService preSessionRateLimits,
            TrustedClientAddressResolver clientAddresses) {
        this.signup = signup;
        this.browserPolicy = browserPolicy;
        this.cookies = cookies;
        this.preSessionRateLimits = preSessionRateLimits;
        this.clientAddresses = clientAddresses;
    }

    @PostMapping("/flows")
    ResponseEntity<SignupFlowResponse> start(
            @Valid @RequestBody EmailBody body, HttpServletRequest request) {
        requirePreSession(request);
        rateLimit(request, body.email());
        var flow = signup.startSignup(body.email());
        var cookie = ResponseCookie.from(FLOW_COOKIE, flow.flowId().toString())
                .secure(true).httpOnly(true).sameSite("Strict").path("/")
                .maxAge(Duration.ofMinutes(10)).build();
        return ResponseEntity.status(201).header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new SignupFlowResponse(
                        flow.flowId(), flow.expiresAt(), flow.questionnaireVersion(),
                        flow.documentVersions(), flow.documents(), flow.acceptanceControls()));
    }

    @PostMapping("/flows/{flowId}/complete")
    ResponseEntity<SignupFlowService.CompletionResult> complete(
            @PathVariable UUID flowId,
            @CookieValue(FLOW_COOKIE) String cookieFlow,
            @RequestBody SignupFlowService.CompletionRequest body,
            HttpServletRequest request) {
        requirePreSession(request);
        requireMatchingFlow(flowId, cookieFlow);
        rateLimit(request, cookieFlow);
        return ResponseEntity.accepted().body(signup.completeSignup(flowId, body));
    }

    @PostMapping("/verification/verify")
    ResponseEntity<Void> verify(
            @CookieValue(FLOW_COOKIE) String cookieFlow,
            @Valid @RequestBody CodeBody body,
            HttpServletRequest request) {
        requirePreSession(request);
        rateLimit(request, cookieFlow);
        signup.verifyEmail(UUID.fromString(cookieFlow), body.code());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString()).build();
    }

    @PostMapping("/verification/resend")
    ResponseEntity<Void> resend(
            @CookieValue(FLOW_COOKIE) String cookieFlow, HttpServletRequest request) {
        requirePreSession(request);
        rateLimit(request, cookieFlow);
        signup.resendSignupVerification(UUID.fromString(cookieFlow));
        return ResponseEntity.accepted().build();
    }

    private void requireMatchingFlow(UUID flowId, String cookieFlow) {
        if (!flowId.toString().equals(cookieFlow)) {
            throw new SignupValidationException("Auth flow cookie does not match request flow");
        }
    }

    private void requirePreSession(HttpServletRequest request) {
        browserPolicy.requirePreSessionMutation(new BrowserRequestPolicy.RequestMetadata(
                request.getMethod(), request.getHeader(HttpHeaders.ORIGIN),
                request.getHeader("Sec-Fetch-Site"), request.getContentType(),
                request.getHeader(HttpHeaders.AUTHORIZATION)));
    }

    private void rateLimit(HttpServletRequest request, String identity) {
        preSessionRateLimits.checkAndRecord(identity, clientAddresses.resolve(request));
    }

    record EmailBody(@NotBlank @Email String email) {}
    record CodeBody(@NotBlank String code) {}
    record SignupFlowResponse(
            UUID flowId,
            java.time.Instant expiresAt,
            String questionnaireVersion,
            Map<String, String> documentVersions,
            Map<String, SignupFlowService.SignupDocumentView> documents,
            java.util.List<String> acceptanceControls) {}
}
