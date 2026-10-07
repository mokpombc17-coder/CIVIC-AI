package com.hamcheeze.chat.room;

import java.time.Instant;
import java.util.Objects;

public final class RoomParticipation {

    private final String participationId;
    private final String membershipId;
    private final String roomId;
    private final ParticipationOrigin origin;
    private final ParticipationStatus status;
    private final MembershipProfile profile;
    private final Instant joinedAt;
    private final Instant endedAt;
    private final ParticipationEndReason endReason;
    private final long enteredAfterMessageSequence;
    private final Long endedAfterMessageSequence;
    private final long version;

    private RoomParticipation(
            String participationId,
            String membershipId,
            String roomId,
            ParticipationOrigin origin,
            ParticipationStatus status,
            MembershipProfile profile,
            Instant joinedAt,
            Instant endedAt,
            ParticipationEndReason endReason,
            long enteredAfterMessageSequence,
            Long endedAfterMessageSequence,
            long version
    ) {
        this.participationId = requireText(
                participationId, "participationId");
        this.membershipId = requireText(membershipId, "membershipId");
        this.roomId = requireText(roomId, "roomId");
        this.origin = Objects.requireNonNull(origin, "origin");
        this.status = Objects.requireNonNull(status, "status");
        this.profile = Objects.requireNonNull(profile, "profile");
        this.joinedAt = Objects.requireNonNull(joinedAt, "joinedAt");
        if (enteredAfterMessageSequence < 0) {
            throw new IllegalArgumentException(
                    "enteredAfterMessageSequence must not be negative");
        }
        if (endedAfterMessageSequence != null
                && endedAfterMessageSequence < 0) {
            throw new IllegalArgumentException(
                    "endedAfterMessageSequence must not be negative");
        }
        if (version < 0) {
            throw new IllegalArgumentException(
                    "version must not be negative");
        }
        validateLifecycle(
                status,
                joinedAt,
                endedAt,
                endReason,
                endedAfterMessageSequence);
        this.endedAt = endedAt;
        this.endReason = endReason;
        this.enteredAfterMessageSequence = enteredAfterMessageSequence;
        this.endedAfterMessageSequence = endedAfterMessageSequence;
        this.version = version;
    }

    public static RoomParticipation normal(
            String participationId,
            Membership membership
    ) {
        Objects.requireNonNull(membership, "membership");
        if (membership.status() != MembershipStatus.ACTIVE) {
            throw new IllegalArgumentException(
                    "normal participation requires an active membership");
        }
        return active(
                participationId,
                membership,
                ParticipationOrigin.NORMAL);
    }

    public static RoomParticipation legacyActive(Membership membership) {
        Objects.requireNonNull(membership, "membership");
        if (membership.status() != MembershipStatus.ACTIVE) {
            throw new IllegalArgumentException(
                    "legacy active participation requires an active membership");
        }
        return active(
                RoomParticipationIds.legacy(membership.membershipId()),
                membership,
                ParticipationOrigin.LEGACY);
    }

    public static RoomParticipation legacyEnded(Membership membership) {
        Objects.requireNonNull(membership, "membership");
        if (membership.status() == MembershipStatus.ACTIVE) {
            throw new IllegalArgumentException(
                    "legacy ended participation requires an ended membership");
        }
        ParticipationEndReason reason =
                membership.status() == MembershipStatus.BANNED
                        ? ParticipationEndReason.BANNED
                        : ParticipationEndReason.LEFT;
        Instant endedAt = membership.leftAt() != null
                ? membership.leftAt()
                : membership.bannedAt();
        return new RoomParticipation(
                RoomParticipationIds.legacy(membership.membershipId()),
                membership.membershipId(),
                membership.roomId(),
                ParticipationOrigin.LEGACY,
                ParticipationStatus.ENDED,
                membership.profile(),
                membership.joinedAt(),
                endedAt,
                reason,
                membership.messageVisibleAfterSequence(),
                null,
                0);
    }

    public static RoomParticipation restore(
            String participationId,
            String membershipId,
            String roomId,
            ParticipationOrigin origin,
            ParticipationStatus status,
            MembershipProfile profile,
            Instant joinedAt,
            Instant endedAt,
            ParticipationEndReason endReason,
            long enteredAfterMessageSequence,
            Long endedAfterMessageSequence,
            long version
    ) {
        return new RoomParticipation(
                participationId,
                membershipId,
                roomId,
                origin == null ? ParticipationOrigin.LEGACY : origin,
                status,
                profile,
                joinedAt,
                endedAt,
                endReason,
                enteredAfterMessageSequence,
                endedAfterMessageSequence,
                version);
    }

    private static RoomParticipation active(
            String participationId,
            Membership membership,
            ParticipationOrigin origin
    ) {
        return new RoomParticipation(
                participationId,
                membership.membershipId(),
                membership.roomId(),
                origin,
                ParticipationStatus.ACTIVE,
                membership.profile(),
                membership.joinedAt(),
                null,
                null,
                membership.messageVisibleAfterSequence(),
                null,
                0);
    }

    public RoomParticipation end(
            Instant endedAt,
            long endedAfterMessageSequence,
            ParticipationEndReason reason
    ) {
        if (status != ParticipationStatus.ACTIVE) {
            throw new IllegalStateException(
                    "only an active participation can end");
        }
        return new RoomParticipation(
                participationId,
                membershipId,
                roomId,
                origin,
                ParticipationStatus.ENDED,
                profile,
                joinedAt,
                Objects.requireNonNull(endedAt, "endedAt"),
                Objects.requireNonNull(reason, "reason"),
                enteredAfterMessageSequence,
                endedAfterMessageSequence,
                version + 1);
    }

    private static void validateLifecycle(
            ParticipationStatus status,
            Instant joinedAt,
            Instant endedAt,
            ParticipationEndReason endReason,
            Long endedAfterMessageSequence
    ) {
        if (status == ParticipationStatus.ACTIVE) {
            if (endedAt != null || endReason != null
                    || endedAfterMessageSequence != null) {
                throw new IllegalArgumentException(
                        "active participation must not have an end state");
            }
            return;
        }
        if (endedAt == null || endReason == null
                || endedAt.isBefore(joinedAt)) {
            throw new IllegalArgumentException(
                    "ended participation requires a valid end state");
        }
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
        return value;
    }

    public String participationId() {
        return participationId;
    }

    public String membershipId() {
        return membershipId;
    }

    public String roomId() {
        return roomId;
    }

    public ParticipationOrigin origin() {
        return origin;
    }

    public ParticipationStatus status() {
        return status;
    }

    public MembershipProfile profile() {
        return profile;
    }

    public Instant joinedAt() {
        return joinedAt;
    }

    public Instant endedAt() {
        return endedAt;
    }

    public ParticipationEndReason endReason() {
        return endReason;
    }

    public long enteredAfterMessageSequence() {
        return enteredAfterMessageSequence;
    }

    public Long endedAfterMessageSequence() {
        return endedAfterMessageSequence;
    }

    public long version() {
        return version;
    }
}
