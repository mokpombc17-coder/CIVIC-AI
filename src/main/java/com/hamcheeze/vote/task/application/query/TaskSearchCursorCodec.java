package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.Objects;
import java.util.UUID;

@Component
public final class TaskSearchCursorCodec {

    private static final String VERSION = "v1";
    private static final String SEPARATOR = "\n";
    private static final int FIELD_COUNT = 6;
    private static final int MAX_ENCODED_LENGTH = 1024;
    private static final String INVALID_MESSAGE =
            "task search cursor is invalid";

    public String encode(TaskSearchCursor cursor) {
        Objects.requireNonNull(cursor, "cursor");
        String payload = String.join(
                SEPARATOR,
                VERSION,
                cursor.queryFingerprint(),
                cursor.userFingerprint(),
                cursor.taskStatus().name(),
                cursor.sortAt().toString(),
                cursor.taskId().value().toString());
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    public TaskSearchCursor decode(String encoded) {
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

            TaskStatus status = TaskStatus.valueOf(fields[3]);
            Instant sortAt = Instant.parse(fields[4]);
            UUID taskId = UUID.fromString(fields[5]);
            if (!taskId.toString().equals(fields[5])) {
                throw invalid(null);
            }
            return new TaskSearchCursor(
                    fields[1], fields[2], status, sortAt,
                    new TaskId(taskId));
        } catch (IllegalArgumentException
                 | DateTimeParseException exception) {
            if (exception instanceof TaskSearchCursorException) {
                throw exception;
            }
            throw invalid(exception);
        }
    }

    static TaskSearchCursorException invalid(Throwable cause) {
        return new TaskSearchCursorException(INVALID_MESSAGE, cause);
    }
}
