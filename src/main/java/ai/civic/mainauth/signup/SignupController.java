package ai.civic.mainauth.signup;

import jakarta.validation.Valid;
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

    public SignupController(SignupFlowService signup) {
        this.signup = signup;
    }

    @PostMapping("/flows")
    ResponseEntity<SignupFlowService.SignupFlowView> start(@Valid @RequestBody EmailBody body) {
        var flow = signup.startSignup(body.email());
        var cookie = ResponseCookie.from(FLOW_COOKIE, flow.flowId().toString())
                .secure(true).httpOnly(true).sameSite("Strict").path("/")
                .maxAge(Duration.ofMinutes(10)).build();
        return ResponseEntity.status(201).header(HttpHeaders.SET_COOKIE, cookie.toString()).body(flow);
    }

    @PostMapping("/flows/{flowId}/complete")
    ResponseEntity<SignupFlowService.CompletionResult> complete(
            @PathVariable UUID flowId,
            @CookieValue(FLOW_COOKIE) String cookieFlow,
            @RequestBody SignupFlowService.CompletionRequest request) {
        requireMatchingFlow(flowId, cookieFlow);
        return ResponseEntity.accepted().body(signup.completeSignup(flowId, request));
    }

    @PostMapping("/verification/verify")
    ResponseEntity<Void> verify(
            @CookieValue(FLOW_COOKIE) String cookieFlow,
            @RequestBody CodeBody body) {
        signup.verifyEmail(UUID.fromString(cookieFlow), body.code());
        return ResponseEntity.noContent().build();
    }

    private void requireMatchingFlow(UUID flowId, String cookieFlow) {
        if (!flowId.toString().equals(cookieFlow)) {
            throw new SignupValidationException("Auth flow cookie does not match request flow");
        }
    }

    record EmailBody(@NotBlank @Email String email) {}
    record CodeBody(@NotBlank String code) {}
}
