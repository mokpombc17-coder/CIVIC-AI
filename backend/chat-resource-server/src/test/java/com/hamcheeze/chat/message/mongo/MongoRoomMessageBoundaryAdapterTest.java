package com.hamcheeze.chat.message.mongo;

import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MongoRoomMessageBoundaryAdapterTest {

    private final MongoOperations mongo = mock(MongoOperations.class);
    private final MongoRoomMessageBoundaryAdapter adapter =
            new MongoRoomMessageBoundaryAdapter(mongo);

    @Test
    void writesTechnicalRevisionAndReturnsCurrentSequence() {
        when(mongo.findAndModify(
                any(Query.class),
                any(Update.class),
                any(),
                eq(MongoRoomSequenceDocument.class)))
                .thenReturn(new MongoRoomSequenceDocument(
                        "room-1", 100, 4));

        assertThat(adapter.captureCurrentSequence("room-1"))
                .isEqualTo(100);

        ArgumentCaptor<Query> query =
                ArgumentCaptor.forClass(Query.class);
        ArgumentCaptor<Update> update =
                ArgumentCaptor.forClass(Update.class);
        verify(mongo).findAndModify(
                query.capture(),
                update.capture(),
                any(),
                eq(MongoRoomSequenceDocument.class));
        assertThat(query.getValue().getQueryObject())
                .isEqualTo(new Document("_id", "room-1"));
        assertThat(update.getValue().getUpdateObject())
                .isEqualTo(new Document("$setOnInsert",
                        new Document("lastSequence", 0L))
                        .append("$inc",
                                new Document(
                                        "boundaryRevision", 1L)));
    }
}
