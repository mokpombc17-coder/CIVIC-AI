package com.hamcheeze.chat.room.inbox.mongo;

import com.hamcheeze.chat.message.mongo.MongoChatMessageSchemaInitializer;
import com.hamcheeze.chat.room.inbox.RoomInboxProperties;
import com.hamcheeze.chat.room.inbox.UnreadCount;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.CountOptions;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoOperations;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MongoUnreadCountReaderTest {

    @Test
    void usesTrueBoundedCountMaxTimeAndHint() {
        MongoOperations operations = mock(MongoOperations.class);
        @SuppressWarnings("unchecked")
        MongoCollection<Document> collection =
                mock(MongoCollection.class);
        when(operations.getCollection("chat_messages"))
                .thenReturn(collection);
        when(collection.countDocuments(
                any(Bson.class), any(CountOptions.class)))
                .thenReturn(201L);
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.setUnreadCountCap(200);
        properties.setCountQueryMaxTime(Duration.ofMillis(750));
        MongoUnreadCountReader reader = new MongoUnreadCountReader(
                operations,
                properties,
                new SimpleMeterRegistry());

        UnreadCount result = reader.count("room-1", "user-1", 123);

        assertThat(result).isEqualTo(new UnreadCount(200, true));
        var filter = org.mockito.ArgumentCaptor.forClass(Bson.class);
        var options = org.mockito.ArgumentCaptor.forClass(
                CountOptions.class);
        verify(collection).countDocuments(
                filter.capture(), options.capture());
        assertThat(options.getValue().getLimit()).isEqualTo(201);
        assertThat(options.getValue().getMaxTime(TimeUnit.MILLISECONDS))
                .isEqualTo(750);
        assertThat(options.getValue().getHintString())
                .isEqualTo(MongoChatMessageSchemaInitializer
                        .UNREAD_INDEX_NAME);
        String query = filter.getValue().toString();
        assertThat(query).contains(
                "roomId", "roomSequence", "state",
                "countable", "senderUserId");
    }

    @Test
    void countFailureFailsWholeInboxInsteadOfReturningZero() {
        MongoOperations operations = mock(MongoOperations.class);
        @SuppressWarnings("unchecked")
        MongoCollection<Document> collection =
                mock(MongoCollection.class);
        when(operations.getCollection("chat_messages"))
                .thenReturn(collection);
        when(collection.countDocuments(
                any(Bson.class), any(CountOptions.class)))
                .thenThrow(new IllegalStateException("timeout"));
        MongoUnreadCountReader reader = new MongoUnreadCountReader(
                operations,
                new RoomInboxProperties(),
                new SimpleMeterRegistry());

        assertThatThrownBy(() -> reader.count(
                "room-1", "user-1", 0))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("timeout");
    }
}
