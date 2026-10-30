package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.query.RoomQueryErrorCode;
import com.hamcheeze.chat.room.query.RoomQueryException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.ObjectWriter;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Objects;

public final class RoomInboxCursorCodec {

    private final ObjectWriter writer;
    private final ObjectReader reader;

    public RoomInboxCursorCodec(ObjectMapper objectMapper) {
        Objects.requireNonNull(objectMapper, "objectMapper");
        this.writer = objectMapper.writerFor(CursorPayload.class);
        this.reader = objectMapper.readerFor(CursorPayload.class)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public String encode(RoomInboxCursor cursor) {
        Objects.requireNonNull(cursor, "cursor");
        try {
            byte[] json = writer.writeValueAsBytes(
                    CursorPayload.from(cursor));
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(json);
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    public RoomInboxCursor decode(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(token);
            CursorPayload payload = reader.readValue(
                    new String(decoded, StandardCharsets.UTF_8));
            return payload.toCursor();
        } catch (RoomQueryException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    private static RoomQueryException invalidCursor(Throwable cause) {
        return new RoomQueryException(
                RoomQueryErrorCode.INVALID_CURSOR,
                "Invalid Room inbox cursor",
                cause);
    }

    private record CursorPayload(
            int version,
            RoomInboxCursor.Scope scope,
            Instant lastActivityAt,
            String lastRoomId
    ) {

        private static CursorPayload from(RoomInboxCursor cursor) {
            return new CursorPayload(
                    cursor.version(),
                    cursor.scope(),
                    cursor.lastActivityAt(),
                    cursor.lastRoomId());
        }

        private RoomInboxCursor toCursor() {
            return new RoomInboxCursor(
                    version,
                    scope,
                    lastActivityAt,
                    lastRoomId);
        }
    }
}
