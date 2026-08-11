package com.hamcheeze.chat.message.search;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.ObjectWriter;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Objects;

public final class ChatMessageSearchCursorCodec {

    static final int MAX_CURSOR_TOKEN_LENGTH = 16_384;

    private final ObjectWriter writer;
    private final ObjectReader reader;
    private final Clock clock;
    private final Duration cursorTtl;

    public ChatMessageSearchCursorCodec(
            ObjectMapper objectMapper,
            Clock clock,
            Duration cursorTtl
    ) {
        ObjectMapper sourceMapper = Objects.requireNonNull(
                objectMapper,
                "objectMapper");
        ObjectMapper mapper = sourceMapper.rebuild()
                .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
                .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                .build();
        this.writer = mapper.writerFor(CursorPayload.class);
        this.reader = mapper.readerFor(CursorPayload.class)
                .with(DeserializationFeature
                        .FAIL_ON_UNKNOWN_PROPERTIES);
        this.clock = Objects.requireNonNull(clock, "clock");
        this.cursorTtl = Objects.requireNonNull(
                cursorTtl,
                "cursorTtl");
        if (cursorTtl.isZero() || cursorTtl.isNegative()) {
            throw new IllegalArgumentException(
                    "cursorTtl must be positive");
        }
    }

    public ChatMessageSearchCursor issue(
            ChatMessageSearchCursorBinding binding,
            long searchUpperBoundSequence,
            long nextBeforeSequence
    ) {
        Objects.requireNonNull(binding, "binding");
        Instant issuedAt = Instant.ofEpochMilli(clock.millis());
        return new ChatMessageSearchCursor(
                ChatMessageSearchCursor.CURRENT_VERSION,
                binding.roomId(),
                binding.requesterMembershipId(),
                binding.requesterMembershipVersion(),
                binding.messageVisibleAfterSequence(),
                binding.normalizedQueryFingerprint(),
                binding.resultLimit(),
                searchUpperBoundSequence,
                nextBeforeSequence,
                issuedAt,
                issuedAt.plus(cursorTtl));
    }

    public String encode(ChatMessageSearchCursor cursor) {
        Objects.requireNonNull(cursor, "cursor");
        final String token;
        try {
            token = Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(writer.writeValueAsBytes(
                            CursorPayload.from(cursor)));
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
        if (token.length() > MAX_CURSOR_TOKEN_LENGTH) {
            throw new IllegalStateException(
                    "Server-issued message search cursor "
                            + "exceeds the token length limit");
        }
        return token;
    }

    public ChatMessageSearchCursor decode(
            String token,
            ChatMessageSearchCursorBinding expectedBinding
    ) {
        Objects.requireNonNull(expectedBinding, "expectedBinding");
        if (token == null) {
            return null;
        }
        if (token.length() > MAX_CURSOR_TOKEN_LENGTH) {
            throw invalidCursor(null);
        }
        if (token.isBlank()) {
            return null;
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(token);
            CursorPayload payload = reader.readValue(
                    new String(decoded, StandardCharsets.UTF_8));
            ChatMessageSearchCursor cursor = payload.toCursor();
            verifyBinding(cursor, expectedBinding);
            verifyLifetime(cursor);
            return cursor;
        } catch (ChatMessageSearchException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
    }

    private void verifyBinding(
            ChatMessageSearchCursor cursor,
            ChatMessageSearchCursorBinding expectedBinding
    ) {
        if (!cursor.binding().equals(expectedBinding)) {
            throw invalidCursor(null);
        }
    }

    private void verifyLifetime(ChatMessageSearchCursor cursor) {
        Instant now = clock.instant();
        Instant expectedExpiry;
        try {
            expectedExpiry = cursor.issuedAt().plus(cursorTtl);
        } catch (RuntimeException exception) {
            throw invalidCursor(exception);
        }
        if (!cursor.expiresAt().equals(expectedExpiry)
                || cursor.issuedAt().isAfter(now)
                || !now.isBefore(cursor.expiresAt())) {
            throw invalidCursor(null);
        }
    }

    private ChatMessageSearchException invalidCursor(
            Throwable cause
    ) {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.INVALID_CURSOR,
                "Invalid message search cursor",
                cause);
    }

    private record CursorPayload(
            int cursorVersion,
            String roomId,
            String requesterMembershipId,
            long requesterMembershipVersion,
            long messageVisibleAfterSequence,
            String normalizedQueryFingerprint,
            int resultLimit,
            long searchUpperBoundSequence,
            long nextBeforeSequence,
            long issuedAtEpochMilli,
            long expiresAtEpochMilli
    ) {

        private static CursorPayload from(
                ChatMessageSearchCursor cursor
        ) {
            return new CursorPayload(
                    cursor.cursorVersion(),
                    cursor.roomId(),
                    cursor.requesterMembershipId(),
                    cursor.requesterMembershipVersion(),
                    cursor.messageVisibleAfterSequence(),
                    cursor.normalizedQueryFingerprint(),
                    cursor.resultLimit(),
                    cursor.searchUpperBoundSequence(),
                    cursor.nextBeforeSequence(),
                    cursor.issuedAt().toEpochMilli(),
                    cursor.expiresAt().toEpochMilli());
        }

        private ChatMessageSearchCursor toCursor() {
            return new ChatMessageSearchCursor(
                    cursorVersion,
                    roomId,
                    requesterMembershipId,
                    requesterMembershipVersion,
                    messageVisibleAfterSequence,
                    normalizedQueryFingerprint,
                    resultLimit,
                    searchUpperBoundSequence,
                    nextBeforeSequence,
                    Instant.ofEpochMilli(issuedAtEpochMilli),
                    Instant.ofEpochMilli(expiresAtEpochMilli));
        }
    }
}
