package com.hamcheeze.chat.room.category.mongo;

import com.hamcheeze.chat.room.category.RoomCategory;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;
import java.util.Objects;

@Document(collection = MongoRoomCategoryDocument.COLLECTION_NAME)
public record MongoRoomCategoryDocument(
        @MongoId(FieldType.STRING)
        String categoryId,
        int schemaVersion,
        String name,
        String normalizedName,
        Instant createdAt,
        Instant updatedAt,
        long version
) {

    public static final String COLLECTION_NAME = "chat_room_categories";
    public static final int CURRENT_SCHEMA_VERSION = 1;

    @PersistenceCreator
    public MongoRoomCategoryDocument {
        Objects.requireNonNull(categoryId, "categoryId");
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(normalizedName, "normalizedName");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    public static MongoRoomCategoryDocument fromDomain(
            RoomCategory category
    ) {
        Objects.requireNonNull(category, "category");
        return new MongoRoomCategoryDocument(
                category.categoryId(),
                CURRENT_SCHEMA_VERSION,
                category.name(),
                category.normalizedName(),
                category.createdAt(),
                category.updatedAt(),
                category.version());
    }

    public RoomCategory toDomain() {
        if (schemaVersion != CURRENT_SCHEMA_VERSION) {
            throw new IllegalStateException(
                    "Unsupported schemaVersion "
                            + schemaVersion
                            + " in "
                            + COLLECTION_NAME);
        }
        return new RoomCategory(
                categoryId,
                name,
                normalizedName,
                createdAt,
                updatedAt,
                version);
    }
}
