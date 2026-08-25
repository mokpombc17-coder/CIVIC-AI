package com.hamcheeze.chat.room.creation;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.ObjectWriter;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Objects;

public final class AdminRoomCreationRequestCursorCodec {

    private final ObjectWriter writer;
    private final ObjectReader reader;

    public AdminRoomCreationRequestCursorCodec(
            ObjectMapper objectMapper
    ) {
        ObjectMapper mapper = Objects.requireNonNull(
                objectMapper,
                "objectMapper");
        this.writer = mapper.writerFor(CursorPayload.class);
        this.reader = mapper.readerFor(CursorPayload.class)
                .with(DeserializationFeature
                        .FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public String encode(AdminRoomCreationRequestCursor cursor) {
        try {
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(writer.writeValueAsBytes(
                            CursorPayload.from(cursor)));
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    public AdminRoomCreationRequestCursor decode(
            String token,
            RoomCreationRequestStatus expectedStatus
    ) {
        Objects.requireNonNull(expectedStatus, "expectedStatus");
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(token);
            CursorPayload payload = reader.readValue(
                    new String(decoded, StandardCharsets.UTF_8));
            AdminRoomCreationRequestCursor cursor = payload.toCursor();
            if (cursor.status() != expectedStatus) {
                throw invalidCursor(null);
            }
            return cursor;
        } catch (RoomCreationRequestException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    private static RoomCreationRequestException invalidCursor(
            Throwable cause
    ) {
        return new RoomCreationRequestException(
                RoomCreationRequestErrorCode.INVALID_CURSOR,
                "Invalid admin Room creation request cursor",
                cause);
    }

    private record CursorPayload(
            int version,
            RoomCreationRequestStatus status,
            Instant lastRequestedAt,
            String lastCreationRequestId
    ) {

        private static CursorPayload from(
                AdminRoomCreationRequestCursor cursor
        ) {
            Objects.requireNonNull(cursor, "cursor");
            return new CursorPayload(
                    cursor.version(),
                    cursor.status(),
                    cursor.lastRequestedAt(),
                    cursor.lastCreationRequestId());
        }

        private AdminRoomCreationRequestCursor toCursor() {
            return new AdminRoomCreationRequestCursor(
                    version,
                    status,
                    lastRequestedAt,
                    lastCreationRequestId);
        }
    }
}
