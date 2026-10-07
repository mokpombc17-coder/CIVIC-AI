package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.RoomCreationResult;
import com.hamcheeze.chat.room.RoomMembershipTransitions;
import com.hamcheeze.chat.room.RoomParticipation;
import com.hamcheeze.chat.room.RoomParticipationIds;
import com.hamcheeze.chat.room.label.RoomMemberUserLabelResolver;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import com.hamcheeze.chat.room.persistence.RoomParticipationStore;
import com.hamcheeze.chat.room.persistence.RoomStore;
import com.hamcheeze.chat.userlabel.UserLabelDirectory;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Objects;

public final class ApprovedRoomCreator {

    private final RoomStore roomStore;
    private final MembershipStore membershipStore;
    private final RoomParticipationStore participationStore;
    private final boolean participationEnabled;
    private final RoomMembershipProperties membershipProperties;
    private final ActiveRoomMembershipQuotaGuard membershipQuotaGuard;
    private final ActiveRoomMembershipQuotaMetrics membershipQuotaMetrics;
    private final RoomMemberUserLabelResolver userLabels;

    public ApprovedRoomCreator(
            RoomStore roomStore,
            MembershipStore membershipStore,
            RoomParticipationStore participationStore,
            RoomParticipationProperties participationProperties,
            RoomMembershipProperties membershipProperties,
            ActiveRoomMembershipQuotaGuard membershipQuotaGuard,
            ActiveRoomMembershipQuotaMetrics membershipQuotaMetrics,
            UserLabelDirectory userLabelDirectory
    ) {
        this.roomStore = Objects.requireNonNull(
                roomStore,
                "roomStore");
        this.membershipStore = Objects.requireNonNull(
                membershipStore,
                "membershipStore");
        this.participationStore = participationStore;
        this.participationEnabled = Objects.requireNonNull(
                participationProperties,
                "participationProperties").enabled();
        this.membershipProperties = Objects.requireNonNull(
                membershipProperties,
                "membershipProperties");
        this.membershipQuotaGuard = Objects.requireNonNull(
                membershipQuotaGuard,
                "membershipQuotaGuard");
        this.membershipQuotaMetrics = Objects.requireNonNull(
                membershipQuotaMetrics,
                "membershipQuotaMetrics");
        this.userLabels = new RoomMemberUserLabelResolver(
                userLabelDirectory);
    }

    public ApprovedRoomCreator(
            RoomStore roomStore,
            MembershipStore membershipStore,
            RoomParticipationStore participationStore,
            RoomParticipationProperties participationProperties,
            RoomMembershipProperties membershipProperties,
            ActiveRoomMembershipQuotaGuard membershipQuotaGuard,
            ActiveRoomMembershipQuotaMetrics membershipQuotaMetrics
    ) {
        this(
                roomStore,
                membershipStore,
                participationStore,
                participationProperties,
                membershipProperties,
                membershipQuotaGuard,
                membershipQuotaMetrics,
                UserLabelDirectory.noop());
    }

    public ApprovedRoomCreator(
            RoomStore roomStore,
            MembershipStore membershipStore,
            RoomMembershipProperties membershipProperties,
            ActiveRoomMembershipQuotaGuard membershipQuotaGuard,
            ActiveRoomMembershipQuotaMetrics membershipQuotaMetrics
    ) {
        this(
                roomStore,
                membershipStore,
                null,
                new RoomParticipationProperties(),
                membershipProperties,
                membershipQuotaGuard,
                membershipQuotaMetrics,
                UserLabelDirectory.noop());
    }

    public ApprovedRoomCreationResult create(
            ApprovedRoomCreation request
    ) {
        ApprovedRoomCreation creation = Objects.requireNonNull(
                request,
                "request");
        requireTransaction();
        if (checkQuota(creation)
                == ActiveRoomMembershipQuotaDecision.LIMIT_REACHED) {
            return ApprovedRoomCreationResult.quotaExceeded();
        }
        RoomCreationResult result =
                RoomMembershipTransitions.createRoomWithCategoryIds(
                        creation.roomId(),
                        creation.name(),
                        creation.description(),
                        creation.categoryIds(),
                        creation.ownerMembershipId(),
                        creation.ownerUserId(),
                        creation.visibility(),
                        creation.joinPolicy(),
                        creation.createdAt());
        roomStore.insert(result.room());
        membershipStore.insert(result.ownerMembership());
        if (participationEnabled && participationStore != null) {
            participationStore.insert(RoomParticipation.normal(
                    RoomParticipationIds.normal(
                            result.ownerMembership().membershipId()),
                    result.ownerMembership(),
                    userLabels.resolve(result.ownerMembership())));
        }
        return ApprovedRoomCreationResult.created(result);
    }

    private ActiveRoomMembershipQuotaDecision checkQuota(
            ApprovedRoomCreation creation
    ) {
        if (creation.limitMode()
                == ActiveRoomMembershipLimitMode.EXEMPT) {
            membershipQuotaMetrics.recordExempted(
                    RoomCommandType.CREATE_ROOM);
            return ActiveRoomMembershipQuotaDecision.ALLOWED;
        }
        return membershipQuotaMetrics.recordCheck(
                RoomCommandType.CREATE_ROOM,
                () -> membershipQuotaGuard.checkBeforeIncrease(
                        creation.ownerUserId(),
                        membershipProperties
                                .maxActiveRoomsPerUser(),
                        creation.createdAt()));
    }

    private static void requireTransaction() {
        if (!TransactionSynchronizationManager
                .isActualTransactionActive()) {
            throw new IllegalStateException(
                    "Approved Room creation requires a transaction");
        }
    }
}
