package com.hamcheeze.chat.message.mongo;

import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MongoChatMessageHistoryReaderTest {

    private final MongoOperations mongo = mock(MongoOperations.class);
    private final MongoChatMessageHistoryReader reader =
            new MongoChatMessageHistoryReader(mongo);

    @Test
    void latestEnforcesExclusiveMembershipBoundary() {
        Query query = capture(() -> reader.findLatest(
                "room-1", 100, 20));

        assertThat(query.getQueryObject()).isEqualTo(new Document(
                "roomId", "room-1").append(
                "roomSequence", new Document("$gt", 100L)));
        assertThat(query.getSortObject())
                .isEqualTo(new Document("roomSequence", -1));
        assertThat(query.getLimit()).isEqualTo(20);
    }

    @Test
    void beforeEnforcesBoundaryEvenForForgedOlderCursor() {
        Query normal = capture(() -> reader.findBefore(
                "room-1", 100, 200, 20));
        assertThat(normal.getQueryObject()).isEqualTo(new Document(
                "roomId", "room-1").append(
                "roomSequence",
                new Document("$gt", 100L).append("$lt", 200L)));

        Query forged = capture(() -> reader.findBefore(
                "room-1", 100, 50, 20));
        assertThat(forged.getQueryObject()).isEqualTo(new Document(
                "roomId", "room-1").append(
                "roomSequence",
                new Document("$gt", 100L).append("$lt", 50L)));
    }

    @Test
    void afterUsesMaximumOfClientCursorAndMembershipBoundary() {
        Query forged = capture(() -> reader.findAfter(
                "room-1", 100, 0, 20));
        assertThat(forged.getQueryObject()).isEqualTo(new Document(
                "roomId", "room-1").append(
                "roomSequence", new Document("$gt", 100L)));

        Query newer = capture(() -> reader.findAfter(
                "room-1", 100, 120, 20));
        assertThat(newer.getQueryObject()).isEqualTo(new Document(
                "roomId", "room-1").append(
                "roomSequence", new Document("$gt", 120L)));
        assertThat(newer.getSortObject())
                .isEqualTo(new Document("roomSequence", 1));
    }

    private Query capture(Runnable invocation) {
        when(mongo.find(
                any(Query.class),
                eq(MongoChatMessageDocument.class),
                eq(MongoChatMessageDocument.COLLECTION_NAME)))
                .thenReturn(List.of());
        invocation.run();
        ArgumentCaptor<Query> query =
                ArgumentCaptor.forClass(Query.class);
        verify(mongo).find(
                query.capture(),
                eq(MongoChatMessageDocument.class),
                eq(MongoChatMessageDocument.COLLECTION_NAME));
        org.mockito.Mockito.clearInvocations(mongo);
        return query.getValue();
    }
}
