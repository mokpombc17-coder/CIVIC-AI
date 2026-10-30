package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.AdminRoomQueryCursor.Scope;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.ObjectWriter;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Objects;

public final class AdminRoomQueryCursorCodec {

    private final ObjectWriter writer;
    private final ObjectReader reader;

    public AdminRoomQueryCursorCodec(ObjectMapper objectMapper) {
        ObjectMapper mapper = Objects.requireNonNull(
                objectMapper,
                "objectMapper");
        this.writer = mapper.writerFor(CursorPayload.class);
        this.reader = mapper.readerFor(CursorPayload.class)
                .with(DeserializationFeature
                        .FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public String encode(AdminRoomQueryCursor cursor) {
        Objects.requireNonNull(cursor, "cursor");
        try {
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(writer.writeValueAsBytes(
                            CursorPayload.from(cursor)));
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    public AdminRoomQueryCursor decode(
            String token,
            AdminRoomQueryCriteria expectedCriteria
    ) {
        Objects.requireNonNull(expectedCriteria, "expectedCriteria");
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(token);
            CursorPayload payload = reader.readValue(
                    new String(decoded, StandardCharsets.UTF_8));
            AdminRoomQueryCursor cursor = payload.toCursor();
            if (!cursor.criteria().equals(expectedCriteria)) {
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
                "Invalid admin Room query cursor",
                cause);
    }

    private record CursorPayload(
            int version,
            Scope scope,
            CriteriaPayload criteria,
            String lastRoomId
    ) {

        private static CursorPayload from(
                AdminRoomQueryCursor cursor
        ) {
            return new CursorPayload(
                    cursor.version(),
                    cursor.scope(),
                    CriteriaPayload.from(cursor.criteria()),
                    cursor.lastRoomId());
        }

        private AdminRoomQueryCursor toCursor() {
            if (criteria == null) {
                throw new IllegalArgumentException(
                        "cursor criteria must not be null");
            }
            return new AdminRoomQueryCursor(
                    version,
                    scope,
                    criteria.toCriteria(),
                    lastRoomId);
        }
    }

    private record CriteriaPayload(
            String query,
            String categoryId,
            RoomStatus status,
            RoomVisibility visibility
    ) {

        private static CriteriaPayload from(
                AdminRoomQueryCriteria criteria
        ) {
            return new CriteriaPayload(
                    criteria.nameContains(),
                    criteria.categoryId(),
                    criteria.status(),
                    criteria.visibility());
        }

        private AdminRoomQueryCriteria toCriteria() {
            return new AdminRoomQueryCriteria(
                    query,
                    categoryId,
                    status,
                    visibility);
        }
    }
}
