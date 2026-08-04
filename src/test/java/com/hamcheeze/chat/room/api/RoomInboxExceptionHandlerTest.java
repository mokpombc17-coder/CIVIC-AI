package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.inbox.RoomInboxErrorCode;
import com.hamcheeze.chat.room.inbox.RoomInboxException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class RoomInboxExceptionHandlerTest {

    private final RoomApiExceptionHandler handler =
            new RoomApiExceptionHandler();

    @Test
    void storageFailureIsRetryable503WithoutInternalDetail() {
        ResponseEntity<ProblemDetail> response = handler.roomInbox(
                new RoomInboxException(
                        RoomInboxErrorCode.ROOM_INBOX_UNAVAILABLE,
                        "secret mongo host and query"),
                request());

        assertThat(response.getStatusCode())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getDetail())
                .isEqualTo("The room inbox is temporarily unavailable.");
        assertThat(response.getBody().getProperties())
                .containsEntry("code", "ROOM_INBOX_UNAVAILABLE")
                .containsEntry("retryable", true);
    }

    @Test
    void persistedInconsistencyIsNonRetryable500() {
        ResponseEntity<ProblemDetail> response = handler.roomInbox(
                new RoomInboxException(
                        RoomInboxErrorCode.READ_STATE_INCONSISTENT,
                        "boundary=80 sequence=0"),
                request());

        assertThat(response.getStatusCode())
                .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getDetail())
                .isEqualTo("The persisted read state is inconsistent.");
        assertThat(response.getBody().getProperties())
                .containsEntry("code", "READ_STATE_INCONSISTENT")
                .containsEntry("retryable", false);
    }

    private MockHttpServletRequest request() {
        MockHttpServletRequest request = new MockHttpServletRequest(
                "PUT", "/api/v1/rooms/room-1/read-state");
        return request;
    }
}
