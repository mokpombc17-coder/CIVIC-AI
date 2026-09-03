package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.survey.application.consent.SurveyConsentException;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyException;
import com.hamcheeze.vote.survey.application.integration.SurveyResponseSubmittedReplayException;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyValidationException;
import com.hamcheeze.vote.survey.domain.common.SurveyViolation;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.util.List;

@RestControllerAdvice(basePackages = "com.hamcheeze.vote.survey.api")
final class SurveyApiExceptionHandler {

    @ExceptionHandler(SurveyApiException.class)
    ResponseEntity<ProblemDetail> api(
            SurveyApiException exception,
            HttpServletRequest request
    ) {
        return response(
                exception.status(), exception.code(), exception.getMessage(),
                request, List.of());
    }

    @ExceptionHandler(SurveyIdempotencyException.class)
    ResponseEntity<ProblemDetail> idempotency(
            SurveyIdempotencyException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.valueOf(exception.httpStatus()),
                exception.code().name(), exception.getMessage(),
                request, List.of());
    }

    @ExceptionHandler(SurveyConsentException.class)
    ResponseEntity<ProblemDetail> consent(
            SurveyConsentException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.valueOf(exception.httpStatus()),
                exception.code(),
                exception.getMessage(),
                request,
                List.of());
    }

    @ExceptionHandler(SurveyResponseSubmittedReplayException.class)
    ResponseEntity<ProblemDetail> replay(
            SurveyResponseSubmittedReplayException exception,
            HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.code()) {
            case SurveyResponseSubmittedReplayException.EVENT_NOT_FOUND ->
                    HttpStatus.NOT_FOUND;
            case SurveyResponseSubmittedReplayException.EVENT_TYPE_REQUIRED,
                 SurveyResponseSubmittedReplayException.DEAD_LETTER_REQUIRED ->
                    HttpStatus.CONFLICT;
            default -> HttpStatus.CONFLICT;
        };
        return response(
                status,
                exception.code(),
                exception.getMessage(),
                request,
                List.of());
    }

    @ExceptionHandler(SurveyValidationException.class)
    ResponseEntity<ProblemDetail> validation(
            SurveyValidationException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "SURVEY_RESPONSE_VALIDATION_FAILED",
                "The survey response failed validation.",
                request,
                exception.violations());
    }

    @ExceptionHandler(SurveyDomainException.class)
    ResponseEntity<ProblemDetail> domain(
            SurveyDomainException exception,
            HttpServletRequest request
    ) {
        SurveyViolation violation = exception.violation();
        HttpStatus status = violation.code().endsWith("_NOT_FOUND")
                ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT;
        return response(status, violation.code(), violation.message(),
                request, List.of(violation));
    }

    @ExceptionHandler({
            MethodArgumentNotValidException.class,
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
        return response(
                HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST",
                "The request body or parameter is invalid.",
                request,
                List.of());
    }

    private ResponseEntity<ProblemDetail> response(
            HttpStatus status,
            String code,
            String detail,
            HttpServletRequest request,
            List<SurveyViolation> violations
    ) {
        return ResponseEntity.status(status).body(
                SurveyProblemDetails.create(
                        status,
                        code,
                        detail,
                        URI.create(request.getRequestURI()),
                        false,
                        violations));
    }
}
