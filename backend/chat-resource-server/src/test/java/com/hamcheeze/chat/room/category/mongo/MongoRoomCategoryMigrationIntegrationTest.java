package com.hamcheeze.chat.room.category.mongo;

import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.room.creation.mongo.MongoRoomCreationRequestDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomSchemaInitializer;
import com.hamcheeze.chat.room.mongo.MongoRoomStore;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import com.mongodb.ConnectionString;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ResourceLock("mongo-runtime-test")
class MongoRoomCategoryMigrationIntegrationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-28T00:00:00Z");
    private static MongoClient mongoClient;
    private static MongoTemplate mongoTemplate;
    private static MongoRoomCategoryStore categoryStore;
    private static MongoRoomCategoryMigration migration;

    @BeforeAll
    static void startMongo() {
        ConnectionString connectionString = new ConnectionString(
                MongoRuntimeTestContainer.replicaSetUrl());
        mongoClient = MongoClients.create(connectionString);
        mongoTemplate = new MongoTemplate(
                new SimpleMongoClientDatabaseFactory(
                        mongoClient,
                        connectionString.getDatabase()));
        new MongoRoomSchemaInitializer(mongoTemplate).initialize();
        new MongoRoomCategorySchemaInitializer(
                mongoTemplate).initialize();
        categoryStore = new MongoRoomCategoryStore(mongoTemplate);
        migration = new MongoRoomCategoryMigration(
                mongoTemplate,
                categoryStore,
                Clock.fixed(CREATED_AT, ZoneOffset.UTC));
    }

    @AfterAll
    static void stopMongoClient() {
        mongoClient.close();
    }

    @BeforeEach
    void clearDocuments() {
        mongoTemplate.remove(
                new Query(),
                MongoRoomDocument.COLLECTION_NAME);
        mongoTemplate.remove(
                new Query(),
                MongoRoomCategoryDocument.COLLECTION_NAME);
        mongoTemplate.remove(
                new Query(),
                MongoRoomCreationRequestDocument.COLLECTION_NAME);
    }

    @AfterEach
    void removeMigrationFixtures() {
        clearDocuments();
    }

    @Test
    void migratesLegacyRoomAndCreatesOnlyDiscoveredCategory() {
        insertLegacyRoom("room-1", "ENVIRONMENT");

        migration.initialize();
        migration.initialize();

        Document raw = mongoTemplate.getCollection(
                        MongoRoomDocument.COLLECTION_NAME)
                .find(new Document("_id", "room-1"))
                .first();
        assertThat(raw).isNotNull();
        assertThat(raw.getInteger("schemaVersion")).isEqualTo(7);
        assertThat(raw.getList("categoryIds", String.class))
                .containsExactly(
                        RoomCategoryDefaults.ENVIRONMENT_CATEGORY_ID);
        assertThat(raw.containsKey("categories")).isFalse();
        assertThat(categoryStore.findAll())
                .singleElement()
                .satisfies(category -> {
                    assertThat(category.categoryId()).isEqualTo(
                            RoomCategoryDefaults
                                    .ENVIRONMENT_CATEGORY_ID);
                    assertThat(category.name()).isEqualTo("환경");
                });

        Room restored = new MongoRoomStore(mongoTemplate)
                .findById("room-1")
                .orElseThrow();
        assertThat(restored.categoryIds()).containsExactly(
                RoomCategoryDefaults.ENVIRONMENT_CATEGORY_ID);
        assertThat(restored.categories())
                .containsExactly(RoomCategory.ENVIRONMENT);
    }

    @Test
    void rejectsUnknownLegacyCategoryBeforeChangingRoom() {
        insertLegacyRoom("room-unknown", "UNKNOWN");

        assertThatThrownBy(migration::initialize)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("UNKNOWN");

        Document raw = mongoTemplate.getCollection(
                        MongoRoomDocument.COLLECTION_NAME)
                .find(new Document("_id", "room-unknown"))
                .first();
        assertThat(raw).isNotNull();
        assertThat(raw.getInteger("schemaVersion")).isEqualTo(6);
        assertThat(raw.containsKey("categoryIds")).isFalse();
        assertThat(categoryStore.findAll()).isEmpty();
    }

    @Test
    void migratesOnlyApprovedRequestCategoriesAsFinalAssignments() {
        insertLegacyCreationRequest(
                "request-approved",
                "APPROVED",
                "ENVIRONMENT");
        insertLegacyCreationRequest(
                "request-pending",
                "PENDING",
                "POLICY");

        migration.initialize();
        migration.initialize();

        Document approved = creationRequest("request-approved");
        assertThat(approved.getInteger("schemaVersion")).isEqualTo(2);
        assertThat(approved.getList("categoryIds", String.class))
                .containsExactly(
                        RoomCategoryDefaults.ENVIRONMENT_CATEGORY_ID);
        assertThat(approved.containsKey("categories")).isFalse();

        Document pending = creationRequest("request-pending");
        assertThat(pending.getInteger("schemaVersion")).isEqualTo(2);
        assertThat(pending.getList("categoryIds", String.class)).isEmpty();
        assertThat(pending.containsKey("categories")).isFalse();
    }

    private void insertLegacyRoom(
            String roomId,
            String category
    ) {
        mongoTemplate.getCollection(
                        MongoRoomDocument.COLLECTION_NAME)
                .insertOne(new Document("_id", roomId)
                        .append("schemaVersion", 6)
                        .append("name", roomId)
                        .append("description", "")
                        .append("categories", List.of(category))
                        .append("ownerMembershipId", "membership-owner")
                        .append("ownerUserId", "owner-1")
                        .append("status", "ACTIVE")
                        .append("visibility", "LISTED")
                        .append("joinPolicy", "OPEN")
                        .append("activeMemberCount", 1)
                        .append("nextParticipantNumber", 2L)
                        .append("createdAt", Date.from(CREATED_AT))
                        .append("closedAt", null)
                        .append("version", 0L));
    }

    private void insertLegacyCreationRequest(
            String requestId,
            String status,
            String category
    ) {
        mongoTemplate.getCollection(
                        MongoRoomCreationRequestDocument.COLLECTION_NAME)
                .insertOne(new Document("_id", requestId)
                        .append("schemaVersion", 1)
                        .append("requesterUserId", requestId + "-user")
                        .append("clientRequestId", requestId + "-client")
                        .append("status", status)
                        .append("categories", List.of(category)));
    }

    private Document creationRequest(String requestId) {
        return mongoTemplate.getCollection(
                        MongoRoomCreationRequestDocument.COLLECTION_NAME)
                .find(new Document("_id", requestId))
                .first();
    }
}
