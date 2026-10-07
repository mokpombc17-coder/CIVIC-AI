package com.hamcheeze.chat.room.application.event;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomParticipationIds;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.event.RoomClosedEventPayload;
import com.hamcheeze.chat.room.event.RoomCreatedEventPayload;
import com.hamcheeze.chat.room.event.RoomEventDeliveryPlan;
import com.hamcheeze.chat.room.event.RoomEventEnvelope;
import com.hamcheeze.chat.room.event.RoomEventPayload;
import com.hamcheeze.chat.room.event.RoomEventType;
import com.hamcheeze.chat.room.event.RoomMemberChangedEventPayload;
import com.hamcheeze.chat.room.event.RoomMemberChangedState;
import com.hamcheeze.chat.room.event.RoomMemberState;
import com.hamcheeze.chat.room.event.RoomOwnershipTransferredEventPayload;
import com.hamcheeze.chat.room.event.RoomSettingsUpdatedEventPayload;
import com.hamcheeze.chat.room.label.RoomMemberUserLabelResolver;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomParticipationStore;
import com.hamcheeze.chat.userlabel.UserLabelDirectory;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.function.Function;

public final class RoomCommandEventMapper {

    private final BiFunction<String, String, String> userLabels;
    private final Function<String, String> participationIds;

    public RoomCommandEventMapper(
            MembershipStore membershipStore,
            RoomParticipationStore participationStore,
            UserLabelDirectory userLabelDirectory
    ) {
        this(
                resolver(
                        membershipStore,
                        new RoomMemberUserLabelResolver(
                                userLabelDirectory)),
                membershipId -> participationStore
                        .findLatestByMembershipId(membershipId)
                        .map(participation ->
                                participation.participationId())
                        .orElseGet(() ->
                                RoomParticipationIds.legacy(
                                        membershipId)));
    }

    public RoomCommandEventMapper(
            MembershipStore membershipStore,
            UserLabelDirectory userLabelDirectory
    ) {
        this(
                resolver(
                        membershipStore,
                        new RoomMemberUserLabelResolver(
                                userLabelDirectory)),
                RoomParticipationIds::legacy);
    }

    RoomCommandEventMapper(
            BiFunction<String, String, String> userLabels
    ) {
        this(userLabels, RoomParticipationIds::legacy);
    }

    private RoomCommandEventMapper(
            BiFunction<String, String, String> userLabels,
            Function<String, String> participationIds
    ) {
        this.userLabels = Objects.requireNonNull(
                userLabels,
                "userLabels");
        this.participationIds = Objects.requireNonNull(
                participationIds,
                "participationIds");
    }

    static RoomCommandEventMapper disabled() {
        return new RoomCommandEventMapper((roomId, membershipId) -> {
            throw new IllegalStateException(
                    "Disabled Room event mapper cannot resolve labels");
        });
    }

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
                 CLOSED,
                 ROOM_SETTINGS_UPDATED -> true;
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
            case ROOM_SETTINGS_UPDATED ->
                    RoomEventType.ROOM_SETTINGS_UPDATED;
            default -> throw new IllegalArgumentException(
                    "Result does not produce a Room event: "
                            + result.code());
        };
    }

    private RoomEventPayload payload(
            RoomCommandResult result
    ) {
        return switch (result.code()) {
            case ROOM_CREATED -> new RoomCreatedEventPayload(
                    result.roomId(),
                    result.roomVersion(),
                    RoomStatus.ACTIVE,
                    new RoomMemberState(
                            result.ownerMembershipId(),
                            participationId(
                                    result.ownerMembershipId()),
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
                                    participationId(
                                            result.previousOwnerMembershipId()),
                                    MembershipRole.MEMBER,
                                    MembershipStatus.ACTIVE,
                                    result.previousOwnerMembershipVersion()),
                            new RoomMemberState(
                                    result.newOwnerMembershipId(),
                                    participationId(
                                            result.newOwnerMembershipId()),
                                    MembershipRole.OWNER,
                                    MembershipStatus.ACTIVE,
                                    result.newOwnerMembershipVersion()));
            case CLOSED -> new RoomClosedEventPayload(
                    result.roomId(),
                    result.roomVersion(),
                    RoomStatus.CLOSED,
                    new RoomMemberState(
                            result.ownerMembershipId(),
                            participationId(
                                    result.ownerMembershipId()),
                            MembershipRole.OWNER,
                            MembershipStatus.LEFT,
                            result.ownerMembershipVersion()));
            case ROOM_SETTINGS_UPDATED ->
                    new RoomSettingsUpdatedEventPayload(
                            result.roomId(),
                            result.roomVersion(),
                            RoomStatus.ACTIVE,
                            result.roomSettings().name(),
                            result.roomSettings().description(),
                            result.roomSettings().categoryIds(),
                            result.roomSettings().visibility(),
                            result.roomSettings().joinPolicy());
            default -> throw new IllegalArgumentException(
                    "Result does not produce a Room event: "
                            + result.code());
        };
    }

    private RoomMemberChangedEventPayload memberPayload(
            RoomCommandResult result,
            String membershipId,
            Long membershipVersion,
            MembershipStatus membershipStatus
    ) {
        return new RoomMemberChangedEventPayload(
                result.roomId(),
                result.roomVersion(),
                RoomStatus.ACTIVE,
                new RoomMemberChangedState(
                        membershipId,
                        participationId(membershipId),
                        userLabels.apply(result.roomId(), membershipId),
                        MembershipRole.MEMBER,
                        membershipStatus,
                        membershipVersion));
    }

    private String participationId(String membershipId) {
        return participationIds.apply(membershipId);
    }

    private static BiFunction<String, String, String> resolver(
            MembershipStore membershipStore,
            RoomMemberUserLabelResolver userLabels
    ) {
        Objects.requireNonNull(membershipStore, "membershipStore");
        Objects.requireNonNull(userLabels, "userLabels");
        return (roomId, membershipId) -> {
            Membership membership = membershipStore.findById(membershipId)
                    .orElseThrow(() -> new IllegalStateException(
                            "Room event membership is missing"));
            if (!roomId.equals(membership.roomId())) {
                throw new IllegalStateException(
                        "Room event membership room mismatch");
            }
            return userLabels.resolve(membership);
        };
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
            case ROOM_SETTINGS_UPDATED ->
                    Set.of(result.ownerUserId());
            default -> Set.of();
        };
    }
}
