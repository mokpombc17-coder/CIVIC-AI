package com.hamcheeze.chat.room.inbox.mongo;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.inbox.RoomInboxCursor;
import com.hamcheeze.chat.room.inbox.RoomInboxDataConsistencyException;
import com.hamcheeze.chat.room.inbox.RoomInboxPageEntry;
import com.hamcheeze.chat.room.inbox.RoomInboxProperties;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummarySchemaInitializer;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomSchemaInitializer;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import com.mongodb.ConnectionString;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.ReplaceOptions;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ResourceLock("mongo-runtime-test")
class MongoRoomInboxPageReaderIntegrationTest {

    private static final String DATABASE =
            "chat_room_inbox_page_reader_test";
    private static final String USER_ID = "user-1";
    private static final Instant BASE =
            Instant.parse("2026-08-05T00:00:00Z");

    private static MongoClient mongoClient;
    private static MongoOperations mongoOperations;
    private MongoRoomInboxPageReader reader;

    @BeforeAll
    static void connect() {
        ConnectionString connectionString = new ConnectionString(
                MongoRuntimeTestContainer.replicaSetUrl(DATABASE));
        mongoClient = MongoClients.create(connectionString);
        mongoOperations = new MongoTemplate(
                new SimpleMongoClientDatabaseFactory(
                        mongoClient, DATABASE));
    }

    @AfterAll
    static void disconnect() {
        mongoClient.close();
    }

    @BeforeEach
    void setUp() {
        mongoClient.getDatabase(DATABASE).drop();
        new MongoRoomSchemaInitializer(mongoOperations).initialize();
        new MongoRoomInboxSummarySchemaInitializer(
                mongoOperations).initialize();
        reader = new MongoRoomInboxPageReader(
                mongoOperations, new RoomInboxProperties());
    }

    @Test
    void appliesStrictVisibilityBoundaryAndJoinedAtFallback() {
        insert("room-lower", 10, BASE.plusSeconds(10));
        insertSummary(activeSummary(
                "room-lower", 9, BASE.plusSeconds(100), "lower"));
        insert("room-equal", 10, BASE.plusSeconds(20));
        insertSummary(activeSummary(
                "room-equal", 10, BASE.plusSeconds(200), "equal"));
        insert("room-visible", 10, BASE.plusSeconds(30));
        insertSummary(activeSummary(
                "room-visible", 11, BASE.plusSeconds(300), "visible"));

        List<RoomInboxPageEntry> entries = reader.findPage(
                USER_ID, null, 20).items();

        RoomInboxPageEntry visible = entry(entries, "room-visible");
        assertThat(visible.room().categories())
                .containsExactly(
                        com.hamcheeze.chat.room.RoomCategory.POLICY);
        assertThat(visible.lastMessage()).isNotNull();
        assertThat(visible.lastActivityAt())
                .isEqualTo(BASE.plusSeconds(300));
        RoomInboxPageEntry equal = entry(entries, "room-equal");
        assertThat(equal.lastMessage()).isNull();
        assertThat(equal.lastActivityAt())
                .isEqualTo(BASE.plusSeconds(20));
        RoomInboxPageEntry lower = entry(entries, "room-lower");
        assertThat(lower.lastMessage()).isNull();
        assertThat(lower.lastActivityAt())
                .isEqualTo(BASE.plusSeconds(10));
    }

    @Test
    void hiddenSummaryDoesNotAffectSortOrEffectiveCursorValue() {
        insert("room-a", 80, BASE.plusSeconds(10));
        insertSummary(activeSummary(
                "room-a", 80, BASE.plusSeconds(500), "hidden"));
        insert("room-b", 0, BASE.plusSeconds(20));
        insertSummary(activeSummary(
                "room-b", 1, BASE.plusSeconds(100), "visible"));

        List<RoomInboxPageEntry> entries = reader.findPage(
                USER_ID, null, 20).items();

        assertThat(entries).extracting(value -> value.room().roomId())
                .containsExactly("room-b", "room-a");
        assertThat(entries.get(1).lastActivityAt())
                .isEqualTo(BASE.plusSeconds(10));
    }

    @Test
    void missingSummaryAndRejoinBoundaryUseCurrentJoinedAt() {
        Instant rejoinedAt = BASE.plusSeconds(50);
        insert("room-empty", 0, BASE.plusSeconds(40));
        insert("room-rejoined", 10, rejoinedAt);
        insertSummary(activeSummary(
                "room-rejoined", 10, BASE.plusSeconds(10), "old"));

        List<RoomInboxPageEntry> entries = reader.findPage(
                USER_ID, null, 20).items();

        assertThat(entry(entries, "room-empty").lastMessage()).isNull();
        assertThat(entry(entries, "room-empty").lastActivityAt())
                .isEqualTo(BASE.plusSeconds(40));
        assertThat(entry(entries, "room-rejoined").lastMessage()).isNull();
        assertThat(entry(entries, "room-rejoined").lastActivityAt())
                .isEqualTo(rejoinedAt);

        replaceSummary(activeSummary(
                "room-rejoined", 11, BASE.plusSeconds(60), "new"));

        RoomInboxPageEntry afterCreate = entry(reader.findPage(
                USER_ID, null, 20).items(), "room-rejoined");
        assertThat(afterCreate.lastMessage().preview()).isEqualTo("new");
        assertThat(afterCreate.lastActivityAt())
                .isEqualTo(BASE.plusSeconds(60));
    }

    @Test
    void activeAndDeletedSnapshotsPreserveCreatedActivityTime() {
        insert("room-active", 0, BASE);
        insertSummary(activeSummary(
                "room-active", 1, BASE.plusSeconds(20), "preview"));
        insert("room-deleted", 0, BASE);
        insertSummary(deletedSummary(
                "room-deleted", 1, BASE.plusSeconds(10)));

        List<RoomInboxPageEntry> entries = reader.findPage(
                USER_ID, null, 20).items();

        RoomInboxLastMessage active = entry(
                entries, "room-active").lastMessage();
        assertThat(active.preview()).isEqualTo("preview");
        assertThat(active.messageVersion()).isEqualTo(1);
        assertThat(active.createdAt()).isEqualTo(BASE.plusSeconds(20));
        RoomInboxPageEntry deletedEntry = entry(
                entries, "room-deleted");
        assertThat(deletedEntry.lastMessage().state())
                .isEqualTo(MessageState.DELETED_BY_AUTHOR);
        assertThat(deletedEntry.lastMessage().preview()).isNull();
        assertThat(deletedEntry.lastMessage().previewTruncated()).isFalse();
        assertThat(deletedEntry.lastActivityAt())
                .isEqualTo(BASE.plusSeconds(10));
    }

    @Test
    void updateAndDeleteChangeSnapshotWithoutChangingRoomOrder() {
        Instant latestCreatedAt = BASE.plusSeconds(30);
        insert("room-a", 0, BASE);
        insertSummary(activeSummary(
                "room-a", 1, latestCreatedAt, "before"));
        insert("room-b", 0, BASE);
        insertSummary(activeSummary(
                "room-b", 1, BASE.plusSeconds(20), "second"));

        RoomInboxLastMessage edited = new RoomInboxLastMessage(
                "room-a-message-1",
                1,
                2,
                MessageState.ACTIVE,
                "after",
                false,
                latestCreatedAt);
        replaceSummary(new RoomInboxSummary(
                "room-a",
                edited,
                latestCreatedAt,
                latestCreatedAt.plusSeconds(10)));

        List<RoomInboxPageEntry> afterUpdate = reader.findPage(
                USER_ID, null, 20).items();
        assertThat(afterUpdate).extracting(value -> value.room().roomId())
                .containsExactly("room-a", "room-b");
        assertThat(afterUpdate.getFirst().lastMessage().preview())
                .isEqualTo("after");
        assertThat(afterUpdate.getFirst().lastActivityAt())
                .isEqualTo(latestCreatedAt);

        replaceSummary(deletedSummary(
                "room-a", 1, latestCreatedAt));

        List<RoomInboxPageEntry> afterDelete = reader.findPage(
                USER_ID, null, 20).items();
        assertThat(afterDelete).extracting(value -> value.room().roomId())
                .containsExactly("room-a", "room-b");
        assertThat(afterDelete.getFirst().lastMessage().state())
                .isEqualTo(MessageState.DELETED_BY_AUTHOR);
        assertThat(afterDelete.getFirst().lastActivityAt())
                .isEqualTo(latestCreatedAt);
    }

    @Test
    void paginatesFortyFiveTiedRoomsWithoutDuplicatesOrGaps() {
        for (int index = 0; index < 45; index++) {
            insert("room-%02d".formatted(index), 0, BASE);
        }

        List<String> ids = new ArrayList<>();
        RoomInboxCursor cursor = null;
        List<Integer> pageSizes = new ArrayList<>();
        boolean hasNext;
        do {
            CursorSlice<RoomInboxPageEntry> page = reader.findPage(
                    USER_ID, cursor, 20);
            pageSizes.add(page.items().size());
            ids.addAll(page.items().stream()
                    .map(value -> value.room().roomId())
                    .toList());
            hasNext = page.hasNext();
            if (hasNext) {
                RoomInboxPageEntry last = page.items().getLast();
                cursor = new RoomInboxCursor(
                        2,
                        RoomInboxCursor.Scope.MY_ROOM_INBOX,
                        last.lastActivityAt(),
                        last.room().roomId());
            }
        } while (hasNext);

        assertThat(pageSizes).containsExactly(20, 20, 5);
        assertThat(ids).hasSize(45);
        assertThat(new HashSet<>(ids)).hasSize(45);
        assertThat(ids.getFirst()).isEqualTo("room-44");
        assertThat(ids.getLast()).isEqualTo("room-00");
    }

    @Test
    void visibleSummaryTimeTieUsesRoomIdDescendingAcrossPageBoundary() {
        for (String roomId : List.of("room-a", "room-b", "room-c")) {
            insert(roomId, 0, BASE.minusSeconds(1));
            insertSummary(activeSummary(
                    roomId, 1, BASE.plusSeconds(10), roomId));
        }

        CursorSlice<RoomInboxPageEntry> first = reader.findPage(
                USER_ID, null, 2);
        RoomInboxPageEntry last = first.items().getLast();
        CursorSlice<RoomInboxPageEntry> second = reader.findPage(
                USER_ID,
                new RoomInboxCursor(
                        2,
                        RoomInboxCursor.Scope.MY_ROOM_INBOX,
                        last.lastActivityAt(),
                        last.room().roomId()),
                2);

        assertThat(first.items())
                .extracting(value -> value.room().roomId())
                .containsExactly("room-c", "room-b");
        assertThat(second.items())
                .extracting(value -> value.room().roomId())
                .containsExactly("room-a");
    }

    @Test
    void paginatesMixedEffectiveActivityTimesAcrossBothCursorBranches() {
        Instant nine = BASE.plusSeconds(9 * 60 * 60);
        Instant ten = BASE.plusSeconds(10 * 60 * 60);
        Instant eleven = BASE.plusSeconds(11 * 60 * 60);
        Instant twelve = BASE.plusSeconds(12 * 60 * 60);

        insert("room-f", 0, BASE);
        insertSummary(activeSummary("room-f", 1, twelve, "visible-f"));
        insert("room-e", 0, eleven);
        insert("room-d", 0, BASE);
        insertSummary(activeSummary("room-d", 1, eleven, "visible-d"));
        insert("room-c", 10, ten);
        insertSummary(activeSummary(
                "room-c", 10, BASE.plusSeconds(15 * 60 * 60),
                "hidden-c"));
        insert("room-b", 0, BASE);
        insertSummary(activeSummary("room-b", 1, nine, "visible-b"));
        insert("room-a", 0, nine);

        CursorSlice<RoomInboxPageEntry> first = reader.findPage(
                USER_ID, null, 2);
        RoomInboxPageEntry firstLast = first.items().getLast();
        CursorSlice<RoomInboxPageEntry> second = reader.findPage(
                USER_ID, cursor(firstLast), 2);
        RoomInboxPageEntry secondLast = second.items().getLast();
        CursorSlice<RoomInboxPageEntry> third = reader.findPage(
                USER_ID, cursor(secondLast), 2);

        assertThat(first.items())
                .extracting(value -> value.room().roomId())
                .containsExactly("room-f", "room-e");
        assertThat(second.items())
                .extracting(value -> value.room().roomId())
                .containsExactly("room-d", "room-c");
        assertThat(third.items())
                .extracting(value -> value.room().roomId())
                .containsExactly("room-b", "room-a");
        assertThat(firstLast.lastActivityAt()).isEqualTo(eleven);
        assertThat(secondLast.lastActivityAt()).isEqualTo(ten);
        assertThat(secondLast.lastMessage()).isNull();

        List<String> allIds = new ArrayList<>();
        allIds.addAll(first.items().stream()
                .map(value -> value.room().roomId()).toList());
        allIds.addAll(second.items().stream()
                .map(value -> value.room().roomId()).toList());
        allIds.addAll(third.items().stream()
                .map(value -> value.room().roomId()).toList());
        assertThat(allIds).containsExactly(
                "room-f", "room-e", "room-d",
                "room-c", "room-b", "room-a");
        assertThat(new HashSet<>(allIds)).hasSize(6);
        assertThat(first.hasNext()).isTrue();
        assertThat(second.hasNext()).isTrue();
        assertThat(third.hasNext()).isFalse();
    }

    @Test
    void unsupportedAndMalformedSummaryFailClosedWithoutRepair() {
        insert("room-1", 0, BASE);
        Document unsupported = raw(activeSummary(
                "room-1", 1, BASE.plusSeconds(1), "secret-preview"));
        unsupported.put("schemaVersion", 2);
        insertRawSummary(unsupported);
        Document before = summaryRaw("room-1");

        assertThatThrownBy(() -> reader.findPage(USER_ID, null, 20))
                .isInstanceOf(RoomInboxDataConsistencyException.class)
                .extracting("failureKind")
                .isEqualTo("summary-schema-unsupported");
        assertThat(summaryRaw("room-1")).isEqualTo(before);

        last(unsupported).put("messageVersion", 2.0D);
        unsupported.put("schemaVersion", 1);
        replaceRawSummary(unsupported);
        assertThatThrownBy(() -> reader.findPage(USER_ID, null, 20))
                .isInstanceOf(RoomInboxDataConsistencyException.class)
                .extracting("failureKind")
                .isEqualTo("summary-malformed");
    }

    @Test
    void executionStatsCoverTwentyHundredAndFiveHundredRooms() {
        for (int scale : List.of(20, 100, 500)) {
            mongoOperations.getCollection(
                            MongoMembershipDocument.COLLECTION_NAME)
                    .deleteMany(new Document());
            mongoOperations.getCollection(
                            MongoRoomDocument.COLLECTION_NAME)
                    .deleteMany(new Document());
            mongoOperations.getCollection(
                            MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                    .deleteMany(new Document());
            for (int index = 0; index < scale; index++) {
                String roomId = "scale-%03d".formatted(index);
                int variant = index % 4;
                insert(roomId, variant == 2 ? 1 : 0, BASE);
                Instant activity = BASE.plusSeconds(index % 5);
                if (variant == 1 || variant == 2) {
                    insertSummary(activeSummary(
                            roomId, 1, activity, roomId));
                } else if (variant == 3) {
                    insertSummary(deletedSummary(
                            roomId, 1, activity));
                }
            }
            Document aggregate = new Document(
                    "aggregate",
                    MongoMembershipDocument.COLLECTION_NAME)
                    .append("pipeline",
                            MongoRoomInboxPageReader.pipeline(
                                    USER_ID, null, 20))
                    .append("cursor", new Document())
                    .append("hint", MongoRoomSchemaInitializer
                            .MEMBERSHIP_USER_STATUS_INDEX_NAME)
                    .append("allowDiskUse", false)
                    .append("maxTimeMS", 1_000L);
            Document explain = mongoClient.getDatabase(DATABASE)
                    .runCommand(new Document("explain", aggregate)
                            .append("verbosity", "executionStats"));
            String rendered = explain.toJson();
            assertThat(rendered).contains(
                    MongoRoomSchemaInitializer
                            .MEMBERSHIP_USER_STATUS_INDEX_NAME,
                    "IXSCAN", "\"$sort\"");
            assertThat(rendered).doesNotContain("usedDisk\": true");
            List<Document> stages = explain.getList(
                    "stages", Document.class);
            Document cursorStage = stages.getFirst()
                    .get("$cursor", Document.class);
            Document stats = cursorStage.get(
                    "executionStats", Document.class);
            Document finalStage = stages.getLast();
            System.out.printf(
                    "ROOM_INBOX_EXPLAIN scale=%d keys=%s docs=%s "
                            + "millis=%s returned=%s usedDisk=false%n",
                    scale,
                    stats.get("totalKeysExamined"),
                    stats.get("totalDocsExamined"),
                    stats.get("executionTimeMillis"),
                    finalStage.get("nReturned"));
        }
    }

    private void insert(
            String roomId,
            long boundary,
            Instant joinedAt
    ) {
        Room room = Room.restore(
                roomId,
                roomId,
                "description",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                Math.max(2L, (long) (1) + 1L),
                BASE.minusSeconds(100),
                null,
                1);
        Membership membership = Membership.restore(
                "membership-" + roomId,
                roomId,
                USER_ID,
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                joinedAt,
                null,
                null,
                boundary,
                1);
        mongoOperations.insert(MongoRoomDocument.fromDomain(room));
        mongoOperations.insert(
                MongoMembershipDocument.fromDomain(membership));
    }

    private void insertSummary(RoomInboxSummary summary) {
        insertRawSummary(raw(summary));
    }

    private void replaceSummary(RoomInboxSummary summary) {
        replaceRawSummary(raw(summary));
    }

    private void insertRawSummary(Document raw) {
        mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .insertOne(raw);
    }

    private void replaceRawSummary(Document raw) {
        mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .replaceOne(
                        Filters.eq("_id", raw.getString("_id")),
                        raw,
                        new ReplaceOptions().upsert(true));
    }

    private Document summaryRaw(String roomId) {
        return mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .find(Filters.eq("_id", roomId))
                .first();
    }

    private static RoomInboxSummary activeSummary(
            String roomId,
            long sequence,
            Instant createdAt,
            String preview
    ) {
        RoomInboxLastMessage message = new RoomInboxLastMessage(
                roomId + "-message-" + sequence,
                sequence,
                1,
                MessageState.ACTIVE,
                preview,
                false,
                createdAt);
        return new RoomInboxSummary(
                roomId, message, createdAt, createdAt);
    }

    private static RoomInboxCursor cursor(RoomInboxPageEntry entry) {
        return new RoomInboxCursor(
                2,
                RoomInboxCursor.Scope.MY_ROOM_INBOX,
                entry.lastActivityAt(),
                entry.room().roomId());
    }

    private static RoomInboxSummary deletedSummary(
            String roomId,
            long sequence,
            Instant createdAt
    ) {
        RoomInboxLastMessage message = new RoomInboxLastMessage(
                roomId + "-message-" + sequence,
                sequence,
                2,
                MessageState.DELETED_BY_AUTHOR,
                null,
                false,
                createdAt);
        return new RoomInboxSummary(
                roomId,
                message,
                createdAt,
                createdAt.plusSeconds(1));
    }

    private static Document raw(RoomInboxSummary summary) {
        return MongoRoomInboxSummaryDocument
                .fromDomain(summary)
                .toBson();
    }

    private static Document last(Document summary) {
        return summary.get("lastMessage", Document.class);
    }

    private static RoomInboxPageEntry entry(
            List<RoomInboxPageEntry> entries,
            String roomId
    ) {
        return entries.stream()
                .filter(value -> value.room().roomId().equals(roomId))
                .findFirst()
                .orElseThrow();
    }
}
