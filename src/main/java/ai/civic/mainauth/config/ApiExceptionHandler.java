package ai.civic.mainauth.config;

import ai.civic.mainauth.auth.AuthenticationException;
import ai.civic.mainauth.auth.BrowserRequestRejectedException;
import ai.civic.mainauth.signup.SignupConflictException;
import ai.civic.mainauth.signup.SignupValidationException;
import ai.civic.mainauth.admin.AdminPolicyException;
import ai.civic.mainauth.admin.AdminVersionConflictException;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler({SignupValidationException.class, BrowserRequestRejectedException.class})
    ProblemDetail badRequest(RuntimeException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Request rejected", exception.getMessage());
    }

    @ExceptionHandler(AuthenticationException.class)
    ProblemDetail unauthorized(AuthenticationException exception) {
        return problem(HttpStatus.UNAUTHORIZED, "Authentication failed", exception.getMessage());
    }

    @ExceptionHandler(SignupConflictException.class)
    ProblemDetail conflict(SignupConflictException exception) {
        return problem(HttpStatus.CONFLICT, "Request conflict", exception.getMessage());
    }

    @ExceptionHandler(AdminPolicyException.class)
    ProblemDetail forbidden(AdminPolicyException exception) {
        return problem(HttpStatus.FORBIDDEN, "Operation forbidden", exception.getMessage());
    }

    @ExceptionHandler(AdminVersionConflictException.class)
    ProblemDetail versionConflict(AdminVersionConflictException exception) {
        return problem(HttpStatus.CONFLICT, "Version conflict", exception.getMessage());
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
