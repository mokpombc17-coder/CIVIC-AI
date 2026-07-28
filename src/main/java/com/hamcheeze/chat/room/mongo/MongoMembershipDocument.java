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
        Instant joinedAt,
        Instant leftAt,
        Instant bannedAt,
        long version
) {

    public static final String COLLECTION_NAME = "chat_memberships";
    public static final int CURRENT_SCHEMA_VERSION = 1;

    @PersistenceCreator
    public MongoMembershipDocument {
        Objects.requireNonNull(membershipId, "membershipId");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(role, "role");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(joinedAt, "joinedAt");
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
                membership.joinedAt(),
                membership.leftAt(),
                membership.bannedAt(),
                membership.version());
    }

    public Membership toDomain() {
        requireCurrentSchema();
        return Membership.restore(
                membershipId,
                roomId,
                userId,
                role,
                status,
                joinedAt,
                leftAt,
                bannedAt,
                version);
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
