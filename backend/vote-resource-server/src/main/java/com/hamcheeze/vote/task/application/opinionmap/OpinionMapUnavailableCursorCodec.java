package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.Objects;
import java.util.UUID;

@Component
public final class OpinionMapUnavailableCursorCodec {

    private static final String VERSION = "v1";
    private static final String SEPARATOR = "\n";
    private static final int FIELD_COUNT = 3;
    private static final int MAX_ENCODED_LENGTH = 512;
    private static final String INVALID_MESSAGE =
            "Opinion Map unavailable cursor is invalid";

    public String encode(OpinionMapUnavailableCursor cursor) {
        Objects.requireNonNull(cursor, "cursor");
        String payload = String.join(
                SEPARATOR,
                VERSION,
                cursor.failedAt().toString(),
                cursor.generationId().value().toString());
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    public OpinionMapUnavailableCursor decode(String encoded) {
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
            Instant failedAt = Instant.parse(fields[1]);
            UUID generationId = UUID.fromString(fields[2]);
            if (!generationId.toString().equals(fields[2])) {
                throw invalid(null);
            }
            return new OpinionMapUnavailableCursor(
                    failedAt,
                    new OpinionMapGenerationId(generationId));
        } catch (IllegalArgumentException
                 | DateTimeParseException exception) {
            if (INVALID_MESSAGE.equals(exception.getMessage())) {
                throw exception;
            }
            throw invalid(exception);
        }
    }

    private static IllegalArgumentException invalid(Throwable cause) {
        return new IllegalArgumentException(INVALID_MESSAGE, cause);
    }
}
