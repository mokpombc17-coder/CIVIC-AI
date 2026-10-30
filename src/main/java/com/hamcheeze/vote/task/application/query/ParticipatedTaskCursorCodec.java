package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.Objects;
import java.util.UUID;

@Component
public final class ParticipatedTaskCursorCodec {

    private static final String VERSION = "v1";
    private static final String SEPARATOR = "\n";
    private static final int FIELD_COUNT = 4;
    private static final int MAX_ENCODED_LENGTH = 512;
    private static final String INVALID_MESSAGE =
            "participated task cursor is invalid";

    public String encode(ParticipatedTaskCursor cursor) {
        Objects.requireNonNull(cursor, "cursor");
        String payload = String.join(
                SEPARATOR,
                VERSION,
                cursor.queryFingerprint(),
                cursor.submittedAt().toString(),
                cursor.taskId().value().toString());
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    public ParticipatedTaskCursor decode(String encoded) {
        if (encoded == null || encoded.isBlank()
                || encoded.length() > MAX_ENCODED_LENGTH) {
            throw invalid(null);
        }

        try {
            String payload = new String(
                    Base64.getUrlDecoder().decode(encoded),
                    StandardCharsets.UTF_8);
            String[] fields = payload.split(SEPARATOR, -1);
            if (fields.length != FIELD_COUNT
                    || !VERSION.equals(fields[0])) {
                throw invalid(null);
            }

            Instant submittedAt = Instant.parse(fields[2]);
            UUID taskId = UUID.fromString(fields[3]);
            if (!taskId.toString().equals(fields[3])) {
                throw invalid(null);
            }
            return new ParticipatedTaskCursor(
                    fields[1], submittedAt, new TaskId(taskId));
        } catch (IllegalArgumentException
                 | DateTimeParseException exception) {
            if (exception instanceof IllegalArgumentException
                    && INVALID_MESSAGE.equals(exception.getMessage())) {
                throw exception;
            }
            throw invalid(exception);
        }
    }

    private static IllegalArgumentException invalid(Throwable cause) {
        return new IllegalArgumentException(INVALID_MESSAGE, cause);
    }
}
