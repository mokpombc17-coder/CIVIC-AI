package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.query.RoomQueryCursor.Scope;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Objects;

public final class RoomQueryCursorCodec {

    private final ObjectMapper objectMapper;

    public RoomQueryCursorCodec(ObjectMapper objectMapper) {
        this.objectMapper =
                Objects.requireNonNull(objectMapper, "objectMapper");
    }

    public String encode(RoomQueryCursor cursor) {
        Objects.requireNonNull(cursor, "cursor");
        try {
            byte[] json = objectMapper.writeValueAsBytes(
                    CursorPayload.from(cursor));
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(json);
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    public RoomQueryCursor decode(
            String token,
            Scope expectedScope,
            MembershipStatus expectedStatus
    ) {
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(token);
            CursorPayload payload = objectMapper.readValue(
                    new String(decoded, StandardCharsets.UTF_8),
                    CursorPayload.class);
            RoomQueryCursor cursor = payload.toCursor();
            if (cursor.scope() != expectedScope
                    || cursor.status() != expectedStatus) {
                throw invalidCursor(null);
            }
            return cursor;
        } catch (RoomQueryException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    private RoomQueryException invalidCursor(Throwable cause) {
        return new RoomQueryException(
                RoomQueryErrorCode.INVALID_CURSOR,
                "Invalid room query cursor",
                cause);
    }

    private record CursorPayload(
            int version,
            Scope scope,
            MembershipStatus status,
            String lastMembershipId
    ) {

        private static CursorPayload from(RoomQueryCursor cursor) {
            return new CursorPayload(
                    cursor.version(),
                    cursor.scope(),
                    cursor.status(),
                    cursor.lastMembershipId());
        }

        private RoomQueryCursor toCursor() {
            return new RoomQueryCursor(
                    version,
                    scope,
                    status,
                    lastMembershipId);
        }
    }
}
