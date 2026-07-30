package com.hamcheeze.chat.room.authorization;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MembershipRoomAuthorizationServiceTest {

    private final RoomAccessReader reader =
            mock(RoomAccessReader.class);
    private final SimpleMeterRegistry meters =
            new SimpleMeterRegistry();
    private final MembershipRoomAuthorizationService service =
            new MembershipRoomAuthorizationService(reader, meters);

    @Test
    void allowsOnlyActiveMembershipInActiveRoom() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(snapshot(
                        MembershipStatus.ACTIVE,
                        RoomAccessState.ACTIVE_MEMBER));

        assertThat(service.authorizeSubscription("user-1", "room-1"))
                .isEqualTo(RoomAuthorizationDecision.ALLOWED);
        assertThat(service.authorizeMessageSend("user-1", "room-1"))
                .isEqualTo(RoomAuthorizationDecision.ALLOWED);
        assertThat(counter("subscription", "allowed")).isEqualTo(1);
        assertThat(counter("send", "allowed")).isEqualTo(1);
    }

    @Test
    void normalDeniedStatesAreForbidden() {
        for (RoomAccessSnapshot snapshot : new RoomAccessSnapshot[]{
                RoomAccessSnapshot.roomNotFound("room-1"),
                new RoomAccessSnapshot(
                        "room-1",
                        RoomStatus.CLOSED,
                        2,
                        null,
                        null,
                        null,
                        RoomAccessState.ROOM_CLOSED),
                new RoomAccessSnapshot(
                        "room-1",
                        RoomStatus.ACTIVE,
                        2,
                        null,
                        null,
                        null,
                        RoomAccessState.MEMBERSHIP_NOT_FOUND),
                snapshot(
                        MembershipStatus.LEFT,
                        RoomAccessState.MEMBERSHIP_LEFT),
                snapshot(
                        MembershipStatus.BANNED,
                        RoomAccessState.MEMBERSHIP_BANNED)}) {
            when(reader.readAccess("user-1", "room-1"))
                    .thenReturn(snapshot);
            assertThat(service.authorizeSubscription(
                    "user-1",
                    "room-1"))
                    .isEqualTo(RoomAuthorizationDecision.FORBIDDEN);
        }
    }

    @Test
    void invalidInputIsForbiddenWithoutReading() {
        assertThat(service.authorizeSubscription(null, "room-1"))
                .isEqualTo(RoomAuthorizationDecision.FORBIDDEN);
        assertThat(service.authorizeMessageSend(" ", "room-1"))
                .isEqualTo(RoomAuthorizationDecision.FORBIDDEN);
        assertThat(service.authorizeSubscription("user-1", null))
                .isEqualTo(RoomAuthorizationDecision.FORBIDDEN);
        assertThat(service.authorizeMessageSend("user-1", "bad room"))
                .isEqualTo(RoomAuthorizationDecision.FORBIDDEN);

        verify(reader, never()).readAccess(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void readFailureOrCorruptSnapshotIsUnavailable() {
        when(reader.readAccess("user-1", "room-1"))
                .thenThrow(new RoomAccessReadException("unavailable"))
                .thenReturn(new RoomAccessSnapshot(
                        "room-1",
                        RoomStatus.ACTIVE,
                        1,
                        MembershipStatus.LEFT,
                        1L,
                        10L,
                        RoomAccessState.ACTIVE_MEMBER));

        assertThat(service.authorizeSubscription("user-1", "room-1"))
                .isEqualTo(RoomAuthorizationDecision.UNAVAILABLE);
        assertThat(service.authorizeMessageSend("user-1", "room-1"))
                .isEqualTo(RoomAuthorizationDecision.UNAVAILABLE);
    }

    private double counter(String operation, String decision) {
        return meters.get("room.authorization.decisions")
                .tag("operation", operation)
                .tag("decision", decision)
                .counter()
                .count();
    }

    private static RoomAccessSnapshot snapshot(
            MembershipStatus membershipStatus,
            RoomAccessState state
    ) {
        return new RoomAccessSnapshot(
                "room-1",
                RoomStatus.ACTIVE,
                3,
                membershipStatus,
                2L,
                10L,
                state);
    }
}
