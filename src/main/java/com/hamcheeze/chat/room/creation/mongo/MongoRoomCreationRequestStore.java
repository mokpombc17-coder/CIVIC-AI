package com.hamcheeze.chat.room.creation.mongo;

import com.hamcheeze.chat.room.application.idempotency.RoomClientRequestId;
import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestInsertResult;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestSlice;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestStore;
import com.mongodb.client.result.UpdateResult;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.ReplaceOptions;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class MongoRoomCreationRequestStore
        implements RoomCreationRequestStore {

    private static final int MAX_SUPPORTED_PENDING_REQUESTS = 100;

    private final MongoOperations mongoOperations;

    public MongoRoomCreationRequestStore(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public RoomCreationRequestInsertResult insertPending(
            RoomCreationRequest request,
            int maxPendingRequestsPerUser
    ) {
        RoomCreationRequest pending = Objects.requireNonNull(
                request,
                "request");
        if (pending.status() != RoomCreationRequestStatus.PENDING
                || pending.version() != 0) {
            throw new IllegalArgumentException(
                    "only a new pending request may be inserted");
        }
        if (maxPendingRequestsPerUser < 1
                || maxPendingRequestsPerUser
                > MAX_SUPPORTED_PENDING_REQUESTS) {
            throw new IllegalArgumentException(
                    "maxPendingRequestsPerUser must be between 1 and 100");
        }

        for (int slot = 0;
                slot < maxPendingRequestsPerUser;
                slot++) {
            try {
                mongoOperations.insert(
                        MongoRoomCreationRequestDocument.fromDomain(
                                pending,
                                slot),
                        MongoRoomCreationRequestDocument
                                .COLLECTION_NAME);
                return RoomCreationRequestInsertResult.inserted(
                        pending);
            } catch (DuplicateKeyException exception) {
                Optional<RoomCreationRequest> existing =
                        findByRequest(
                                pending.requesterUserId(),
                                pending.clientRequestId());
                if (existing.isPresent()) {
                    return RoomCreationRequestInsertResult.existing(
                            existing.orElseThrow());
                }
                if (findById(pending.creationRequestId()).isPresent()) {
                    throw exception;
                }
            }
        }
        return RoomCreationRequestInsertResult.limitReached();
    }

    @Override
    public Optional<RoomCreationRequest> findById(
            String creationRequestId
    ) {
        MongoRoomCreationRequestDocument document =
                mongoOperations.findById(
                        requireNonBlank(
                                creationRequestId,
                                "creationRequestId"),
                        MongoRoomCreationRequestDocument.class,
                        MongoRoomCreationRequestDocument
                                .COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoRoomCreationRequestDocument::toDomain);
    }

    @Override
    public Optional<RoomCreationRequest> findByRequest(
            String requesterUserId,
            String clientRequestId
    ) {
        Query query = Query.query(new Criteria().andOperator(
                Criteria.where("requesterUserId").is(
                        requireNonBlank(
                                requesterUserId,
                                "requesterUserId")),
                Criteria.where("clientRequestId").is(
                        RoomClientRequestId.canonicalize(
                                clientRequestId))));
        MongoRoomCreationRequestDocument document =
                mongoOperations.findOne(
                        query,
                        MongoRoomCreationRequestDocument.class,
                        MongoRoomCreationRequestDocument
                                .COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoRoomCreationRequestDocument::toDomain);
    }

    @Override
    public boolean replacePendingIfVersionMatches(
            RoomCreationRequest request,
            long expectedVersion
    ) {
        RoomCreationRequest replacement = Objects.requireNonNull(
                request,
                "request");
        if (!replacement.status().terminal()
                || expectedVersion < 0
                || expectedVersion == Long.MAX_VALUE
                || replacement.version() != expectedVersion + 1) {
            throw new IllegalArgumentException(
                    "replacement must be the next terminal version");
        }
        Query query = Query.query(new Criteria().andOperator(
                Criteria.where("_id").is(
                        replacement.creationRequestId()),
                Criteria.where("status").is(
                        RoomCreationRequestStatus.PENDING),
                Criteria.where("version").is(expectedVersion)));
        UpdateResult result = mongoOperations.replace(
                query,
                MongoRoomCreationRequestDocument.fromDomain(
                        replacement,
                        null),
                ReplaceOptions.none(),
                MongoRoomCreationRequestDocument.COLLECTION_NAME);
        return result.getModifiedCount() == 1;
    }

    @Override
    public long countPendingByRequester(String requesterUserId) {
        Query query = Query.query(new Criteria().andOperator(
                Criteria.where("requesterUserId").is(
                        requireNonBlank(
                                requesterUserId,
                                "requesterUserId")),
                Criteria.where("status").is(
                        RoomCreationRequestStatus.PENDING)));
        return mongoOperations.count(
                query,
                MongoRoomCreationRequestDocument.class,
                MongoRoomCreationRequestDocument.COLLECTION_NAME);
    }

    @Override
    public RoomCreationRequestSlice findByRequester(
            String requesterUserId,
            Instant afterRequestedAt,
            String afterCreationRequestId,
            int limit
    ) {
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException(
                    "limit must be between 1 and 100");
        }
        if ((afterRequestedAt == null)
                != (afterCreationRequestId == null)) {
            throw new IllegalArgumentException(
                    "cursor fields must be provided together");
        }
        Criteria requester = Criteria.where("requesterUserId").is(
                requireNonBlank(requesterUserId, "requesterUserId"));
        Criteria criteria = requester;
        if (afterRequestedAt != null) {
            criteria = new Criteria().andOperator(
                    requester,
                    new Criteria().orOperator(
                            Criteria.where("requestedAt")
                                    .gt(afterRequestedAt),
                            new Criteria().andOperator(
                                    Criteria.where("requestedAt")
                                            .is(afterRequestedAt),
                                    Criteria.where("_id").gt(
                                            requireNonBlank(
                                                    afterCreationRequestId,
                                                    "afterCreationRequestId")))));
        }
        Query query = Query.query(criteria)
                .with(Sort.by(
                        Sort.Order.asc("requestedAt"),
                        Sort.Order.asc("_id")))
                .limit(limit + 1);
        List<RoomCreationRequest> requests = mongoOperations.find(
                        query,
                        MongoRoomCreationRequestDocument.class,
                        MongoRoomCreationRequestDocument.COLLECTION_NAME)
                .stream()
                .map(MongoRoomCreationRequestDocument::toDomain)
                .toList();
        boolean hasNext = requests.size() > limit;
        return new RoomCreationRequestSlice(
                hasNext ? requests.subList(0, limit) : requests,
                hasNext);
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
