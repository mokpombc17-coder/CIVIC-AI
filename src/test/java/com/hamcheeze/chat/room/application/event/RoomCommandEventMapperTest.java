package com.hamcheeze.chat.room.application.event;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.event.RoomClosedEventPayload;
import com.hamcheeze.chat.room.event.RoomCreatedEventPayload;
import com.hamcheeze.chat.room.event.RoomEventDeliveryPlan;
import com.hamcheeze.chat.room.event.RoomEventType;
import com.hamcheeze.chat.room.event.RoomMemberChangedEventPayload;
import com.hamcheeze.chat.room.event.RoomOwnershipTransferredEventPayload;
import com.hamcheeze.chat.room.event.RoomSettingsUpdatedEventPayload;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Set;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class RoomCommandEventMapperTest {

    private static final String REQUEST_ID =
            "73efcc36-3318-4ec5-8135-8d2e58ff2906";
    private static final String EVENT_ID =
            "550e8400-e29b-41d4-a716-446655440000";
    private static final Instant EMITTED_AT =
            Instant.parse("2026-07-28T10:00:00Z");

    private final RoomCommandEventMapper mapper =
            new RoomCommandEventMapper();

    @Test
    void mapsAllActualStateChanges() {
        assertCreated(map(result(RoomCommandResultCode.ROOM_CREATED)));
        assertMember(
                map(result(RoomCommandResultCode.JOINED)),
                RoomEventType.ROOM_MEMBER_JOINED,
                MembershipStatus.ACTIVE,
                Set.of("member-1"));
        assertMember(
                map(result(RoomCommandResultCode.REJOINED)),
                RoomEventType.ROOM_MEMBER_REJOINED,
                MembershipStatus.ACTIVE,
                Set.of("member-1"));
        assertMember(
                map(result(RoomCommandResultCode.LEFT)),
                RoomEventType.ROOM_MEMBER_LEFT,
                MembershipStatus.LEFT,
                Set.of("member-1"));
        assertOwnership(map(result(
                RoomCommandResultCode.OWNERSHIP_TRANSFERRED)));
        assertMember(
                map(result(RoomCommandResultCode.BANNED)),
                RoomEventType.ROOM_MEMBER_BANNED,
                MembershipStatus.BANNED,
                Set.of("target-1"));
        assertMember(
                map(result(RoomCommandResultCode.UNBANNED)),
                RoomEventType.ROOM_MEMBER_UNBANNED,
                MembershipStatus.LEFT,
                Set.of("target-1"));
        assertClosed(map(result(RoomCommandResultCode.CLOSED)));
        assertSettings(map(settings(
                RoomCommandResultCode.ROOM_SETTINGS_UPDATED)));
    }

    @Test
    void skipsReplayNoOpAndRejection() {
        Stream.of(
                        RoomCommandResultCode.ALREADY_ACTIVE,
                        RoomCommandResultCode.ALREADY_LEFT,
                        RoomCommandResultCode.ALREADY_BANNED,
                        RoomCommandResultCode.ALREADY_UNBANNED,
                        RoomCommandResultCode.ALREADY_CLOSED,
                        RoomCommandResultCode.ROOM_SETTINGS_UNCHANGED)
                .forEach(code -> assertThat(mapper.map(
                        execution(
                                code == RoomCommandResultCode
                                        .ROOM_SETTINGS_UNCHANGED
                                        ? settings(code)
                                        : result(code),
                                false),
                        EVENT_ID,
                        EMITTED_AT)).isEmpty());

        RoomCommandResult rejection = RoomCommandResult.rejection(
                RoomCommandType.JOIN_ROOM,
                RoomCommandResultCode.ROOM_CLOSED,
                "room-1",
                null);
        assertThat(mapper.map(
                execution(rejection, false),
                EVENT_ID,
                EMITTED_AT)).isEmpty();
        assertThat(mapper.map(
                execution(result(RoomCommandResultCode.JOINED), true),
                EVENT_ID,
                EMITTED_AT)).isEmpty();
    }

    private RoomEventDeliveryPlan map(RoomCommandResult result) {
        return mapper.map(
                execution(result, false),
                EVENT_ID,
                EMITTED_AT).orElseThrow();
    }

    private static void assertCreated(RoomEventDeliveryPlan plan) {
        assertThat(plan.event().eventType())
                .isEqualTo(RoomEventType.ROOM_CREATED);
        assertThat(plan.event().payload())
                .isInstanceOf(RoomCreatedEventPayload.class);
        RoomCreatedEventPayload payload =
                (RoomCreatedEventPayload) plan.event().payload();
        assertThat(payload.roomVersion()).isEqualTo(0);
        assertThat(payload.owner().role())
                .isEqualTo(MembershipRole.OWNER);
        assertThat(payload.owner().userId()).isEqualTo("owner-1");
        assertThat(payload.owner().status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(plan.userRecipients()).containsExactly("owner-1");
    }

    private static void assertMember(
            RoomEventDeliveryPlan plan,
            RoomEventType type,
            MembershipStatus status,
            Set<String> recipients
    ) {
        assertThat(plan.event().eventType()).isEqualTo(type);
        RoomMemberChangedEventPayload payload =
                (RoomMemberChangedEventPayload) plan.event().payload();
        assertThat(payload.roomStatus()).isEqualTo(RoomStatus.ACTIVE);
        assertThat(payload.member().role())
                .isEqualTo(MembershipRole.MEMBER);
        assertThat(payload.member().userId())
                .isEqualTo(recipients.iterator().next());
        assertThat(payload.member().status()).isEqualTo(status);
        assertThat(payload.member().membershipVersion()).isEqualTo(3);
        assertThat(plan.userRecipients()).isEqualTo(recipients);
    }

    private static void assertOwnership(RoomEventDeliveryPlan plan) {
        assertThat(plan.event().eventType())
                .isEqualTo(RoomEventType.ROOM_OWNERSHIP_TRANSFERRED);
        RoomOwnershipTransferredEventPayload payload =
                (RoomOwnershipTransferredEventPayload)
                        plan.event().payload();
        assertThat(payload.previousOwner().role())
                .isEqualTo(MembershipRole.MEMBER);
        assertThat(payload.previousOwner().userId())
                .isEqualTo("owner-1");
        assertThat(payload.newOwner().role())
                .isEqualTo(MembershipRole.OWNER);
        assertThat(payload.newOwner().userId())
                .isEqualTo("owner-2");
        assertThat(plan.userRecipients())
                .containsExactlyInAnyOrder("owner-1", "owner-2");
    }

    private static void assertClosed(RoomEventDeliveryPlan plan) {
        assertThat(plan.event().eventType())
                .isEqualTo(RoomEventType.ROOM_CLOSED);
        RoomClosedEventPayload payload =
                (RoomClosedEventPayload) plan.event().payload();
        assertThat(payload.roomStatus()).isEqualTo(RoomStatus.CLOSED);
        assertThat(payload.owner().role())
                .isEqualTo(MembershipRole.OWNER);
        assertThat(payload.owner().userId()).isEqualTo("owner-1");
        assertThat(payload.owner().status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(plan.userRecipients()).containsExactly("owner-1");
    }

    private static void assertSettings(
            RoomEventDeliveryPlan plan
    ) {
        assertThat(plan.event().eventType())
                .isEqualTo(RoomEventType.ROOM_SETTINGS_UPDATED);
        RoomSettingsUpdatedEventPayload payload =
                (RoomSettingsUpdatedEventPayload)
                        plan.event().payload();
        assertThat(payload.roomVersion()).isEqualTo(8);
        assertThat(payload.roomStatus()).isEqualTo(RoomStatus.ACTIVE);
        assertThat(payload.name()).isEqualTo("Updated room");
        assertThat(payload.description())
                .isEqualTo("Updated description");
        assertThat(payload.categories())
                .containsExactly(
                        com.hamcheeze.chat.room.RoomCategory.POLICY);
        assertThat(payload.visibility())
                .isEqualTo(RoomVisibility.UNLISTED);
        assertThat(payload.joinPolicy())
                .isEqualTo(JoinPolicy.INVITE_ONLY);
        assertThat(plan.userRecipients()).containsExactly("owner-1");
    }

    private static RoomCommandResult settings(
            RoomCommandResultCode code
    ) {
        return RoomCommandResult.settings(
                code,
                Room.restore(
                        "room-1",
                        "Updated room",
                        "Updated description",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                        "owner-1",
                        RoomStatus.ACTIVE,
                        RoomVisibility.UNLISTED,
                        JoinPolicy.INVITE_ONLY,
                        1,
                        EMITTED_AT.minusSeconds(60),
                        null,
                        8));
    }

    private static RoomCommandExecution execution(
            RoomCommandResult result,
            boolean replayed
    ) {
        return new RoomCommandExecution(REQUEST_ID, result, replayed);
    }

    private static RoomCommandResult result(
            RoomCommandResultCode code
    ) {
        return switch (code) {
            case ROOM_CREATED -> result(
                    RoomCommandType.CREATE_ROOM,
                    code,
                    null,
                    null,
                    "owner-membership",
                    "owner-1",
                    null,
                    null,
                    null,
                    null,
                    0L,
                    null,
                    0L,
                    null,
                    null);
            case JOINED, REJOINED, ALREADY_ACTIVE,
                    LEFT, ALREADY_LEFT -> result(
                    code == RoomCommandResultCode.LEFT
                            || code == RoomCommandResultCode.ALREADY_LEFT
                            ? RoomCommandType.LEAVE_ROOM
                            : RoomCommandType.JOIN_ROOM,
                    code,
                    "membership-1",
                    "member-1",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    4L,
                    3L,
                    null,
                    null,
                    null);
            case OWNERSHIP_TRANSFERRED -> result(
                    RoomCommandType.TRANSFER_OWNERSHIP,
                    code,
                    null,
                    null,
                    null,
                    null,
                    "owner-1",
                    "owner-2",
                    "membership-1",
                    "membership-2",
                    4L,
                    null,
                    null,
                    3L,
                    2L);
            case BANNED, ALREADY_BANNED,
                    UNBANNED, ALREADY_UNBANNED -> result(
                    code == RoomCommandResultCode.BANNED
                            || code == RoomCommandResultCode.ALREADY_BANNED
                            ? RoomCommandType.BAN_MEMBER
                            : RoomCommandType.UNBAN_MEMBER,
                    code,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    "target-1",
                    "membership-1",
                    4L,
                    3L,
                    null,
                    null,
                    null);
            case CLOSED, ALREADY_CLOSED -> result(
                    RoomCommandType.CLOSE_ROOM,
                    code,
                    null,
                    null,
                    "owner-membership",
                    "owner-1",
                    null,
                    null,
                    null,
                    null,
                    5L,
                    null,
                    4L,
                    null,
                    null);
            default -> throw new IllegalArgumentException(
                    "Unsupported fixture: " + code);
        };
    }

    private static RoomCommandResult result(
            RoomCommandType commandType,
            RoomCommandResultCode code,
            String membershipId,
            String membershipUserId,
            String ownerMembershipId,
            String ownerUserId,
            String previousOwnerUserId,
            String newOwnerUserId,
            String targetUserId,
            String targetMembershipId,
            Long roomVersion,
            Long membershipVersion,
            Long ownerMembershipVersion,
            Long previousOwnerMembershipVersion,
            Long newOwnerMembershipVersion
    ) {
        return new RoomCommandResult(
                commandType,
                code,
                "room-1",
                membershipId,
                membershipUserId,
                ownerMembershipId,
                ownerUserId,
                previousOwnerUserId,
                newOwnerUserId,
                previousOwnerUserId == null
                        ? null : "membership-1",
                newOwnerUserId == null
                        ? null : "membership-2",
                targetUserId,
                targetMembershipId,
                roomVersion,
                membershipVersion,
                ownerMembershipVersion,
                previousOwnerMembershipVersion,
                newOwnerMembershipVersion);
    }
}
