package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.application.RoomMembershipProperties;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import com.mongodb.ConnectionString;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Instant;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;

@ResourceLock("mongo-runtime-test")
class MongoMembershipJoinHistoryBackfillIntegrationTest {

    private static MongoClient mongoClient;
    private static MongoTemplate mongoTemplate;
    private static MongoRoomSchemaInitializer schemaInitializer;

    private final RoomMembershipProperties properties =
            new RoomMembershipProperties();

    @BeforeAll
    static void startMongo() {
        ConnectionString connectionString = new ConnectionString(
                MongoRuntimeTestContainer.replicaSetUrl());
        mongoClient = MongoClients.create(connectionString);
        mongoTemplate = new MongoTemplate(
                new SimpleMongoClientDatabaseFactory(
                        mongoClient,
                        connectionString.getDatabase()));
        schemaInitializer =
                new MongoRoomSchemaInitializer(mongoTemplate);
    }

    @AfterAll
    static void stopMongoClient() {
        mongoClient.close();
    }

    @BeforeEach
    void clearMemberships() {
        mongoTemplate.remove(
                new Query(),
                MongoMembershipDocument.COLLECTION_NAME);
        schemaInitializer.initialize();
    }

    @Test
    void fillsOnlyActiveLegacyMembershipsAndIsIdempotent() {
        insert("legacy", "ACTIVE", 3, 25L, null, 2L);
        insert("small-room", "ACTIVE", 3, 4L, null, 0L);
        insert("already-filled", "ACTIVE", 3, 40L, 30L, 0L);
        insert("owner", "ACTIVE", 3, 0L, null, 1L);
        insert("left", "LEFT", 3, 50L, null, 3L);
        insert("old-schema", "ACTIVE", 2, 50L, null, 3L);
        MongoMembershipJoinHistoryBackfill backfill =
                new MongoMembershipJoinHistoryBackfill(
                        mongoTemplate,
                        properties);

        backfill.initialize();

        assertHistory("legacy", 15L, 2L);
        assertHistory("small-room", 0L, 0L);
        assertHistory("already-filled", 30L, 0L);
        assertHistory("owner", 0L, 1L);
        assertHistory("left", null, 3L);
        assertHistory("old-schema", null, 3L);

        Document before = membership("legacy");
        backfill.initialize();
        assertThat(membership("legacy")).isEqualTo(before);
    }

    @Test
    void backfilledValueMatchesTheReadSideFallback() {
        insert("legacy", "ACTIVE", 3, 25L, null, 2L);
        MongoMembershipStore store =
                new MongoMembershipStore(mongoTemplate, properties);
        long beforeBackfill = store.findById("legacy")
                .orElseThrow()
                .historyVisibleAfterSequence();

        new MongoMembershipJoinHistoryBackfill(
                mongoTemplate,
                properties).initialize();

        assertThat(store.findById("legacy")
                .orElseThrow()
                .historyVisibleAfterSequence())
                .isEqualTo(beforeBackfill)
                .isEqualTo(15L);
    }

    private void insert(
            String membershipId,
            String status,
            int schemaVersion,
            long messageVisibleAfterSequence,
            Long historyVisibleAfterSequence,
            long version
    ) {
        Instant joinedAt = Instant.parse("2026-07-28T00:00:00Z");
        Document document = new Document("_id", membershipId)
                .append("schemaVersion", schemaVersion)
                .append("roomId", "room-1")
                .append("userId", "user-" + membershipId)
                .append("role", "MEMBER")
                .append("status", status)
                .append("profile", new Document("participantNumber", 2L)
                        .append("displayName", "참여자 2")
                        .append("imageUrl", null)
                        .append("version", 1L)
                        .append("createdAt", Date.from(joinedAt))
                        .append("updatedAt", Date.from(joinedAt)))
                .append("joinedAt", Date.from(joinedAt))
                .append("leftAt", "LEFT".equals(status)
                        ? Date.from(joinedAt.plusSeconds(60)) : null)
                .append("bannedAt", null)
                .append("messageVisibleAfterSequence",
                        messageVisibleAfterSequence)
                .append("version", version);
        if (historyVisibleAfterSequence != null) {
            document.append(
                    "historyVisibleAfterSequence",
                    historyVisibleAfterSequence);
        }
        collection().insertOne(document);
    }

    private void assertHistory(
            String membershipId,
            Long expectedHistory,
            long expectedVersion
    ) {
        Document document = membership(membershipId);
        if (expectedHistory == null) {
            assertThat(document)
                    .doesNotContainKey("historyVisibleAfterSequence");
        } else {
            assertThat(document.get("historyVisibleAfterSequence"))
                    .isEqualTo(expectedHistory);
        }
        assertThat(document.get("version")).isEqualTo(expectedVersion);
    }

    private Document membership(String membershipId) {
        return collection()
                .find(new Document("_id", membershipId))
                .first();
    }

    private MongoCollection<Document> collection() {
        return mongoTemplate.getCollection(
                MongoMembershipDocument.COLLECTION_NAME);
    }
}
