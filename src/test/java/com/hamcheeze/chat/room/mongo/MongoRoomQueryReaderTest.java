package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.query.ListedRoomQueryCriteria;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MongoRoomQueryReaderTest {

    @Test
    void appliesConfiguredMaxTimeToListedRoomPageQuery() {
        MongoOperations mongoOperations =
                mock(MongoOperations.class);
        when(mongoOperations.find(
                any(Query.class),
                eq(MongoRoomDocument.class)))
                .thenReturn(List.of());
        MongoRoomQueryReader reader = new MongoRoomQueryReader(
                mongoOperations,
                Duration.ofMillis(275));

        reader.findListedRooms(
                new ListedRoomQueryCriteria(null, null, null),
                null,
                20);

        ArgumentCaptor<Query> queryCaptor =
                ArgumentCaptor.forClass(Query.class);
        verify(mongoOperations).find(
                queryCaptor.capture(),
                eq(MongoRoomDocument.class));
        assertThat(queryCaptor.getValue()
                .getMeta()
                .getRequiredMaxTimeMsec())
                .isEqualTo(275L);
    }
}
