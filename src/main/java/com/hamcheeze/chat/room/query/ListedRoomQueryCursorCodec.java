package com.hamcheeze.chat.room.query;

import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Objects;

public final class ListedRoomQueryCursorCodec {

    private final ObjectMapper objectMapper;

    public ListedRoomQueryCursorCodec(ObjectMapper objectMapper) {
        this.objectMapper =
                Objects.requireNonNull(objectMapper, "objectMapper");
    }

    public String encode(ListedRoomQueryCursor cursor) {
        Objects.requireNonNull(cursor, "cursor");
        try {
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(objectMapper.writeValueAsBytes(
                            cursor));
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    public ListedRoomQueryCursor decode(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(token);
            return objectMapper.readValue(
                    new String(decoded, StandardCharsets.UTF_8),
                    ListedRoomQueryCursor.class);
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    private RoomQueryException invalidCursor(Throwable cause) {
        return new RoomQueryException(
                RoomQueryErrorCode.INVALID_CURSOR,
                "Invalid listed Room query cursor",
                cause);
    }
}
