package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.message.api.ChatMessageQueryController;
import com.hamcheeze.chat.message.query.ChatMessageHistoryErrorCode;
import com.hamcheeze.chat.message.query.ChatMessageHistoryException;
import com.hamcheeze.chat.message.search.ChatMessageSearchErrorCode;
import com.hamcheeze.chat.message.search.ChatMessageSearchException;
import com.hamcheeze.chat.room.api.dto.FieldErrorResponse;
import com.hamcheeze.chat.room.application.idempotency.RoomClientRequestId;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.query.RoomQueryErrorCode;
import com.hamcheeze.chat.room.query.RoomQueryException;
import com.hamcheeze.chat.room.inbox.RoomInboxErrorCode;
import com.hamcheeze.chat.room.inbox.RoomInboxException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.URI;
import java.util.List;

@RestControllerAdvice(basePackageClasses = {
        RoomCommandController.class,
        RoomQueryController.class,
        ChatMessageQueryController.class
})
public class RoomApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(
            RoomApiExceptionHandler.class);

    @ExceptionHandler(RoomApiInputException.class)
    ResponseEntity<ProblemDetail> input(
            RoomApiInputException exception,
            HttpServletRequest request
    ) {
        return problem(
                exception.status(),
                exception.code().name(),
                "Invalid room API request",
                exception.getMessage(),
                request,
                false,
                null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> validation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        List<FieldErrorResponse> fieldErrors =
                exception.getBindingResult()
                        .getFieldErrors()
                        .stream()
                        .map(error -> new FieldErrorResponse(
                                error.getField(),
                                error.getDefaultMessage()))
                        .toList();
        return problem(
                HttpStatus.BAD_REQUEST,
                RoomApiErrorCode.INVALID_REQUEST.name(),
                "Invalid room API request",
                "The request body is invalid.",
                request,
                false,
                fieldErrors);
    }

    @ExceptionHandler({
            HandlerMethodValidationException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class
    })
    ResponseEntity<ProblemDetail> malformed(
            Exception exception,
            HttpServletRequest request
    ) {
        return problem(
                HttpStatus.BAD_REQUEST,
                RoomApiErrorCode.INVALID_REQUEST.name(),
                "Invalid room API request",
                "The request could not be parsed.",
                request,
                false,
                null);
    }

    @ExceptionHandler(RoomQueryException.class)
    ResponseEntity<ProblemDetail> query(
            RoomQueryException exception,
            HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.code()) {
            case ROOM_NOT_FOUND, MEMBERSHIP_NOT_FOUND ->
                    HttpStatus.NOT_FOUND;
            case ACCESS_DENIED, NOT_ROOM_OWNER ->
                    HttpStatus.FORBIDDEN;
            case INVALID_CURSOR -> HttpStatus.BAD_REQUEST;
        };
        return problem(
                status,
                exception.code().name(),
                "Room query failed",
                queryDetail(exception.code()),
                request,
                false,
                null);
    }

    @ExceptionHandler(ChatMessageHistoryException.class)
    ResponseEntity<ProblemDetail> messageHistory(
            ChatMessageHistoryException exception,
            HttpServletRequest request
    ) {
        HttpStatus status =
                exception.code()
                        == ChatMessageHistoryErrorCode.ACCESS_DENIED
                        ? HttpStatus.FORBIDDEN
                        : HttpStatus.SERVICE_UNAVAILABLE;
        boolean retryable = status
                == HttpStatus.SERVICE_UNAVAILABLE;
        String detail = switch (exception.code()) {
            case ACCESS_DENIED ->
                    "Only an active room member may read messages.";
            case AUTHORIZATION_UNAVAILABLE ->
                    "Room authorization is temporarily unavailable.";
            case MESSAGE_HISTORY_UNAVAILABLE ->
                    "Message history is temporarily unavailable.";
        };
        return problem(
                status,
                exception.code().name(),
                "Message history query failed",
                detail,
                request,
                retryable,
                null);
    }

    @ExceptionHandler(ChatMessageSearchException.class)
    ResponseEntity<ProblemDetail> messageSearch(
            ChatMessageSearchException exception,
            HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.code()) {
            case INVALID_CURSOR -> HttpStatus.BAD_REQUEST;
            case ACCESS_DENIED -> HttpStatus.FORBIDDEN;
            case MESSAGE_SEARCH_NOT_AVAILABLE -> HttpStatus.CONFLICT;
            case MESSAGE_SEARCH_RATE_LIMITED ->
                    HttpStatus.TOO_MANY_REQUESTS;
            case MESSAGE_SEARCH_UNAVAILABLE ->
                    HttpStatus.SERVICE_UNAVAILABLE;
            case INTERNAL_ERROR -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        boolean retryable = exception.code()
                == ChatMessageSearchErrorCode.MESSAGE_SEARCH_RATE_LIMITED
                || exception.code()
                == ChatMessageSearchErrorCode.MESSAGE_SEARCH_UNAVAILABLE;
        if (exception.code() == ChatMessageSearchErrorCode.INTERNAL_ERROR) {
            log.error("Message search consistency failure", exception);
        }
        return problem(
                status,
                exception.code().name(),
                "Message search failed",
                messageSearchDetail(exception.code()),
                request,
                retryable,
                null);
    }

    @ExceptionHandler(RoomInboxException.class)
    ResponseEntity<ProblemDetail> roomInbox(
            RoomInboxException exception,
            HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.code()) {
            case ACCESS_DENIED -> HttpStatus.FORBIDDEN;
            case READ_STATE_NOT_AVAILABLE,
                    READ_SEQUENCE_AHEAD -> HttpStatus.CONFLICT;
            case READ_STATE_INCONSISTENT ->
                    HttpStatus.INTERNAL_SERVER_ERROR;
            case ROOM_INBOX_SUMMARY_INCONSISTENT ->
                    HttpStatus.INTERNAL_SERVER_ERROR;
            case ROOM_INBOX_UNAVAILABLE ->
                    HttpStatus.SERVICE_UNAVAILABLE;
        };
        String detail = switch (exception.code()) {
            case ACCESS_DENIED ->
                    "An active room membership is required.";
            case READ_STATE_NOT_AVAILABLE ->
                    "Read state is not available for this room.";
            case READ_SEQUENCE_AHEAD ->
                    "The requested read sequence is ahead of the room.";
            case READ_STATE_INCONSISTENT ->
                    "The persisted read state is inconsistent.";
            case ROOM_INBOX_SUMMARY_INCONSISTENT ->
                    "The Room inbox summary is inconsistent.";
            case ROOM_INBOX_UNAVAILABLE ->
                    "The room inbox is temporarily unavailable.";
        };
        return problem(
                status,
                exception.code().name(),
                "Room inbox request failed",
                detail,
                request,
                exception.code()
                        == RoomInboxErrorCode.ROOM_INBOX_UNAVAILABLE,
                null);
    }

    @ExceptionHandler(RoomCommandExecutionException.class)
    ResponseEntity<ProblemDetail> commandFailure(
            RoomCommandExecutionException exception,
            HttpServletRequest request
    ) {
        log.error(
                "Room command infrastructure failure: kind={}",
                exception.kind(),
                exception);
        HttpStatus status = exception.retryable()
                ? HttpStatus.SERVICE_UNAVAILABLE
                : HttpStatus.INTERNAL_SERVER_ERROR;
        String detail = exception.kind()
                == RoomCommandFailureKind.OUTCOME_UNKNOWN
                ? "The command outcome is unknown. Retry the same "
                + "request with the same Idempotency-Key."
                : exception.retryable()
                ? "The command could not be completed. "
                + "Retry with the same Idempotency-Key."
                : "The command could not be completed.";
        return problem(
                status,
                exception.kind().name(),
                "Room command failed",
                detail,
                request,
                exception.retryable(),
                null);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> unexpected(
            Exception exception,
            HttpServletRequest request
    ) {
        log.error("Unexpected Room API failure", exception);
        return problem(
                HttpStatus.INTERNAL_SERVER_ERROR,
                RoomApiErrorCode.INTERNAL_ERROR.name(),
                "Internal server error",
                "The request could not be completed.",
                request,
                false,
                null);
    }

    private ResponseEntity<ProblemDetail> problem(
            HttpStatus status,
            String code,
            String title,
            String detail,
            HttpServletRequest request,
            boolean retryable,
            List<FieldErrorResponse> fieldErrors
    ) {
        ProblemDetail problem = RoomProblemDetails.create(
                status,
                code,
                title,
                detail,
                clientRequestId(request),
                false,
                retryable,
                URI.create(request.getRequestURI()));
        if (fieldErrors != null) {
            problem.setProperty("fieldErrors", fieldErrors);
        }
        return ResponseEntity.status(status).body(problem);
    }

    private String clientRequestId(HttpServletRequest request) {
        String value = request.getHeader(
                RoomIdempotencyKeyResolver.HEADER_NAME);
        try {
            return value == null
                    ? null
                    : RoomClientRequestId.canonicalize(value);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private String queryDetail(RoomQueryErrorCode code) {
        return switch (code) {
            case ROOM_NOT_FOUND -> "The room was not found.";
            case MEMBERSHIP_NOT_FOUND ->
                    "The membership was not found.";
            case ACCESS_DENIED ->
                    "An active room membership is required.";
            case NOT_ROOM_OWNER ->
                    "Only the room owner may perform this query.";
            case INVALID_CURSOR -> "The cursor is invalid.";
        };
    }

    private String messageSearchDetail(
            ChatMessageSearchErrorCode code
    ) {
        return switch (code) {
            case INVALID_CURSOR -> "The search cursor is invalid.";
            case ACCESS_DENIED ->
                    "An active room membership is required.";
            case MESSAGE_SEARCH_NOT_AVAILABLE ->
                    "Message search is not available for this room.";
            case MESSAGE_SEARCH_RATE_LIMITED ->
                    "Message search rate limit was exceeded.";
            case MESSAGE_SEARCH_UNAVAILABLE ->
                    "Message search is temporarily unavailable.";
            case INTERNAL_ERROR ->
                    "Message search data is inconsistent.";
        };
    }
}
