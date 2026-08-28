package com.hamcheeze.chat.room.category;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomCategoryTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-28T00:00:00Z");

    @Test
    void createsCanonicalCategoryAndNormalizesNameForUniqueness() {
        RoomCategory category = RoomCategory.create(
                "category-1",
                "  Policy  ",
                CREATED_AT);

        assertThat(category.name()).isEqualTo("Policy");
        assertThat(category.normalizedName()).isEqualTo("policy");
        assertThat(category.version()).isZero();
        assertThat(category.createdAt()).isEqualTo(CREATED_AT);
        assertThat(category.updatedAt()).isEqualTo(CREATED_AT);
    }

    @Test
    void renamePreservesIdentityAndAdvancesVersion() {
        RoomCategory category = RoomCategory.create(
                "category-1",
                "정책",
                CREATED_AT);

        RoomCategory renamed = category.rename(
                "정책·행정",
                CREATED_AT.plusSeconds(10));

        assertThat(renamed.categoryId()).isEqualTo("category-1");
        assertThat(renamed.name()).isEqualTo("정책·행정");
        assertThat(renamed.createdAt()).isEqualTo(CREATED_AT);
        assertThat(renamed.updatedAt())
                .isEqualTo(CREATED_AT.plusSeconds(10));
        assertThat(renamed.version()).isEqualTo(1);
    }

    @Test
    void unchangedRenameIsNoOp() {
        RoomCategory category = RoomCategory.create(
                "category-1",
                "정책",
                CREATED_AT);

        assertThat(category.rename(
                " 정책 ",
                CREATED_AT.plusSeconds(10)))
                .isSameAs(category);
    }

    @Test
    void rejectsBlankLongAndMultiLineNames() {
        assertThatThrownBy(() -> RoomCategory.create(
                "category-1",
                "   ",
                CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RoomCategory.create(
                "category-1",
                "가".repeat(RoomCategory.MAX_NAME_CODE_POINTS + 1),
                CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RoomCategory.create(
                "category-1",
                "정책\n행정",
                CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
