package com.hamcheeze.chat.room.creation.mongo;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.creation.RoomCreationDecisionActorType;
import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

@Document(
        collection =
                MongoRoomCreationRequestDocument.COLLECTION_NAME)
public record MongoRoomCreationRequestDocument(
        @MongoId(FieldType.STRING)
        String creationRequestId,
        int schemaVersion,
        String clientRequestId,
        String requestFingerprint,
        String requesterUserId,
        String name,
        String description,
        List<String> categoryIds,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        RoomCreationRequestStatus status,
        Integer pendingSlot,
        Instant requestedAt,
        Instant resolvedAt,
        RoomCreationDecisionActorType decisionActorType,
        String decidedByAdminId,
        String rejectionReason,
        String approvedRoomId,
        String ownerMembershipId,
        Long roomVersion,
        Long ownerMembershipVersion,
        long version
) {

    public static final String COLLECTION_NAME =
            "chat_room_creation_requests";
    public static final int LEGACY_CATEGORY_SCHEMA_VERSION = 1;
    public static final int CURRENT_SCHEMA_VERSION = 2;

    @PersistenceCreator
    public MongoRoomCreationRequestDocument {
        Objects.requireNonNull(
                creationRequestId,
                "creationRequestId");
        Objects.requireNonNull(clientRequestId, "clientRequestId");
        Objects.requireNonNull(
                requestFingerprint,
                "requestFingerprint");
        Objects.requireNonNull(
                requesterUserId,
                "requesterUserId");
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(description, "description");
        categoryIds = List.copyOf(
                Objects.requireNonNull(categoryIds, "categoryIds"));
        Objects.requireNonNull(visibility, "visibility");
        Objects.requireNonNull(joinPolicy, "joinPolicy");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(requestedAt, "requestedAt");
    }

    public static MongoRoomCreationRequestDocument fromDomain(
            RoomCreationRequest request,
            Integer pendingSlot
    ) {
        Objects.requireNonNull(request, "request");
        if ((request.status()
                == RoomCreationRequestStatus.PENDING)
                != (pendingSlot != null)) {
            throw new IllegalArgumentException(
                    "only a pending request may occupy a slot");
        }
        if (pendingSlot != null && pendingSlot < 0) {
            throw new IllegalArgumentException(
                    "pendingSlot must be non-negative");
        }
        return new MongoRoomCreationRequestDocument(
                request.creationRequestId(),
                CURRENT_SCHEMA_VERSION,
                request.clientRequestId(),
                request.requestFingerprint(),
                request.requesterUserId(),
                request.name(),
                request.description(),
                request.categoryIds(),
                request.visibility(),
                request.joinPolicy(),
                request.status(),
                pendingSlot,
                request.requestedAt(),
                request.resolvedAt(),
                request.decisionActorType(),
                request.decidedByAdminId(),
                request.rejectionReason(),
                request.approvedRoomId(),
                request.ownerMembershipId(),
                request.roomVersion(),
                request.ownerMembershipVersion(),
                request.version());
    }

    public RoomCreationRequest toDomain() {
        requireCurrentSchema();
        if ((status == RoomCreationRequestStatus.PENDING)
                != (pendingSlot != null)) {
            throw new IllegalStateException(
                    "Pending slot does not match request status");
        }
        return RoomCreationRequest.restore(
                creationRequestId,
                clientRequestId,
                requestFingerprint,
                requesterUserId,
                name,
                description,
                categoryIds,
                visibility,
                joinPolicy,
                status,
                requestedAt,
                resolvedAt,
                decisionActorType,
                decidedByAdminId,
                rejectionReason,
                approvedRoomId,
                ownerMembershipId,
                roomVersion,
                ownerMembershipVersion,
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
