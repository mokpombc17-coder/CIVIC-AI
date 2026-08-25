package com.hamcheeze.chat.export;

import com.hamcheeze.chat.room.api.RoomApiInputException;
import com.hamcheeze.chat.room.api.RoomProblemDetails;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = {
        ChatExportController.class,
        ResearchChatExportController.class
})
public final class ChatExportApiExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            ChatExportApiExceptionHandler.class);

    @ExceptionHandler(ChatExportException.class)
    ResponseEntity<ProblemDetail> export(
            ChatExportException exception,
            HttpServletRequest request
    ) {
        return response(
                exception.status(),
                exception.code().name(),
                exception.getMessage(),
                exception.retryable(),
                request);
    }

    @ExceptionHandler(RoomApiInputException.class)
    ResponseEntity<ProblemDetail> roomApiInput(
            RoomApiInputException exception,
            HttpServletRequest request
    ) {
        return response(
                exception.status(),
                exception.code().name(),
                exception.getMessage(),
                false,
                request);
    }

    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            HttpMessageNotReadableException.class,
            IllegalArgumentException.class
    })
    ResponseEntity<ProblemDetail> invalidRequest(
            Exception exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.BAD_REQUEST,
                ChatExportErrorCode.INVALID_REQUEST.name(),
                "The export request is invalid",
                false,
                request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> internal(
            Exception exception,
            HttpServletRequest request
    ) {
        LOGGER.error("Unexpected chat export failure", exception);
        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                ChatExportErrorCode.INTERNAL_ERROR.name(),
                "An internal export consistency failure occurred",
                false,
                request);
    }

    private ResponseEntity<ProblemDetail> response(
            HttpStatus status,
            String code,
            String detail,
            boolean retryable,
            HttpServletRequest request
    ) {
        ProblemDetail problem = RoomProblemDetails.create(
                status,
                code,
                status.getReasonPhrase(),
                detail,
                null,
                false,
                retryable,
                URI.create(request.getRequestURI()));
        return ResponseEntity.status(status).body(problem);
    }
}
