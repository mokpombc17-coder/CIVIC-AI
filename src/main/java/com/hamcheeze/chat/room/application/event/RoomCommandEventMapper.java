package com.hamcheeze.chat.room.application.event;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.event.RoomClosedEventPayload;
import com.hamcheeze.chat.room.event.RoomCreatedEventPayload;
import com.hamcheeze.chat.room.event.RoomEventDeliveryPlan;
import com.hamcheeze.chat.room.event.RoomEventEnvelope;
import com.hamcheeze.chat.room.event.RoomEventPayload;
import com.hamcheeze.chat.room.event.RoomEventType;
import com.hamcheeze.chat.room.event.RoomMemberChangedEventPayload;
import com.hamcheeze.chat.room.event.RoomMemberState;
import com.hamcheeze.chat.room.event.RoomOwnershipTransferredEventPayload;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

public final class RoomCommandEventMapper {

    public boolean supports(RoomCommandExecution execution) {
        Objects.requireNonNull(execution, "execution");
        if (execution.replayed()
                || execution.result().code().rejection()) {
            return false;
        }
        return switch (execution.result().code()) {
            case ROOM_CREATED,
                 JOINED,
                 REJOINED,
                 LEFT,
                 OWNERSHIP_TRANSFERRED,
                 BANNED,
                 UNBANNED,
                 CLOSED -> true;
            default -> false;
        };
    }

    public Optional<RoomEventDeliveryPlan> map(
            RoomCommandExecution execution,
            String eventId,
            Instant emittedAt
    ) {
        Objects.requireNonNull(execution, "execution");
        Objects.requireNonNull(emittedAt, "emittedAt");
        if (!supports(execution)) {
            return Optional.empty();
        }
        RoomCommandResult result = execution.result();
        RoomEventType eventType = eventType(result);
        RoomEventPayload payload = payload(result);
        Set<String> recipients = recipients(result);
        return Optional.of(new RoomEventDeliveryPlan(
                new RoomEventEnvelope(
                        RoomEventEnvelope.CURRENT_VERSION,
                        eventId,
                        eventType,
                        emittedAt,
                        payload),
                recipients));
    }

    private static RoomEventType eventType(
            RoomCommandResult result
    ) {
        return switch (result.code()) {
            case ROOM_CREATED -> RoomEventType.ROOM_CREATED;
            case JOINED -> RoomEventType.ROOM_MEMBER_JOINED;
            case REJOINED -> RoomEventType.ROOM_MEMBER_REJOINED;
            case LEFT -> RoomEventType.ROOM_MEMBER_LEFT;
            case OWNERSHIP_TRANSFERRED ->
                    RoomEventType.ROOM_OWNERSHIP_TRANSFERRED;
            case BANNED -> RoomEventType.ROOM_MEMBER_BANNED;
            case UNBANNED -> RoomEventType.ROOM_MEMBER_UNBANNED;
            case CLOSED -> RoomEventType.ROOM_CLOSED;
            default -> throw new IllegalArgumentException(
                    "Result does not produce a Room event: "
                            + result.code());
        };
    }

    private static RoomEventPayload payload(
            RoomCommandResult result
    ) {
        return switch (result.code()) {
            case ROOM_CREATED -> new RoomCreatedEventPayload(
                    result.roomId(),
                    result.roomVersion(),
                    RoomStatus.ACTIVE,
                    new RoomMemberState(
                            result.ownerMembershipId(),
                            MembershipRole.OWNER,
                            MembershipStatus.ACTIVE,
                            result.ownerMembershipVersion()));
            case JOINED, REJOINED -> memberPayload(
                    result,
                    result.membershipId(),
                    result.membershipVersion(),
                    MembershipStatus.ACTIVE);
            case LEFT -> memberPayload(
                    result,
                    result.membershipId(),
                    result.membershipVersion(),
                    MembershipStatus.LEFT);
            case BANNED -> memberPayload(
                    result,
                    result.targetMembershipId(),
                    result.membershipVersion(),
                    MembershipStatus.BANNED);
            case UNBANNED -> memberPayload(
                    result,
                    result.targetMembershipId(),
                    result.membershipVersion(),
                    MembershipStatus.LEFT);
            case OWNERSHIP_TRANSFERRED ->
                    new RoomOwnershipTransferredEventPayload(
                            result.roomId(),
                            result.roomVersion(),
                            RoomStatus.ACTIVE,
                            new RoomMemberState(
                                    result.previousOwnerMembershipId(),
                                    MembershipRole.MEMBER,
                                    MembershipStatus.ACTIVE,
                                    result.previousOwnerMembershipVersion()),
                            new RoomMemberState(
                                    result.newOwnerMembershipId(),
                                    MembershipRole.OWNER,
                                    MembershipStatus.ACTIVE,
                                    result.newOwnerMembershipVersion()));
            case CLOSED -> new RoomClosedEventPayload(
                    result.roomId(),
                    result.roomVersion(),
                    RoomStatus.CLOSED,
                    new RoomMemberState(
                            result.ownerMembershipId(),
                            MembershipRole.OWNER,
                            MembershipStatus.LEFT,
                            result.ownerMembershipVersion()));
            default -> throw new IllegalArgumentException(
                    "Result does not produce a Room event: "
                            + result.code());
        };
    }

    private static RoomMemberChangedEventPayload memberPayload(
            RoomCommandResult result,
            String membershipId,
            Long membershipVersion,
            MembershipStatus membershipStatus
    ) {
        return new RoomMemberChangedEventPayload(
                result.roomId(),
                result.roomVersion(),
                RoomStatus.ACTIVE,
                new RoomMemberState(
                        membershipId,
                        MembershipRole.MEMBER,
                        membershipStatus,
                        membershipVersion));
    }

    private static Set<String> recipients(
            RoomCommandResult result
    ) {
        return switch (result.code()) {
            case ROOM_CREATED -> Set.of(result.ownerUserId());
            case JOINED, REJOINED, LEFT ->
                    Set.of(result.membershipUserId());
            case OWNERSHIP_TRANSFERRED -> Set.of(
                    result.previousOwnerUserId(),
                    result.newOwnerUserId());
            case BANNED, UNBANNED ->
                    Set.of(result.targetUserId());
            case CLOSED -> Set.of(result.ownerUserId());
            default -> Set.of();
        };
    }
}
