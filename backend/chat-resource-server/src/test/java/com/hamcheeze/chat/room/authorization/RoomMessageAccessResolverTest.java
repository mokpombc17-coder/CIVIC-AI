package com.hamcheeze.chat.room.authorization;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RoomMessageAccessResolverTest {

    private final RoomAccessReader reader = mock(RoomAccessReader.class);
    private final RoomMessageAccessResolver resolver =
            new RoomMessageAccessResolver(reader);

    @Test
    void activeMembershipReturnsBoundaryFromSameSnapshot() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(new RoomAccessSnapshot(
                        "room-1",
                        RoomStatus.ACTIVE,
                        3,
                        "membership-1",
                        MembershipStatus.ACTIVE,
                        2L,
                        100L,
                        RoomAccessState.ACTIVE_MEMBER));

        RoomMessageAccess access =
                resolver.resolve("user-1", "room-1");

        assertThat(access.decision())
                .isEqualTo(RoomAuthorizationDecision.ALLOWED);
        assertThat(access.messageVisibleAfterSequence())
                .isEqualTo(100);
    }

    @Test
    void inactiveMembershipIsForbiddenWithoutBoundaryExposure() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(new RoomAccessSnapshot(
                        "room-1",
                        RoomStatus.ACTIVE,
                        3,
                        "membership-1",
                        MembershipStatus.LEFT,
                        2L,
                        100L,
                        RoomAccessState.MEMBERSHIP_LEFT));

        RoomMessageAccess access =
                resolver.resolve("user-1", "room-1");

        assertThat(access.decision())
                .isEqualTo(RoomAuthorizationDecision.FORBIDDEN);
        assertThat(access.messageVisibleAfterSequence()).isNull();
    }

    @Test
    void accessReadFailureIsUnavailable() {
        when(reader.readAccess("user-1", "room-1"))
                .thenThrow(new RoomAccessReadException("mongo down"));

        assertThat(resolver.resolve("user-1", "room-1").decision())
                .isEqualTo(RoomAuthorizationDecision.UNAVAILABLE);
    }
}
