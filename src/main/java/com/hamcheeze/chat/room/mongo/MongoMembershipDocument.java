package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;
import java.util.Objects;

@Document(collection = MongoMembershipDocument.COLLECTION_NAME)
public record MongoMembershipDocument(
        @MongoId(FieldType.STRING)
        String membershipId,
        int schemaVersion,
        String roomId,
        String userId,
        MembershipRole role,
        MembershipStatus status,
        MongoMembershipProfileDocument profile,
        Instant joinedAt,
        Instant leftAt,
        Instant bannedAt,
        Long messageVisibleAfterSequence,
        Long historyVisibleAfterSequence,
        long version
) {

    public static final String COLLECTION_NAME = "chat_memberships";
    public static final int CURRENT_SCHEMA_VERSION = 3;

    @PersistenceCreator
    public MongoMembershipDocument {
        Objects.requireNonNull(membershipId, "membershipId");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(role, "role");
        Objects.requireNonNull(status, "status");
        if (schemaVersion == CURRENT_SCHEMA_VERSION) {
            Objects.requireNonNull(profile, "profile");
        }
        Objects.requireNonNull(joinedAt, "joinedAt");
        Objects.requireNonNull(
                messageVisibleAfterSequence,
                "messageVisibleAfterSequence");
        if (messageVisibleAfterSequence < 0) {
            throw new IllegalArgumentException(
                    "messageVisibleAfterSequence must not be negative");
        }
        if (historyVisibleAfterSequence != null
                && (historyVisibleAfterSequence < 0
                || historyVisibleAfterSequence
                > messageVisibleAfterSequence)) {
            throw new IllegalArgumentException(
                    "historyVisibleAfterSequence must be between 0 and "
                            + "messageVisibleAfterSequence");
        }
    }

    public static MongoMembershipDocument fromDomain(
            Membership membership
    ) {
        Objects.requireNonNull(membership, "membership");
        return new MongoMembershipDocument(
                membership.membershipId(),
                CURRENT_SCHEMA_VERSION,
                membership.roomId(),
                membership.userId(),
                membership.role(),
                membership.status(),
                MongoMembershipProfileDocument.fromDomain(
                        membership.profile()),
                membership.joinedAt(),
                membership.leftAt(),
                membership.bannedAt(),
                membership.messageVisibleAfterSequence(),
                membership.historyVisibleAfterSequence(),
                membership.version());
    }

    // Read-only projections never use the history boundary, so they keep
    // the join boundary for memberships stored before join history.
    public Membership toDomain() {
        return toDomain(0);
    }

    public Membership toDomain(long joinHistoryMessageCount) {
        requireCurrentSchema();
        return Membership.restore(
                membershipId,
                roomId,
                userId,
                role,
                status,
                profile.toDomain(),
                joinedAt,
                leftAt,
                bannedAt,
                messageVisibleAfterSequence,
                historyVisibleAfterSequence == null
                        ? legacyHistoryVisibleAfterSequence(
                                messageVisibleAfterSequence,
                                joinHistoryMessageCount)
                        : historyVisibleAfterSequence,
                version);
    }

    // Memberships written before join history have no history boundary.
    // They get the same boundary a join would have produced.
    public static long legacyHistoryVisibleAfterSequence(
            long messageVisibleAfterSequence,
            long joinHistoryMessageCount
    ) {
        return Math.max(
                0L,
                messageVisibleAfterSequence - joinHistoryMessageCount);
    }

    private void requireCurrentSchema() {
        if (schemaVersion != CURRENT_SCHEMA_VERSION) {
            throw new IllegalStateException(
                    "Unsupported schemaVersion "
                            + schemaVersion
                            + " in "
                            + COLLECTION_NAME);
        }
    }
}
