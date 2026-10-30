package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.ParticipationEndReason;
import com.hamcheeze.chat.room.ParticipationOrigin;
import com.hamcheeze.chat.room.ParticipationStatus;
import com.hamcheeze.chat.room.RoomParticipation;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;
import java.util.Objects;

@Document(collection = MongoRoomParticipationDocument.COLLECTION_NAME)
public record MongoRoomParticipationDocument(
        @MongoId(FieldType.STRING)
        String participationId,
        int schemaVersion,
        String membershipId,
        String roomId,
        ParticipationOrigin origin,
        ParticipationStatus status,
        String userLabel,
        MongoMembershipProfileDocument profile,
        Instant joinedAt,
        Instant endedAt,
        ParticipationEndReason endReason,
        long enteredAfterMessageSequence,
        Long endedAfterMessageSequence,
        long version
) {

    public static final String COLLECTION_NAME =
            "chat_room_participations";
    public static final int CURRENT_SCHEMA_VERSION = 1;

    @PersistenceCreator
    public MongoRoomParticipationDocument {
        Objects.requireNonNull(participationId, "participationId");
        Objects.requireNonNull(membershipId, "membershipId");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(profile, "profile");
        Objects.requireNonNull(joinedAt, "joinedAt");
        if (schemaVersion != CURRENT_SCHEMA_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported participation schema version");
        }
    }

    public static MongoRoomParticipationDocument fromDomain(
            RoomParticipation participation
    ) {
        Objects.requireNonNull(participation, "participation");
        return new MongoRoomParticipationDocument(
                participation.participationId(),
                CURRENT_SCHEMA_VERSION,
                participation.membershipId(),
                participation.roomId(),
                participation.origin(),
                participation.status(),
                participation.userLabel(),
                MongoMembershipProfileDocument.fromDomain(
                        participation.profile()),
                participation.joinedAt(),
                participation.endedAt(),
                participation.endReason(),
                participation.enteredAfterMessageSequence(),
                participation.endedAfterMessageSequence(),
                participation.version());
    }

    public RoomParticipation toDomain() {
        return RoomParticipation.restore(
                participationId,
                membershipId,
                roomId,
                origin,
                status,
                userLabel,
                profile.toDomain(),
                joinedAt,
                endedAt,
                endReason,
                enteredAfterMessageSequence,
                endedAfterMessageSequence,
                version);
    }
}
