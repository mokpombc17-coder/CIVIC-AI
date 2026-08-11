package com.hamcheeze.chat.message.search;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessageSearchCursorCodecTest {

    private static final Instant NOW =
            Instant.parse("2026-08-10T03:00:00Z");
    private static final Duration TTL = Duration.ofMinutes(10);
    private static final String FINGERPRINT = "a".repeat(64);

    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private final ChatMessageSearchCursorCodec codec =
            new ChatMessageSearchCursorCodec(
                    JsonMapper.builder().build(),
                    clock,
                    TTL);

    @Test
    void issuesAndRoundTripsVersionOneCursorWithFixedTtl() {
        ChatMessageSearchCursor cursor = codec.issue(
                binding(),
                100,
                80);

        String token = codec.encode(cursor);

        assertThat(cursor.issuedAt()).isEqualTo(NOW);
        assertThat(cursor.expiresAt()).isEqualTo(NOW.plus(TTL));
        assertThat(token).doesNotContain("room-1");
        assertThat(token).hasSizeLessThan(
                ChatMessageSearchCursorCodec.MAX_CURSOR_TOKEN_LENGTH);
        assertThat(codec.decode(token, binding())).isEqualTo(cursor);
    }

    @Test
    void roundTripsOpaqueUnicodeAndLongMembershipId() {
        ChatMessageSearchCursorBinding opaqueBinding =
                new ChatMessageSearchCursorBinding(
                        "room-1",
                        "멤버십-가-" + "x".repeat(100),
                        3,
                        10,
                        FINGERPRINT,
                        20);
        ChatMessageSearchCursor cursor = codec.issue(
                opaqueBinding,
                100,
                80);

        String token = codec.encode(cursor);

        assertThat(token).hasSizeLessThan(
                ChatMessageSearchCursorCodec.MAX_CURSOR_TOKEN_LENGTH);
        assertThat(codec.decode(token, opaqueBinding)).isEqualTo(cursor);
    }

    @Test
    void treatsMissingCursorAsFirstSearchRequest() {
        assertThat(codec.decode(null, binding())).isNull();
        assertThat(codec.decode("  ", binding())).isNull();
    }

    @Test
    void rejectsOversizedTokenBeforeBase64Decode() {
        assertInvalid(
                "!".repeat(
                        ChatMessageSearchCursorCodec
                                .MAX_CURSOR_TOKEN_LENGTH),
                binding());
        assertThatThrownBy(() -> codec.decode(
                        "!".repeat(
                                ChatMessageSearchCursorCodec
                                        .MAX_CURSOR_TOKEN_LENGTH + 1),
                        binding()))
                .isInstanceOf(ChatMessageSearchException.class)
                .hasNoCause()
                .extracting("code")
                .isEqualTo(ChatMessageSearchErrorCode.INVALID_CURSOR);
    }

    @Test
    void supportsInitialMembershipVersionZero() {
        ChatMessageSearchCursorBinding initialMembership =
                new ChatMessageSearchCursorBinding(
                        "room-1",
                        "membership-1",
                        0,
                        10,
                        FINGERPRINT,
                        20);
        ChatMessageSearchCursor cursor = codec.issue(
                initialMembership,
                100,
                80);

        assertThat(codec.decode(
                codec.encode(cursor),
                initialMembership)).isEqualTo(cursor);
    }

    @Test
    void rejectsMalformedUnknownMissingAndUnsupportedPayloads() {
        assertInvalid("not-base64", binding());
        assertInvalid(token(payload().replace(
                "\"cursorVersion\":1",
                "\"cursorVersion\":2")), binding());
        assertInvalid(token(payload().replace(
                "\"roomId\":\"room-1\",",
                "")), binding());
        assertInvalid(token(payload().replace(
                "\"expiresAtEpochMilli\":1786331400000",
                "\"expiresAtEpochMilli\":1786331400000,"
                        + "\"unknown\":true")), binding());
        assertInvalid(token(payload().replace(
                "\"resultLimit\":20",
                "\"resultLimit\":\"20\"")), binding());
    }

    @Test
    void rejectsExpiredFutureIssuedAndExtendedTtlCursors() {
        assertInvalid(token(payload().replace(
                "1786330800000",
                "1786330200000").replace(
                "1786331400000",
                "1786330800000")), binding());
        assertInvalid(token(payload().replace(
                "1786330800000",
                "1786330860000").replace(
                "1786331400000",
                "1786331460000")), binding());
        assertInvalid(token(payload().replace(
                "1786331400000",
                "1786331460000")), binding());
    }

    @Test
    void rejectsCursorIssuedForDifferentRequestContext() {
        ChatMessageSearchCursor cursor = codec.issue(
                binding(),
                100,
                80);
        String token = codec.encode(cursor);

        assertInvalid(token, new ChatMessageSearchCursorBinding(
                "room-2", "membership-1", 3, 10,
                FINGERPRINT, 20));
        assertInvalid(token, new ChatMessageSearchCursorBinding(
                "room-1", "membership-2", 3, 10,
                FINGERPRINT, 20));
        assertInvalid(token, new ChatMessageSearchCursorBinding(
                "room-1", "membership-1", 4, 10,
                FINGERPRINT, 20));
        assertInvalid(token, new ChatMessageSearchCursorBinding(
                "room-1", "membership-1", 3, 11,
                FINGERPRINT, 20));
        assertInvalid(token, new ChatMessageSearchCursorBinding(
                "room-1", "membership-1", 3, 10,
                "b".repeat(64), 20));
        assertInvalid(token, new ChatMessageSearchCursorBinding(
                "room-1", "membership-1", 3, 10,
                FINGERPRINT, 21));
    }

    @Test
    void rejectsCursorSequenceRangeViolations() {
        assertInvalid(token(payload().replace(
                "\"searchUpperBoundSequence\":100",
                "\"searchUpperBoundSequence\":9")), binding());
        assertInvalid(token(payload().replace(
                "\"nextBeforeSequence\":80",
                "\"nextBeforeSequence\":10")), binding());
        assertInvalid(token(payload().replace(
                "\"nextBeforeSequence\":80",
                "\"nextBeforeSequence\":101")), binding());
    }

    private ChatMessageSearchCursorBinding binding() {
        return new ChatMessageSearchCursorBinding(
                "room-1",
                "membership-1",
                3,
                10,
                FINGERPRINT,
                20);
    }

    private void assertInvalid(
            String token,
            ChatMessageSearchCursorBinding binding
    ) {
        assertThatThrownBy(() -> codec.decode(token, binding))
                .isInstanceOf(ChatMessageSearchException.class)
                .extracting("code")
                .isEqualTo(ChatMessageSearchErrorCode.INVALID_CURSOR);
    }

    private String token(String payload) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(payload.getBytes(
                        StandardCharsets.UTF_8));
    }

    private String payload() {
        return """
                {"cursorVersion":1,"roomId":"room-1",
                "requesterMembershipId":"membership-1",
                "requesterMembershipVersion":3,
                "messageVisibleAfterSequence":10,
                "normalizedQueryFingerprint":"%s",
                "resultLimit":20,"searchUpperBoundSequence":100,
                "nextBeforeSequence":80,
                "issuedAtEpochMilli":1786330800000,
                "expiresAtEpochMilli":1786331400000}
                """.formatted(FINGERPRINT);
    }
}
