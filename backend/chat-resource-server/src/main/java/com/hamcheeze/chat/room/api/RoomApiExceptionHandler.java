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
import com.hamcheeze.chat.room.creation.RoomCreationRequestErrorCode;
import com.hamcheeze.chat.room.creation.RoomCreationRequestException;
import com.hamcheeze.chat.room.category.RoomCategoryException;
import com.hamcheeze.chat.room.category.api.AdminRoomCategoryController;
import com.hamcheeze.chat.room.category.api.AdminRoomCategoryAssignmentController;
import com.hamcheeze.chat.room.category.api.RoomCategoryController;
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
        AdminRoomCreationRequestController.class,
        AdminRoomCategoryAssignmentController.class,
        AdminRoomCategoryController.class,
        RoomCommandController.class,
        RoomCategoryController.class,
        RoomCreationRequestController.class,
        RoomParticipationQueryController.class,
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

    @ExceptionHandler(RoomCreationRequestException.class)
    ResponseEntity<ProblemDetail> creationRequest(
            RoomCreationRequestException exception,
            HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.code()) {
            case ROOM_CREATION_REQUEST_NOT_FOUND ->
                    HttpStatus.NOT_FOUND;
            case INVALID_CURSOR -> HttpStatus.BAD_REQUEST;
            case ROOM_CREATION_DECISION_CONFLICT,
                    ROOM_CREATION_PENDING_LIMIT_EXCEEDED,
                    USER_ACTIVE_ROOM_LIMIT_EXCEEDED,
                    IDEMPOTENCY_CONFLICT -> HttpStatus.CONFLICT;
        };
        String detail = creationRequestDetail(exception.code());
        return problem(
                status,
                exception.code().name(),
                "Room creation request failed",
                detail,
                request,
                false,
                null);
    }

    @ExceptionHandler(RoomCategoryException.class)
    ResponseEntity<ProblemDetail> category(
            RoomCategoryException exception,
            HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.code()) {
            case INVALID_ROOM_CATEGORY -> HttpStatus.BAD_REQUEST;
            case ROOM_NOT_FOUND,
                    ROOM_CATEGORY_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case ROOM_CATEGORY_NAME_CONFLICT,
                    ROOM_CATEGORY_VERSION_CONFLICT,
                    ROOM_CATEGORY_ASSIGNMENT_VERSION_CONFLICT,
                    ROOM_CATEGORY_IN_USE,
                    ROOM_CATEGORY_DEFAULT_PROTECTED ->
                    HttpStatus.CONFLICT;
        };
        ResponseEntity<ProblemDetail> response = problem(
                status,
                exception.code().name(),
                "Room category operation failed",
                categoryDetail(exception),
                request,
                false,
                null);
        if (exception.referencedRoomCount() != null
                && response.getBody() != null) {
            response.getBody().setProperty(
                    "referencedRoomCount",
                    exception.referencedRoomCount());
        }
        return response;
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
            case MESSAGE_NOT_FOUND -> HttpStatus.NOT_FOUND;
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
        ResponseEntity<ProblemDetail> response = problem(
                status,
                exception.code().name(),
                "Message search failed",
                messageSearchDetail(exception.code()),
                request,
                retryable,
                null);
        if (exception.retryAfterMs() != null
                && response.getBody() != null) {
            response.getBody().setProperty(
                    "retryAfterMs",
                    exception.retryAfterMs());
        }
        return response;
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

    private String creationRequestDetail(
            RoomCreationRequestErrorCode code
    ) {
        return switch (code) {
            case ROOM_CREATION_REQUEST_NOT_FOUND ->
                    "The Room creation request was not found.";
            case ROOM_CREATION_DECISION_CONFLICT ->
                    "The Room creation request was already resolved.";
            case ROOM_CREATION_PENDING_LIMIT_EXCEEDED ->
                    "The pending Room creation request limit "
                            + "was exceeded.";
            case USER_ACTIVE_ROOM_LIMIT_EXCEEDED ->
                    "The user has reached the active room limit.";
            case IDEMPOTENCY_CONFLICT ->
                    "The Idempotency-Key was already used for a "
                            + "different Room creation request.";
            case INVALID_CURSOR ->
                    "The Room creation request cursor is invalid.";
        };
    }

    private String categoryDetail(RoomCategoryException exception) {
        return switch (exception.code()) {
            case INVALID_ROOM_CATEGORY ->
                    "The Room category is invalid.";
            case ROOM_NOT_FOUND ->
                    "The Room was not found.";
            case ROOM_CATEGORY_NOT_FOUND ->
                    "The Room category was not found.";
            case ROOM_CATEGORY_NAME_CONFLICT ->
                    "A Room category with the same name already exists.";
            case ROOM_CATEGORY_VERSION_CONFLICT ->
                    "The Room category was changed by another request.";
            case ROOM_CATEGORY_ASSIGNMENT_VERSION_CONFLICT ->
                    "The Room was changed by another request.";
            case ROOM_CATEGORY_IN_USE ->
                    "The Room category is assigned to one or more Rooms.";
            case ROOM_CATEGORY_DEFAULT_PROTECTED ->
                    "The default Room category cannot be deleted.";
        };
    }

    private String messageSearchDetail(
            ChatMessageSearchErrorCode code
    ) {
        return switch (code) {
            case INVALID_CURSOR -> "The search cursor is invalid.";
            case MESSAGE_NOT_FOUND -> "The message was not found.";
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
