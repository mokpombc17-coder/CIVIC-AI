package com.hamcheeze.chat.room.category.mongo;

import com.hamcheeze.chat.room.category.RoomCategory;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.room.category.RoomCategorySeedInitializer;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import com.mongodb.ConnectionString;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ResourceLock("mongo-runtime-test")
class MongoRoomCategoryStoreIntegrationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-28T00:00:00Z");
    private static MongoClient mongoClient;
    private static MongoTemplate mongoTemplate;
    private static MongoRoomCategorySchemaInitializer schemaInitializer;
    private static MongoRoomCategoryStore store;

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
                new MongoRoomCategorySchemaInitializer(mongoTemplate);
        schemaInitializer.initialize();
        store = new MongoRoomCategoryStore(mongoTemplate);
    }

    @AfterAll
    static void stopMongoClient() {
        mongoClient.close();
    }

    @BeforeEach
    void clearDocuments() {
        mongoTemplate.remove(
                new Query(),
                MongoRoomCategoryDocument.COLLECTION_NAME);
        schemaInitializer.initialize();
    }

    @Test
    void storesFindsUpdatesAndDeletesCategoryWithVersionChecks() {
        RoomCategory category = RoomCategory.create(
                "category-1",
                "정책",
                CREATED_AT);
        store.insert(category);

        assertThat(store.findById(category.categoryId()))
                .contains(category);
        assertThat(store.findAll()).containsExactly(category);

        RoomCategory renamed = category.rename(
                "정책·행정",
                CREATED_AT.plusSeconds(10));
        assertThat(store.replaceIfVersionMatches(renamed, 0)).isTrue();
        assertThat(store.replaceIfVersionMatches(renamed, 0)).isFalse();
        assertThat(store.deleteIfVersionMatches(
                category.categoryId(),
                0)).isFalse();
        assertThat(store.deleteIfVersionMatches(
                category.categoryId(),
                1)).isTrue();
        assertThat(store.findById(category.categoryId())).isEmpty();
    }

    @Test
    void normalizedNameIndexRejectsDuplicateNames() {
        store.insert(RoomCategory.create(
                "category-1",
                "Policy",
                CREATED_AT));

        assertThatThrownBy(() -> store.insert(RoomCategory.create(
                "category-2",
                "ＰＯＬＩＣＹ",
                CREATED_AT)))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void policySeedIsIdempotentAndDoesNotOverwriteEdits() {
        RoomCategorySeedInitializer initializer =
                new RoomCategorySeedInitializer(
                        store,
                        Clock.fixed(CREATED_AT, ZoneOffset.UTC));
        initializer.initialize();
        initializer.initialize();

        RoomCategory seeded = store.findById(
                        RoomCategoryDefaults.POLICY_CATEGORY_ID)
                .orElseThrow();
        RoomCategory renamed = seeded.rename(
                "정책·행정",
                CREATED_AT.plusSeconds(10));
        assertThat(store.replaceIfVersionMatches(
                renamed,
                seeded.version())).isTrue();

        initializer.initialize();

        assertThat(store.findAll()).containsExactly(renamed);
        Document raw = mongoTemplate.getCollection(
                        MongoRoomCategoryDocument.COLLECTION_NAME)
                .find(new Document(
                        "_id",
                        RoomCategoryDefaults.POLICY_CATEGORY_ID))
                .first();
        assertThat(raw).isNotNull();
        assertThat(raw.getInteger("schemaVersion")).isEqualTo(1);
        assertThat(raw.getString("normalizedName"))
                .isEqualTo("정책·행정");
    }
}
