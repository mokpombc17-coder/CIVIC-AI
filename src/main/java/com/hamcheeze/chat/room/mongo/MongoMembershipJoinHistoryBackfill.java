package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.application.RoomMembershipProperties;
import com.mongodb.client.model.Filters;
import com.mongodb.client.result.UpdateResult;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.MongoOperations;

import java.util.List;
import java.util.Objects;

// One-time backfill for ACTIVE memberships stored before join history.
// It writes the same boundary the read-side fallback computes, so a
// failed or lost write changes nothing and version stays untouched.
// Remove once production logs show matched=0; keep the fallback.
public final class MongoMembershipJoinHistoryBackfill {

    private static final Logger log = LoggerFactory.getLogger(
            MongoMembershipJoinHistoryBackfill.class);

    private final MongoOperations mongoOperations;
    private final RoomMembershipProperties properties;

    public MongoMembershipJoinHistoryBackfill(
            MongoOperations mongoOperations,
            RoomMembershipProperties properties
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
        this.properties = Objects.requireNonNull(
                properties,
                "properties");
    }

    public void initialize() {
        long count = properties.joinHistoryMessageCount();
        try {
            UpdateResult result = mongoOperations
                    .getCollection(MongoMembershipDocument.COLLECTION_NAME)
                    .updateMany(targets(), List.of(new Document(
                            "$set",
                            new Document(
                                    "historyVisibleAfterSequence",
                                    nextHistoryBoundary(count)))));
            log.info(
                    "Membership join history backfill completed: "
                            + "joinHistoryMessageCount={}, matched={}, "
                            + "modified={}",
                    count,
                    result.getMatchedCount(),
                    result.getModifiedCount());
        } catch (RuntimeException exception) {
            log.warn(
                    "Membership join history backfill failed; "
                            + "the read-side fallback stays in effect",
                    exception);
        }
    }

    private static Bson targets() {
        return Filters.and(
                Filters.eq(
                        "schemaVersion",
                        MongoMembershipDocument.CURRENT_SCHEMA_VERSION),
                Filters.eq("status", MembershipStatus.ACTIVE.name()),
                Filters.exists("historyVisibleAfterSequence", false));
    }

    private static Document nextHistoryBoundary(long count) {
        return new Document("$max", List.of(
                0L,
                new Document("$subtract", List.of(
                        "$messageVisibleAfterSequence",
                        count))));
    }
}
