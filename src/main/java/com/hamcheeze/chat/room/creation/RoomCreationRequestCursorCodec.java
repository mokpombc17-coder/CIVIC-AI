package com.hamcheeze.chat.room.creation;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.ObjectWriter;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Objects;

public final class RoomCreationRequestCursorCodec {

    private final ObjectWriter writer;
    private final ObjectReader reader;

    public RoomCreationRequestCursorCodec(ObjectMapper objectMapper) {
        ObjectMapper mapper = Objects.requireNonNull(
                objectMapper,
                "objectMapper");
        this.writer = mapper.writerFor(CursorPayload.class);
        this.reader = mapper.readerFor(CursorPayload.class)
                .with(DeserializationFeature
                        .FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public String encode(RoomCreationRequestCursor cursor) {
        try {
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(writer.writeValueAsBytes(
                            CursorPayload.from(cursor)));
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    public RoomCreationRequestCursor decode(
            String token,
            String expectedRequesterUserId
    ) {
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(token);
            CursorPayload payload = reader.readValue(
                    new String(decoded, StandardCharsets.UTF_8));
            RoomCreationRequestCursor cursor = payload.toCursor();
            if (!cursor.requesterUserId().equals(
                    expectedRequesterUserId)) {
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
                "Invalid Room creation request cursor",
                cause);
    }

    private record CursorPayload(
            int version,
            String requesterUserId,
            Instant lastRequestedAt,
            String lastCreationRequestId
    ) {

        private static CursorPayload from(
                RoomCreationRequestCursor cursor
        ) {
            Objects.requireNonNull(cursor, "cursor");
            return new CursorPayload(
                    cursor.version(),
                    cursor.requesterUserId(),
                    cursor.lastRequestedAt(),
                    cursor.lastCreationRequestId());
        }

        private RoomCreationRequestCursor toCursor() {
            return new RoomCreationRequestCursor(
                    version,
                    requesterUserId,
                    lastRequestedAt,
                    lastCreationRequestId);
        }
    }
}
