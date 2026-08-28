package com.hamcheeze.chat.room.category.mongo;

import com.hamcheeze.chat.room.category.RoomCategory;
import com.hamcheeze.chat.room.category.persistence.RoomCategoryStore;
import com.mongodb.client.result.DeleteResult;
import com.mongodb.client.result.UpdateResult;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.ReplaceOptions;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class MongoRoomCategoryStore implements RoomCategoryStore {

    private final MongoOperations mongoOperations;

    public MongoRoomCategoryStore(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public Optional<RoomCategory> findById(String categoryId) {
        MongoRoomCategoryDocument document = mongoOperations.findById(
                requireNonBlank(categoryId, "categoryId"),
                MongoRoomCategoryDocument.class,
                MongoRoomCategoryDocument.COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoRoomCategoryDocument::toDomain);
    }

    @Override
    public List<RoomCategory> findAll() {
        return mongoOperations.find(
                        new Query(),
                        MongoRoomCategoryDocument.class,
                        MongoRoomCategoryDocument.COLLECTION_NAME)
                .stream()
                .map(MongoRoomCategoryDocument::toDomain)
                .toList();
    }

    @Override
    public void insert(RoomCategory category) {
        mongoOperations.insert(
                MongoRoomCategoryDocument.fromDomain(
                        Objects.requireNonNull(category, "category")),
                MongoRoomCategoryDocument.COLLECTION_NAME);
    }

    @Override
    public boolean insertIfAbsent(RoomCategory category) {
        RoomCategory candidate = Objects.requireNonNull(
                category,
                "category");
        try {
            insert(candidate);
            return true;
        } catch (DuplicateKeyException exception) {
            if (findById(candidate.categoryId()).isPresent()) {
                return false;
            }
            throw exception;
        }
    }

    @Override
    public boolean replaceIfVersionMatches(
            RoomCategory category,
            long expectedVersion
    ) {
        RoomCategory replacement = Objects.requireNonNull(
                category,
                "category");
        requireNextVersion(expectedVersion, replacement.version());
        Query query = Query.query(
                Criteria.where("_id")
                        .is(replacement.categoryId())
                        .and("version")
                        .is(expectedVersion));
        UpdateResult result = mongoOperations.replace(
                query,
                MongoRoomCategoryDocument.fromDomain(replacement),
                ReplaceOptions.none(),
                MongoRoomCategoryDocument.COLLECTION_NAME);
        return result.getModifiedCount() == 1;
    }

    @Override
    public boolean deleteIfVersionMatches(
            String categoryId,
            long expectedVersion
    ) {
        if (expectedVersion < 0) {
            throw new IllegalArgumentException(
                    "expectedVersion must not be negative");
        }
        Query query = Query.query(
                Criteria.where("_id")
                        .is(requireNonBlank(
                                categoryId,
                                "categoryId"))
                        .and("version")
                        .is(expectedVersion));
        DeleteResult result = mongoOperations.remove(
                query,
                MongoRoomCategoryDocument.COLLECTION_NAME);
        return result.getDeletedCount() == 1;
    }

    private static void requireNextVersion(
            long expectedVersion,
            long replacementVersion
    ) {
        if (expectedVersion < 0
                || replacementVersion != expectedVersion + 1) {
            throw new IllegalArgumentException(
                    "category.version must equal expectedVersion + 1");
        }
    }

    private static String requireNonBlank(
            String value,
            String fieldName
    ) {
        Objects.requireNonNull(value, fieldName);
        if (value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
        return value;
    }
}
