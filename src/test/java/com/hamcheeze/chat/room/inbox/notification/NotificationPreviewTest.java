package com.hamcheeze.chat.room.inbox.notification;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationPreviewTest {

    @Test
    void truncatesByUnicodeCodePointWithoutSplittingSurrogatePair() {
        String content = "😀".repeat(31);

        NotificationPreview preview = NotificationPreview.from(content);

        assertThat(preview.value().codePointCount(
                0, preview.value().length())).isEqualTo(30);
        assertThat(preview.truncated()).isTrue();
    }

    @Test
    void cutsAtEveryLineBreakAndNormalizesTabWithoutMarkingTrim() {
        assertThat(NotificationPreview.from("  a\tb  "))
                .isEqualTo(new NotificationPreview("a b", false));
        assertThat(NotificationPreview.from("first\r\nsecond"))
                .isEqualTo(new NotificationPreview("first", true));
        assertThat(NotificationPreview.from("first\nsecond"))
                .isEqualTo(new NotificationPreview("first", true));
        assertThat(NotificationPreview.from("first\rsecond"))
                .isEqualTo(new NotificationPreview("first", true));
    }
}
