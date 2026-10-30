package com.hamcheeze.chat.room;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MembershipProfileTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-10T00:00:00Z");

    @Test
    void createsAnonymousProfileFromParticipantNumber() {
        MembershipProfile profile =
                MembershipProfile.createAnonymous(2, CREATED_AT);

        assertThat(profile.participantNumber()).isEqualTo(2);
        assertThat(profile.displayName()).isEqualTo("참여자 2");
        assertThat(profile.imageUrl()).isNull();
        assertThat(profile.version()).isEqualTo(1);
        assertThat(profile.createdAt()).isEqualTo(CREATED_AT);
        assertThat(profile.updatedAt()).isEqualTo(CREATED_AT);
    }

    @Test
    void restoresCanonicalProfile() {
        Instant updatedAt = CREATED_AT.plusSeconds(60);

        MembershipProfile profile = MembershipProfile.restore(
                12,
                "  참여자 12  ",
                "  https://cdn.example.com/avatar.png  ",
                3,
                CREATED_AT,
                updatedAt);

        assertThat(profile.displayName()).isEqualTo("참여자 12");
        assertThat(profile.imageUrl())
                .isEqualTo("https://cdn.example.com/avatar.png");
        assertThat(profile.version()).isEqualTo(3);
        assertThat(profile.updatedAt()).isEqualTo(updatedAt);
    }

    @Test
    void rejectsInvalidParticipantNumberAndVersion() {
        assertInvalid(() -> MembershipProfile.createAnonymous(
                0, CREATED_AT));
        assertInvalid(() -> new MembershipProfile(
                1, "참여자 1", null, 0, CREATED_AT, CREATED_AT));
    }

    @Test
    void rejectsInvalidDisplayName() {
        assertInvalid(() -> profileWithDisplayName(null));
        assertInvalid(() -> profileWithDisplayName("   "));
        assertInvalid(() -> profileWithDisplayName("참여자\n1"));
        assertInvalid(() -> profileWithDisplayName("가".repeat(
                MembershipProfile.MAX_DISPLAY_NAME_CODE_POINTS + 1)));
    }

    @Test
    void rejectsInvalidImageUrl() {
        assertInvalid(() -> profileWithImageUrl("   "));
        assertInvalid(() -> profileWithImageUrl("avatar.png"));
        assertInvalid(() -> profileWithImageUrl("file:///avatar.png"));
        assertInvalid(() -> profileWithImageUrl(
                "https://example.com/avatar\n.png"));
    }

    @Test
    void rejectsInvalidTimestamps() {
        assertInvalid(() -> new MembershipProfile(
                1, "참여자 1", null, 1, null, CREATED_AT));
        assertInvalid(() -> new MembershipProfile(
                1, "참여자 1", null, 1, CREATED_AT, null));
        assertInvalid(() -> new MembershipProfile(
                1,
                "참여자 1",
                null,
                1,
                CREATED_AT,
                CREATED_AT.minusSeconds(1)));
    }

    private static MembershipProfile profileWithDisplayName(
            String displayName
    ) {
        return new MembershipProfile(
                1, displayName, null, 1, CREATED_AT, CREATED_AT);
    }

    private static MembershipProfile profileWithImageUrl(String imageUrl) {
        return new MembershipProfile(
                1,
                "참여자 1",
                imageUrl,
                1,
                CREATED_AT,
                CREATED_AT);
    }

    private static void assertInvalid(Runnable action) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(
                        RoomDomainException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(RoomDomainErrorCode
                                        .INVALID_MEMBERSHIP_PROFILE));
    }
}
