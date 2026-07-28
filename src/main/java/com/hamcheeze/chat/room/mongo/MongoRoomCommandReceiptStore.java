package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.persistence.RoomCommandReceipt;
import com.hamcheeze.chat.room.persistence.RoomCommandReceiptStore;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public final class MongoRoomCommandReceiptStore
        implements RoomCommandReceiptStore {

    private final MongoOperations mongoOperations;

    public MongoRoomCommandReceiptStore(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public Optional<RoomCommandReceipt> findByRequest(
            String requesterUserId,
            String clientRequestId
    ) {
        Query query = Query.query(
                Criteria.where("requesterUserId")
                        .is(requireNonBlank(
                                requesterUserId,
                                "requesterUserId"))
                        .and("clientRequestId")
                        .is(canonicalUuid(clientRequestId)));
        MongoRoomCommandReceiptDocument document =
                mongoOperations.findOne(
                        query,
                        MongoRoomCommandReceiptDocument.class,
                        MongoRoomCommandReceiptDocument
                                .COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoRoomCommandReceiptDocument::toDomain);
    }

    @Override
    public void insert(RoomCommandReceipt receipt) {
        mongoOperations.insert(
                MongoRoomCommandReceiptDocument.fromDomain(
                        Objects.requireNonNull(
                                receipt,
                                "receipt")),
                MongoRoomCommandReceiptDocument.COLLECTION_NAME);
    }

    private static String canonicalUuid(String value) {
        String id = requireNonBlank(value, "clientRequestId");
        try {
            String canonical = UUID.fromString(id).toString();
            if (!canonical.equalsIgnoreCase(id)) {
                throw new IllegalArgumentException(
                        "clientRequestId must be a UUID");
            }
            return canonical;
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "clientRequestId must be a UUID",
                    exception);
        }
    }

    private static String requireNonBlank(
            String value,
            String fieldName
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
        return value;
    }
}
