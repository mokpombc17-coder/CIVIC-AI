package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.search.ChatMessageSearchCandidateSlice;
import com.mongodb.client.MongoCollection;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoOperations;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MongoChatMessageSearchReaderIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-08-10T03:00:00Z");
    private static final Duration MAX_TIME =
            Duration.ofMillis(500);
    private static final MongoChatMessageStoreTestConfiguration
            CONFIGURATION =
            new MongoChatMessageStoreTestConfiguration();

    private MongoOperations mongo;
    private MongoChatMessageSearchReader reader;

    @BeforeAll
    static void startMongoDB() {
        CONFIGURATION.start();
    }

    @AfterAll
    static void stopMongoDB() {
        CONFIGURATION.close();
    }

    @BeforeEach
    void setUp() {
        CONFIGURATION.resetSchema();
        mongo = CONFIGURATION.mongoOperations();
        reader = new MongoChatMessageSearchReader(mongo);
    }

    @Test
    void returnsOnlyAccessibleActiveCountableCandidatesNewestFirst() {
        insert(active("room-1", 2));
        insert(active("room-1", 3));
        insert(nonCountable("room-1", 4));
        insert(deleted("room-1", 5));
        insert(active("room-1", 6));
        insert(active("room-2", 100));

        ChatMessageSearchCandidateSlice first = reader.findCandidates(
                "room-1", 1, 6, null, 2, MAX_TIME);
        ChatMessageSearchCandidateSlice second = reader.findCandidates(
                "room-1", 1, 6, 3L, 2, MAX_TIME);

        assertThat(first.items())
                .extracting("roomSequence")
                .containsExactly(6L, 3L);
        assertThat(first.hasOlderCandidates()).isTrue();
        assertThat(second.items())
                .extracting("roomSequence")
                .containsExactly(2L);
        assertThat(second.hasOlderCandidates()).isFalse();
    }

    @Test
    void malformedActiveCandidateFailsClosedInsteadOfBeingSkipped() {
        collection().insertOne(rawDocument(
                "room-1",
                1,
                MessageState.ACTIVE,
                true,
                null));

        assertThatThrownBy(() -> reader.findCandidates(
                "room-1", 0, 1, null, 20, MAX_TIME))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void candidateQueryUsesRoomSequenceIndexWithoutBlockingSort() {
        List<Document> documents = new ArrayList<>();
        for (long sequence = 1; sequence <= 1_000; sequence++) {
            boolean searchable = sequence % 10 == 0;
            documents.add(rawDocument(
                    "performance-room",
                    sequence,
                    searchable
                            ? MessageState.ACTIVE
                            : MessageState.DELETED_BY_AUTHOR,
                    searchable,
                    searchable ? "searchable content" : null));
        }
        collection().insertMany(documents);

        Document filter = new Document(
                "roomId", "performance-room")
                .append("state", "ACTIVE")
                .append("countable", true)
                .append("roomSequence", new Document("$gt", 0L)
                        .append("$lte", 1_000L));
        Document find = new Document(
                "find", MongoChatMessageDocument.COLLECTION_NAME)
                .append("filter", filter)
                .append("sort", new Document("roomSequence", -1))
                .append("limit", 51)
                .append("maxTimeMS", 500L);
        Document explain = mongo.executeCommand(
                new Document("explain", find)
                        .append("verbosity", "executionStats"));
        Document winningPlan = explain.get(
                "queryPlanner", Document.class)
                .get("winningPlan", Document.class);
        String indexName = findString(winningPlan, "indexName");

        assertThat(containsStage(winningPlan, "COLLSCAN")).isFalse();
        assertThat(containsStage(winningPlan, "SORT")).isFalse();
        assertThat(containsStage(winningPlan, "IXSCAN")).isTrue();
        assertThat(indexName).isIn(
                MongoChatMessageSchemaInitializer.UNREAD_INDEX_NAME,
                MongoChatMessageSchemaInitializer
                        .ROOM_SEQUENCE_INDEX_NAME);
        Document stats = explain.get("executionStats", Document.class);
        assertThat(stats.getInteger("nReturned")).isEqualTo(51);
        System.out.printf(
                "MESSAGE_SEARCH_EXPLAIN index=%s keys=%s docs=%s "
                        + "millis=%s returned=%s%n",
                indexName,
                stats.get("totalKeysExamined"),
                stats.get("totalDocsExamined"),
                stats.get("executionTimeMillis"),
                stats.get("nReturned"));
    }

    private void insert(MongoChatMessageDocument document) {
        mongo.insert(
                document,
                MongoChatMessageDocument.COLLECTION_NAME);
    }

    private MongoCollection<Document> collection() {
        return mongo.getCollection(
                MongoChatMessageDocument.COLLECTION_NAME);
    }

    private MongoChatMessageDocument active(
            String roomId,
            long sequence
    ) {
        return document(
                roomId,
                sequence,
                MessageState.ACTIVE,
                true,
                "content " + sequence);
    }

    private MongoChatMessageDocument nonCountable(
            String roomId,
            long sequence
    ) {
        return document(
                roomId,
                sequence,
                MessageState.ACTIVE,
                false,
                "system content " + sequence);
    }

    private MongoChatMessageDocument deleted(
            String roomId,
            long sequence
    ) {
        return document(
                roomId,
                sequence,
                MessageState.DELETED_BY_AUTHOR,
                true,
                null);
    }

    private MongoChatMessageDocument document(
            String roomId,
            long sequence,
            MessageState state,
            boolean countable,
            String content
    ) {
        return new MongoChatMessageDocument(
                roomId + "-message-" + sequence,
                MongoChatMessageDocument.CURRENT_SCHEMA_VERSION,
                roomId,
                sequence,
                "user-1",
                "membership-1",
                roomId + "-client-" + sequence,
                content,
                state == MessageState.ACTIVE
                        ? null : "retained deleted content",
                "0".repeat(64),
                state,
                countable,
                state == MessageState.ACTIVE ? 1L : 2L,
                NOW,
                NOW,
                state == MessageState.ACTIVE ? null : NOW);
    }

    private Document rawDocument(
            String roomId,
            long sequence,
            MessageState state,
            boolean countable,
            String content
    ) {
        Date time = Date.from(NOW);
        return new Document("_id", roomId + "-raw-" + sequence)
                .append("schemaVersion",
                        MongoChatMessageDocument.CURRENT_SCHEMA_VERSION)
                .append("roomId", roomId)
                .append("roomSequence", sequence)
                .append("senderUserId", "user-1")
                .append("senderMembershipId", "membership-1")
                .append("clientMessageId", "client-" + sequence)
                .append("content", content)
                .append("retainedContent",
                        state == MessageState.ACTIVE
                                ? null : "retained deleted content")
                .append("creationContentFingerprint", "0".repeat(64))
                .append("state", state.name())
                .append("countable", countable)
                .append("messageVersion",
                        state == MessageState.ACTIVE ? 1L : 2L)
                .append("createdAt", time)
                .append("updatedAt", time)
                .append("deletedAt",
                        state == MessageState.ACTIVE ? null : time);
    }

    private boolean containsStage(Object value, String stage) {
        if (value instanceof Document document) {
            if (stage.equals(document.getString("stage"))) {
                return true;
            }
            return document.values().stream()
                    .anyMatch(item -> containsStage(item, stage));
        }
        if (value instanceof List<?> list) {
            return list.stream().anyMatch(item ->
                    containsStage(item, stage));
        }
        return false;
    }

    private String findString(Object value, String key) {
        if (value instanceof Document document) {
            Object found = document.get(key);
            if (found instanceof String text) {
                return text;
            }
            for (Object item : document.values()) {
                String nested = findString(item, key);
                if (nested != null) {
                    return nested;
                }
            }
        }
        if (value instanceof List<?> list) {
            for (Object item : list) {
                String nested = findString(item, key);
                if (nested != null) {
                    return nested;
                }
            }
        }
        return null;
    }
}
