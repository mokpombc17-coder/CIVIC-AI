package com.hamcheeze.vote.persona.api;

import com.hamcheeze.vote.persona.application.PersonaGenerationRetryException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.URI;
import java.util.Locale;

@RestControllerAdvice(basePackages = "com.hamcheeze.vote.persona.api")
final class PersonaApiExceptionHandler {

    @ExceptionHandler(PersonaGenerationRetryException.class)
    ResponseEntity<ProblemDetail> retry(
            PersonaGenerationRetryException exception,
            HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.code()) {
            case PERSONA_GENERATION_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case PERSONA_GENERATION_TERMINAL_FAILURE_REQUIRED,
                 PERSONA_GENERATION_RETRY_IDEMPOTENCY_CONFLICT ->
                    HttpStatus.CONFLICT;
        };
        return response(
                status,
                exception.code().name(),
                exception.getMessage(),
                request);
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
        problem.setType(URI.create("urn:hamcheeze:problem:"
                + code.toLowerCase(Locale.ROOT).replace('_', '-')));
        problem.setTitle(code.equals("INVALID_REQUEST")
                ? "Invalid request" : "Persona retry rejected");
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", code);
        problem.setProperty("retryable", false);
        return ResponseEntity.status(status).body(problem);
    }
}
