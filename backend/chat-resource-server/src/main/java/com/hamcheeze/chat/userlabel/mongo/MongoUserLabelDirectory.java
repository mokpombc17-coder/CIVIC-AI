package com.hamcheeze.chat.userlabel.mongo;

import com.hamcheeze.chat.userlabel.UserLabelDirectory;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Component
public final class MongoUserLabelDirectory
        implements UserLabelDirectory {

    private final MongoOperations mongoOperations;

    public MongoUserLabelDirectory(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public void upsert(String userId, String userLabel) {
        requireText(userId, "userId");
        requireText(userLabel, "userLabel");
        Query query = Query.query(Criteria.where("_id").is(userId));
        Update update = new Update()
                .set("schemaVersion",
                        MongoUserLabelDocument.CURRENT_SCHEMA_VERSION)
                .set("userLabel", userLabel)
                .set("updatedAt", Instant.now());
        mongoOperations.upsert(
                query,
                update,
                MongoUserLabelDocument.class);
    }

    @Override
    public Map<String, String> findByUserIds(
            Collection<String> userIds
    ) {
        Objects.requireNonNull(userIds, "userIds");
        LinkedHashSet<String> uniqueUserIds =
                new LinkedHashSet<>(userIds);
        if (uniqueUserIds.isEmpty()) {
            return Map.of();
        }
        uniqueUserIds.forEach(userId ->
                requireText(userId, "userId"));
        return mongoOperations.find(
                        Query.query(Criteria.where("_id")
                                .in(uniqueUserIds)),
                        MongoUserLabelDocument.class)
                .stream()
                .collect(Collectors.toUnmodifiableMap(
                        MongoUserLabelDocument::userId,
                        MongoUserLabelDocument::userLabel,
                        (first, second) -> first));
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    name + " must not be blank");
        }
    }
}
