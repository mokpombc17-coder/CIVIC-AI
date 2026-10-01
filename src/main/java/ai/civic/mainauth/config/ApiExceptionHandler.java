package ai.civic.mainauth.config;

import ai.civic.mainauth.auth.AccountDeactivatedException;
import ai.civic.mainauth.auth.AuthenticationException;
import ai.civic.mainauth.auth.AuthorizationException;
import ai.civic.mainauth.auth.ChallengeSendLimitException;
import ai.civic.mainauth.auth.PasswordResetAccountException;
import ai.civic.mainauth.auth.BrowserRequestRejectedException;
import ai.civic.mainauth.auth.RateLimitExceededException;
import ai.civic.mainauth.auth.RefreshTokenConflictException;
import ai.civic.mainauth.consent.ConsentAcceptanceConflictException;
import ai.civic.mainauth.consent.ConsentAcceptanceValidationException;
import ai.civic.mainauth.signup.SignupConflictException;
import ai.civic.mainauth.signup.SignupValidationException;
import ai.civic.mainauth.admin.AdminPolicyException;
import ai.civic.mainauth.admin.AdminVersionConflictException;
import ai.civic.mainauth.admin.AdminUserNotFoundException;
import ai.civic.mainauth.feature.FeatureGateDisabledException;
import ai.civic.mainauth.notification.NotificationDeliveryException;
import ai.civic.mainauth.privacy.PrivacyOperationNotFoundException;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestCookieException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler({
        SignupValidationException.class,
        BrowserRequestRejectedException.class,
        ConsentAcceptanceValidationException.class
    })
    ProblemDetail badRequest(RuntimeException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Request rejected", exception.getMessage());
    }

    @ExceptionHandler(AuthenticationException.class)
    ProblemDetail unauthorized(AuthenticationException exception) {
        var problem = problem(HttpStatus.UNAUTHORIZED, "Authentication failed", exception.getMessage());
        if (exception.code() != null) problem.setProperty("code", exception.code());
        return problem;
    }

    @ExceptionHandler(AuthorizationException.class)
    ProblemDetail forbidden(AuthorizationException exception) {
        return problem(HttpStatus.FORBIDDEN, "Operation forbidden", exception.getMessage());
    }

    @ExceptionHandler(MissingRequestCookieException.class)
    ProblemDetail missingAuthenticationCookie(MissingRequestCookieException exception) {
        return problem(HttpStatus.UNAUTHORIZED, "Authentication failed", "Authentication cookie is missing");
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    ProblemDetail missingRequiredHeader(MissingRequestHeaderException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Request rejected", "Required request header is missing");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail invalidRequestBody(MethodArgumentNotValidException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Request rejected", "Request body validation failed");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail malformedRequestBody(HttpMessageNotReadableException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Request rejected", "Request body is malformed");
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ProblemDetail unsupportedContentType(HttpMediaTypeNotSupportedException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Request rejected", "Content-Type is not allowed");
    }

    @ExceptionHandler({SignupConflictException.class, ConsentAcceptanceConflictException.class})
    ProblemDetail conflict(RuntimeException exception) {
        return problem(HttpStatus.CONFLICT, "Request conflict", exception.getMessage());
    }

    @ExceptionHandler(RefreshTokenConflictException.class)
    ProblemDetail refreshConflict(RefreshTokenConflictException exception) {
        return problem(HttpStatus.CONFLICT, "Refresh conflict", exception.getMessage());
    }

    @ExceptionHandler({PrivacyOperationNotFoundException.class, AdminUserNotFoundException.class})
    ProblemDetail notFound(RuntimeException exception) {
        return problem(HttpStatus.NOT_FOUND, "Resource not found", exception.getMessage());
    }

    @ExceptionHandler(AdminPolicyException.class)
    ProblemDetail forbidden(AdminPolicyException exception) {
        return problem(HttpStatus.FORBIDDEN, "Operation forbidden", exception.getMessage());
    }

    @ExceptionHandler(AdminVersionConflictException.class)
    ProblemDetail versionConflict(AdminVersionConflictException exception) {
        return problem(HttpStatus.CONFLICT, "Version conflict", exception.getMessage());
    }

    @ExceptionHandler(FeatureGateDisabledException.class)
    ProblemDetail unavailable(FeatureGateDisabledException exception) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Feature unavailable", exception.getMessage());
    }

    @ExceptionHandler(NotificationDeliveryException.class)
    ProblemDetail notificationUnavailable(NotificationDeliveryException exception) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Notification unavailable", exception.getMessage());
    }

    @ExceptionHandler(RateLimitExceededException.class)
    ProblemDetail rateLimited(RateLimitExceededException exception) {
        return problem(HttpStatus.TOO_MANY_REQUESTS, "Request rate limited", exception.getMessage());
    }

    @ExceptionHandler(PasswordResetAccountException.class)
    ProblemDetail passwordResetAccount(PasswordResetAccountException exception) {
        var problem = problem(HttpStatus.NOT_FOUND, "Account not found", exception.getMessage());
        problem.setProperty("code", exception.code());
        return problem;
    }

    @ExceptionHandler(AccountDeactivatedException.class)
    ProblemDetail accountDeactivated(AccountDeactivatedException exception) {
        var problem = problem(HttpStatus.FORBIDDEN, "Account deactivated", exception.getMessage());
        problem.setProperty("code", "ACCOUNT_DEACTIVATED");
        problem.setProperty("account_state", "INACTIVE");
        return problem;
    }

    @ExceptionHandler(ChallengeSendLimitException.class)
    ResponseEntity<ProblemDetail> challengeSendLimited(ChallengeSendLimitException exception) {
        var problem = problem(HttpStatus.TOO_MANY_REQUESTS, "Request rate limited", exception.getMessage());
        problem.setProperty("code", exception.code());
        problem.setProperty("retry_at", exception.retryAt().toString());
        var retryAfter = Math.max(1, Duration.between(Instant.now(), exception.retryAt()).toSeconds());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfter))
                .body(problem);
    }

    @ExceptionHandler(SecurityException.class)
    ProblemDetail internalClientRejected(SecurityException exception) {
        return problem(HttpStatus.FORBIDDEN, "Operation forbidden", "Internal request authentication failed");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail invalidArgument(IllegalArgumentException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Request rejected", exception.getMessage());
    }

    private ProblemDetail problem(HttpStatus status, String title, String detail) {
        var problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setType(URI.create("https://civic.example/problems/" + status.value()));
        return problem;
    }
}
