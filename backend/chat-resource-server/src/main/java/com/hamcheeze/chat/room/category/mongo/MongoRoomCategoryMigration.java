package com.hamcheeze.chat.room.category.mongo;

import com.hamcheeze.chat.room.category.LegacyRoomCategoryMapping;
import com.hamcheeze.chat.room.category.RoomCategoryIds;
import com.hamcheeze.chat.room.category.persistence.RoomCategoryStore;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import com.hamcheeze.chat.room.creation.mongo.MongoRoomCreationRequestDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Projections;
import com.mongodb.client.model.Updates;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoOperations;

import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class MongoRoomCategoryMigration {

    private final MongoOperations mongoOperations;
    private final RoomCategoryStore categoryStore;
    private final Clock clock;

    public MongoRoomCategoryMigration(
            MongoOperations mongoOperations,
            RoomCategoryStore categoryStore,
            Clock clock
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
        this.categoryStore = Objects.requireNonNull(
                categoryStore,
                "categoryStore");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public void initialize() {
        migrateRooms();
        migrateCreationRequests();
    }

    private void migrateRooms() {
        if (!mongoOperations.collectionExists(
                MongoRoomDocument.COLLECTION_NAME)) {
            return;
        }
        MongoCollection<Document> rooms = mongoOperations
                .getCollection(MongoRoomDocument.COLLECTION_NAME);
        List<Document> legacyRooms = rooms.find(Filters.eq(
                        "schemaVersion",
                        MongoRoomDocument.LEGACY_CATEGORY_SCHEMA_VERSION))
                .projection(Projections.include(
                        "_id",
                        "categories"))
                .into(new ArrayList<>());
        Set<String> legacyNames = new LinkedHashSet<>();
        for (Document room : legacyRooms) {
            legacyNames.addAll(requireLegacyNames(room));
        }
        for (String legacyName : legacyNames) {
            categoryStore.insertIfAbsent(
                    LegacyRoomCategoryMapping.category(
                            legacyName,
                            clock.instant()));
        }
        for (Document room : legacyRooms) {
            List<String> categoryIds = RoomCategoryIds.requireValid(
                    requireLegacyNames(room).stream()
                            .map(LegacyRoomCategoryMapping::categoryId)
                            .toList());
            rooms.updateOne(
                    Filters.and(
                            Filters.eq("_id", room.get("_id")),
                            Filters.eq(
                                    "schemaVersion",
                                    MongoRoomDocument
                                            .LEGACY_CATEGORY_SCHEMA_VERSION)),
                    Updates.combine(
                            Updates.set("categoryIds", categoryIds),
                            Updates.set(
                                    "schemaVersion",
                                    MongoRoomDocument
                                            .CURRENT_SCHEMA_VERSION),
                            Updates.unset("categories")));
        }
    }

    private void migrateCreationRequests() {
        if (!mongoOperations.collectionExists(
                MongoRoomCreationRequestDocument.COLLECTION_NAME)) {
            return;
        }
        MongoCollection<Document> requests = mongoOperations
                .getCollection(
                        MongoRoomCreationRequestDocument.COLLECTION_NAME);
        List<Document> legacyRequests = requests.find(Filters.eq(
                        "schemaVersion",
                        MongoRoomCreationRequestDocument
                                .LEGACY_CATEGORY_SCHEMA_VERSION))
                .projection(Projections.include(
                        "_id",
                        "status",
                        "categories"))
                .into(new ArrayList<>());
        Set<String> approvedLegacyNames = new LinkedHashSet<>();
        for (Document request : legacyRequests) {
            if (isApproved(request)) {
                approvedLegacyNames.addAll(requireLegacyNames(request));
            }
        }
        for (String legacyName : approvedLegacyNames) {
            categoryStore.insertIfAbsent(
                    LegacyRoomCategoryMapping.category(
                            legacyName,
                            clock.instant()));
        }
        for (Document request : legacyRequests) {
            List<String> categoryIds = isApproved(request)
                    ? RoomCategoryIds.requireValid(
                            requireLegacyNames(request).stream()
                                    .map(LegacyRoomCategoryMapping::categoryId)
                                    .toList())
                    : List.of();
            requests.updateOne(
                    Filters.and(
                            Filters.eq("_id", request.get("_id")),
                            Filters.eq(
                                    "schemaVersion",
                                    MongoRoomCreationRequestDocument
                                            .LEGACY_CATEGORY_SCHEMA_VERSION)),
                    Updates.combine(
                            Updates.set("categoryIds", categoryIds),
                            Updates.set(
                                    "schemaVersion",
                                    MongoRoomCreationRequestDocument
                                            .CURRENT_SCHEMA_VERSION),
                            Updates.unset("categories")));
        }
    }

    private static boolean isApproved(Document request) {
        return RoomCreationRequestStatus.APPROVED.name().equals(
                request.getString("status"));
    }

    private static List<String> requireLegacyNames(Document room) {
        List<String> categories = room.getList(
                "categories",
                String.class);
        if (categories == null || categories.isEmpty()) {
            throw new IllegalStateException(
                    "Legacy document must contain categories: "
                            + room.get("_id"));
        }
        for (String category : categories) {
            LegacyRoomCategoryMapping.categoryId(category);
        }
        return List.copyOf(categories);
    }
}
