package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.application.ActiveRoomMembershipQuotaDecision;
import com.hamcheeze.chat.room.application.ActiveRoomMembershipQuotaGuard;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.mongodb.client.model.CountOptions;
import org.bson.Document;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

public final class MongoActiveRoomMembershipQuotaGuard
        implements ActiveRoomMembershipQuotaGuard {

    private final MongoOperations mongoOperations;
    private final Duration countQueryMaxTime;

    public MongoActiveRoomMembershipQuotaGuard(
            MongoOperations mongoOperations,
            Duration countQueryMaxTime
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
        this.countQueryMaxTime = Objects.requireNonNull(
                countQueryMaxTime,
                "countQueryMaxTime");
    }

    @Override
    public ActiveRoomMembershipQuotaDecision checkBeforeIncrease(
            String userId,
            int maxActiveRooms,
            Instant transitionTime
    ) {
        if (!TransactionSynchronizationManager
                .isActualTransactionActive()) {
            throw new RoomCommandExecutionException(
                    RoomCommandFailureKind.PERMANENT,
                    "Active room quota guard requires a transaction");
        }
        String resolvedUserId = requireNonBlank(userId, "userId");
        if (maxActiveRooms < 1) {
            throw new IllegalArgumentException(
                    "maxActiveRooms must be at least 1");
        }
        Instant resolvedTransitionTime = Objects.requireNonNull(
                transitionTime,
                "transitionTime");
        touchAndValidateLock(
                resolvedUserId,
                resolvedTransitionTime);
        long activeRooms = countActiveMemberships(
                resolvedUserId,
                maxActiveRooms);
        return activeRooms >= maxActiveRooms
                ? ActiveRoomMembershipQuotaDecision.LIMIT_REACHED
                : ActiveRoomMembershipQuotaDecision.ALLOWED;
    }

    private void touchAndValidateLock(
            String userId,
            Instant transitionTime
    ) {
        validateExistingLockIfPresent(userId);
        Query query = Query.query(Criteria.where("_id").is(userId));
        Update update = new Update()
                .setOnInsert(
                        "schemaVersion",
                        MongoUserActiveRoomQuotaLockDocument
                                .SCHEMA_VERSION)
                .inc("revision", 1L)
                .set("updatedAt", Date.from(transitionTime));
        Document document = mongoOperations.findAndModify(
                query,
                update,
                FindAndModifyOptions.options()
                        .upsert(true)
                        .returnNew(true),
                Document.class,
                MongoUserActiveRoomQuotaLockDocument.COLLECTION_NAME);
        validateLock(document, userId);
    }

    private void validateExistingLockIfPresent(String userId) {
        Document existing = mongoOperations.execute(
                MongoUserActiveRoomQuotaLockDocument.COLLECTION_NAME,
                collection -> collection.find(
                                new Document("_id", userId))
                        .first());
        if (existing != null) {
            validateLock(existing, userId);
        }
    }

    private long countActiveMemberships(
            String userId,
            int maxActiveRooms
    ) {
        Document filter = new Document("userId", userId)
                .append("status", MembershipStatus.ACTIVE.name());
        CountOptions options = new CountOptions()
                .limit(maxActiveRooms)
                .hintString(MongoRoomSchemaInitializer
                        .MEMBERSHIP_USER_STATUS_INDEX_NAME)
                .maxTime(
                        countQueryMaxTime.toMillis(),
                        TimeUnit.MILLISECONDS);
        return mongoOperations.execute(
                MongoMembershipDocument.COLLECTION_NAME,
                collection -> collection.countDocuments(
                        filter,
                        options));
    }

    private static void validateLock(
            Document document,
            String expectedUserId
    ) {
        if (document == null) {
            throw malformedLock(
                    "Quota lock update returned no document");
        }
        if (!(document.get("_id") instanceof String userId)
                || !expectedUserId.equals(userId)) {
            throw malformedLock("Quota lock _id is malformed");
        }
        if (!(document.get("schemaVersion")
                instanceof Integer schemaVersion)
                || schemaVersion
                != MongoUserActiveRoomQuotaLockDocument
                        .SCHEMA_VERSION) {
            throw malformedLock(
                    "Quota lock schemaVersion is unsupported");
        }
        if (!(document.get("revision") instanceof Long revision)
                || revision < 1) {
            throw malformedLock(
                    "Quota lock revision is malformed");
        }
        if (!(document.get("updatedAt") instanceof Date)) {
            throw malformedLock(
                    "Quota lock updatedAt is malformed");
        }
    }

    private static RoomCommandExecutionException malformedLock(
            String message
    ) {
        return new RoomCommandExecutionException(
                RoomCommandFailureKind.PERMANENT,
                message,
                null);
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
