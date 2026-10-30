package com.hamcheeze.chat.room.inbox.summary;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RoomInboxSummaryPreviewTest {

    @Test
    void preservesOneLineShorterThanLimit() {
        assertThat(RoomInboxSummaryPreview.from(" short message "))
                .isEqualTo(new RoomInboxSummaryPreview(
                        "short message", false));
    }

    @Test
    void distinguishesExactlySixtyFromSixtyOneCodePoints() {
        String sixty = "가".repeat(60);

        assertThat(RoomInboxSummaryPreview.from(sixty))
                .isEqualTo(new RoomInboxSummaryPreview(sixty, false));
        assertThat(RoomInboxSummaryPreview.from(sixty + "나"))
                .isEqualTo(new RoomInboxSummaryPreview(sixty, true));
    }

    @Test
    void stopsAtEverySupportedLineBreak() {
        for (String separator : new String[]{"\r\n", "\n", "\r"}) {
            assertThat(RoomInboxSummaryPreview.from(
                    "first" + separator + "second"))
                    .isEqualTo(new RoomInboxSummaryPreview(
                            "first", true));
        }
    }

    @Test
    void replacesTabsAndStripsOuterWhitespace() {
        assertThat(RoomInboxSummaryPreview.from(" \tone\ttwo\t "))
                .isEqualTo(new RoomInboxSummaryPreview(
                        "one two", false));
    }

    @Test
    void countsUnicodeCodePointsAndDoesNotAppendEllipsis() {
        String sixtyEmoji = "😀".repeat(60);
        RoomInboxSummaryPreview preview =
                RoomInboxSummaryPreview.from(sixtyEmoji + "😀");

        assertThat(preview.value()).isEqualTo(sixtyEmoji);
        assertThat(preview.value()).doesNotEndWith("…");
        assertThat(preview.value().codePointCount(
                0, preview.value().length())).isEqualTo(60);
        assertThat(preview.truncated()).isTrue();
    }
}
