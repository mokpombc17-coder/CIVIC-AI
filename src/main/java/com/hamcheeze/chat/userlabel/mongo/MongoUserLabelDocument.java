package com.hamcheeze.chat.userlabel.mongo;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = MongoUserLabelDocument.COLLECTION_NAME)
record MongoUserLabelDocument(
        @Id String userId,
        int schemaVersion,
        String userLabel,
        Instant updatedAt
) {
    static final String COLLECTION_NAME = "chat_user_labels";
    static final int CURRENT_SCHEMA_VERSION = 1;
}
