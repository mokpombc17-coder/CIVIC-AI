package com.hamcheeze.chat.room.category.mongo;

import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.room.category.persistence.RoomCategoryUsage;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class MongoRoomCategoryUsage implements RoomCategoryUsage {

    private final MongoOperations mongoOperations;

    public MongoRoomCategoryUsage(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public long countRoomsUsing(String categoryId) {
        String id = requireNonBlank(categoryId);
        List<Criteria> references = new ArrayList<>();
        references.add(Criteria.where("categoryIds").is(id));
        if (RoomCategoryDefaults.POLICY_CATEGORY_ID.equals(id)) {
            references.add(Criteria.where("categories").is("POLICY"));
        }
        Query query = Query.query(new Criteria().orOperator(
                references.toArray(Criteria[]::new)));
        return mongoOperations.count(
                query,
                MongoRoomDocument.COLLECTION_NAME);
    }

    private static String requireNonBlank(String value) {
        Objects.requireNonNull(value, "categoryId");
        if (value.isBlank()) {
            throw new IllegalArgumentException(
                    "categoryId must not be blank");
        }
        return value;
    }
}
