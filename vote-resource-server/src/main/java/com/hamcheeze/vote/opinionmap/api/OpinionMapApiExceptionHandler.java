package com.hamcheeze.vote.opinionmap.api;

import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotIntegrityException;
import com.hamcheeze.vote.security.VoteRequestTraceId;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.URI;
import java.util.Locale;

@RestControllerAdvice(basePackages = "com.hamcheeze.vote.opinionmap.api")
final class OpinionMapApiExceptionHandler {

    @ExceptionHandler(OpinionMapApiException.class)
    ResponseEntity<ProblemDetail> api(
            OpinionMapApiException exception,
            HttpServletRequest request
    ) {
        return response(exception.status(), exception.code(),
                exception.getMessage(), request);
    }

    @ExceptionHandler(OpinionMapSnapshotIntegrityException.class)
    ResponseEntity<ProblemDetail> integrity(
            OpinionMapSnapshotIntegrityException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "OPINION_MAP_SNAPSHOT_INTEGRITY_FAILURE",
                "The finalized opinion map snapshot failed verification.",
                request);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ProblemDetail> invalid(
            MethodArgumentTypeMismatchException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST",
                "The request is invalid.",
                request);
    }

    private static ResponseEntity<ProblemDetail> response(
            HttpStatus status,
            String code,
            String detail,
            HttpServletRequest request
    ) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                status, detail);
        problem.setType(URI.create(
                "urn:hamcheeze:problem:"
                        + code.toLowerCase(Locale.ROOT)
                        .replace('_', '-')));
        problem.setTitle(status.getReasonPhrase());
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", code);
        problem.setProperty("retryable", false);
        problem.setProperty("traceId", VoteRequestTraceId.resolve(request));
        return ResponseEntity.status(status).body(problem);
    }
}
