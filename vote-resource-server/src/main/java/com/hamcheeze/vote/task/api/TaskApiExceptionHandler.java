package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.VoteRequestTraceId;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyException;
import com.hamcheeze.vote.task.application.result.TaskResultViewIntegrityException;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskValidationException;
import com.hamcheeze.vote.task.domain.common.TaskViolation;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.URI;
import java.util.List;

@RestControllerAdvice(basePackages = "com.hamcheeze.vote.task.api")
final class TaskApiExceptionHandler {

    @ExceptionHandler(TaskApiException.class)
    ResponseEntity<ProblemDetail> api(
            TaskApiException exception,
            HttpServletRequest request
    ) {
        return response(exception.status(), exception.code(),
                exception.getMessage(), request, false, List.of());
    }

    @ExceptionHandler(TaskIdempotencyException.class)
    ResponseEntity<ProblemDetail> idempotency(
            TaskIdempotencyException exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.valueOf(exception.httpStatus()),
                exception.code().name(), exception.getMessage(),
                request, false, List.of());
    }

    @ExceptionHandler(TaskValidationException.class)
    ResponseEntity<ProblemDetail> validation(
            TaskValidationException exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.UNPROCESSABLE_ENTITY,
                "TASK_VALIDATION_FAILED",
                "The task request failed validation.",
                request, false, exception.violations());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> beanValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        List<TaskViolation> violations = exception.getBindingResult()
                .getAllErrors()
                .stream()
                .map(error -> TaskViolation.of(
                        "TASK_FIELD_INVALID",
                        error instanceof FieldError fieldError
                                ? fieldError.getField() : "$",
                        error.getDefaultMessage() == null
                                ? "The field is invalid."
                                : error.getDefaultMessage()))
                .toList();
        return response(HttpStatus.UNPROCESSABLE_ENTITY,
                "TASK_VALIDATION_FAILED",
                "The task request failed validation.",
                request, false, violations);
    }

    @ExceptionHandler(TaskDomainException.class)
    ResponseEntity<ProblemDetail> domain(
            TaskDomainException exception,
            HttpServletRequest request
    ) {
        TaskViolation violation = exception.violation();
        return response(domainStatus(violation.code()), violation.code(),
                violation.message(), request, false, List.of(violation));
    }

    @ExceptionHandler(TaskResultViewIntegrityException.class)
    ResponseEntity<ProblemDetail> resultViewIntegrity(
            TaskResultViewIntegrityException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "TASK_RESULT_VIEW_INTEGRITY_FAILURE",
                "The finalized task result view failed verification.",
                request,
                false,
                List.of());
    }

    @ExceptionHandler({
            MissingRequestHeaderException.class,
            HandlerMethodValidationException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class,
            IllegalArgumentException.class
    })
    ResponseEntity<ProblemDetail> invalid(
            Exception exception,
            HttpServletRequest request
    ) {
        return response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
                "The request is invalid.", request, false, List.of());
    }

    static ResponseEntity<ProblemDetail> response(
            HttpStatus status,
            String code,
            String detail,
            HttpServletRequest request,
            boolean replayed,
            List<TaskViolation> violations
    ) {
        ProblemDetail problem = TaskProblemDetails.create(
                status, code, detail,
                URI.create(request.getRequestURI()), replayed, violations,
                VoteRequestTraceId.resolve(request));
        return ResponseEntity.status(status).body(problem);
    }

    private static HttpStatus domainStatus(String code) {
        if (code.equals("TASK_PREDICTION_DISABLED")) {
            return HttpStatus.SERVICE_UNAVAILABLE;
        }
        if (code.endsWith("_NOT_FOUND")) {
            return HttpStatus.NOT_FOUND;
        }
        if (code.contains("ANSWER")
                || code.contains("CANDIDATE")
                || code.contains("QUESTION")
                || code.contains("OPTION")
                || code.contains("CONSTRAINT")
                || code.contains("CONTENT")) {
            return HttpStatus.UNPROCESSABLE_ENTITY;
        }
        return HttpStatus.CONFLICT;
    }
}
