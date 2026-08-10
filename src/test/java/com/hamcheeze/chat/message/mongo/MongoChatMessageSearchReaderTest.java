package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.search.ChatMessageSearchCandidateSlice;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MongoChatMessageSearchReaderTest {

    private static final Duration MAX_TIME =
            Duration.ofMillis(275);

    private final MongoOperations mongo = mock(MongoOperations.class);
    private final MongoChatMessageSearchReader reader =
            new MongoChatMessageSearchReader(mongo);

    @Test
    void buildsBoundedNewestFirstCandidateQueryWithoutContentFilter() {
        Query query = capture(
                List.of(),
                () -> reader.findCandidates(
                        "room-1", 10, 100, null, 20, MAX_TIME));

        assertThat(query.getQueryObject()).isEqualTo(new Document(
                "roomId", "room-1")
                .append("state", MessageState.ACTIVE)
                .append("countable", true)
                .append("roomSequence", new Document("$gt", 10L)
                        .append("$lte", 100L)));
        assertThat(query.getQueryObject()).doesNotContainKey("content");
        assertThat(query.getSortObject())
                .isEqualTo(new Document("roomSequence", -1));
        assertThat(query.getLimit()).isEqualTo(21);
        assertThat(query.getMeta().getRequiredMaxTimeMsec())
                .isEqualTo(275L);
    }

    @Test
    void continuationUsesExclusiveBeforeSequence() {
        Query query = capture(
                List.of(),
                () -> reader.findCandidates(
                        "room-1", 10, 100, 80L, 20, MAX_TIME));

        assertThat(query.getQueryObject()
                .get("roomSequence", Document.class))
                .isEqualTo(new Document("$gt", 10L)
                        .append("$lte", 100L)
                        .append("$lt", 80L));
    }

    @Test
    void usesLimitPlusOneToReportOlderCandidates() {
        List<MongoChatMessageDocument> found = List.of(
                document(5),
                document(4),
                document(3));

        ChatMessageSearchCandidateSlice slice = captureResult(
                found,
                () -> reader.findCandidates(
                        "room-1", 0, 5, null, 2, MAX_TIME));

        assertThat(slice.items())
                .extracting("roomSequence")
                .containsExactly(5L, 4L);
        assertThat(slice.hasOlderCandidates()).isTrue();
    }

    @Test
    void rejectsInvalidRangeLimitAndMaxTime() {
        assertThatThrownBy(() -> reader.findCandidates(
                "room-1", 10, 9, null, 20, MAX_TIME))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> reader.findCandidates(
                "room-1", 10, 100, 10L, 20, MAX_TIME))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> reader.findCandidates(
                "room-1", 10, 100, null, 0, MAX_TIME))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> reader.findCandidates(
                "room-1", 10, 100, null, 20, Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> reader.findCandidates(
                "room-1", 10, 100, null, 20,
                Duration.ofNanos(999_999)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private Query capture(
            List<MongoChatMessageDocument> result,
            Runnable invocation
    ) {
        stub(result);
        invocation.run();
        ArgumentCaptor<Query> query =
                ArgumentCaptor.forClass(Query.class);
        verify(mongo).find(
                query.capture(),
                eq(MongoChatMessageDocument.class),
                eq(MongoChatMessageDocument.COLLECTION_NAME));
        clearInvocations(mongo);
        return query.getValue();
    }

    private ChatMessageSearchCandidateSlice captureResult(
            List<MongoChatMessageDocument> result,
            java.util.function.Supplier<
                    ChatMessageSearchCandidateSlice> invocation
    ) {
        stub(result);
        ChatMessageSearchCandidateSlice slice = invocation.get();
        clearInvocations(mongo);
        return slice;
    }

    private void stub(List<MongoChatMessageDocument> result) {
        when(mongo.find(
                any(Query.class),
                eq(MongoChatMessageDocument.class),
                eq(MongoChatMessageDocument.COLLECTION_NAME)))
                .thenReturn(result);
    }

    private MongoChatMessageDocument document(long sequence) {
        return new MongoChatMessageDocument(
                "message-" + sequence,
                MongoChatMessageDocument.CURRENT_SCHEMA_VERSION,
                "room-1",
                sequence,
                "user-1",
                "membership-1",
                "client-" + sequence,
                "content-" + sequence,
                Instant.parse("2026-08-10T03:00:00Z"));
    }
}
