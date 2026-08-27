package com.hamcheeze.chat.room.creation;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomCreationRejectionReasonTest {

    @Test
    void canonicalizesAndAcceptsOneToOneHundredUnicodeCodePoints() {
        assertThat(RoomCreationRejectionReason.requireValid("  사유  "))
                .isEqualTo("사유");
        assertThat(RoomCreationRejectionReason.isValid("가")).isTrue();
        assertThat(RoomCreationRejectionReason.isValid("😀".repeat(100)))
                .isTrue();
    }

    @Test
    void rejectsBlankOverLimitControlAndLineSeparatorValues() {
        for (String invalid : new String[]{
                "",
                "   ",
                "가".repeat(101),
                "첫째\n둘째",
                "제어\u0000문자",
                "제어\u0085문자",
                "줄\u2028구분",
                "문단\u2029구분"
        }) {
            assertThat(RoomCreationRejectionReason.isValid(invalid))
                    .as("invalid rejection reason: %s", invalid)
                    .isFalse();
            assertThatThrownBy(() ->
                    RoomCreationRejectionReason.requireValid(invalid))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(RoomCreationRejectionReason.isValid(null)).isFalse();
        assertThatThrownBy(() ->
                RoomCreationRejectionReason.requireValid(null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
