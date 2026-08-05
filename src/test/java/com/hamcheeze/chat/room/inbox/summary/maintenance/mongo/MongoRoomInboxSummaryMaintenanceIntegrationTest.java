package com.hamcheeze.chat.room.inbox.summary.maintenance.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.mongo.MongoChatMessageDocument;
import com.hamcheeze.chat.message.mongo.MongoChatMessageSchemaInitializer;
import com.hamcheeze.chat.message.mongo.MongoRoomSequenceDocument;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryBackfillService;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryCandidate;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryMaintenanceAction;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryMaintenanceCommand;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryMaintenanceMode;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryMaintenanceOptions;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryMaintenanceReport;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryValidator;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummarySchemaInitializer;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryWriter;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import com.mongodb.ConnectionString;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.ReplaceOptions;
import com.mongodb.client.model.Updates;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

@ResourceLock("mongo-runtime-test")
class MongoRoomInboxSummaryMaintenanceIntegrationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-05T00:00:00Z");
    private static MongoClient mongoClient;
    private static MongoOperations mongoOperations;

    private MongoRoomInboxSummaryCandidateReader candidateReader;
    private MongoRoomInboxSummaryMaintenanceRepository repository;
    private MongoRoomInboxSummaryRepairWriter repairWriter;

    @BeforeAll
    static void connect() {
        ConnectionString connectionString = new ConnectionString(
                MongoRuntimeTestContainer.replicaSetUrl());
        mongoClient = MongoClients.create(connectionString);
        mongoOperations = new MongoTemplate(
                new SimpleMongoClientDatabaseFactory(
                        mongoClient,
                        connectionString.getDatabase()));
    }

    @AfterAll
    static void disconnect() {
        mongoClient.close();
    }

    @BeforeEach
    void setUp() {
        drop(MongoChatMessageDocument.COLLECTION_NAME);
        drop(MongoRoomSequenceDocument.COLLECTION_NAME);
        drop(MongoRoomInboxSummaryDocument.COLLECTION_NAME);
        new MongoChatMessageSchemaInitializer(mongoOperations).initialize();
        new MongoRoomInboxSummarySchemaInitializer(
                mongoOperations).initialize();
        candidateReader = new MongoRoomInboxSummaryCandidateReader(
                mongoOperations);
        repository = new MongoRoomInboxSummaryMaintenanceRepository(
                mongoOperations);
        repairWriter = new MongoRoomInboxSummaryRepairWriter(repository);
    }

    @Test
    void candidateReaderUsesGreatestRoomSequenceOnly() {
        insertMessage(active(
                "room-1", 1, 7, "updated past", true));
        insertMessage(deleted("room-1", 2, 2, false));
        insertMessage(active(
                "room-closed", 1, 1, "closed room", false));

        List<RoomInboxSummaryCandidate> candidates = scanCandidates(2);

        assertThat(candidates).hasSize(2);
        assertThat(candidates).anySatisfy(candidate -> {
            assertThat(candidate.source().roomId()).isEqualTo("room-1");
            assertThat(candidate.source().roomSequence()).isEqualTo(2);
            assertThat(candidate.source().state())
                    .isEqualTo(MessageState.DELETED_BY_AUTHOR);
            assertThat(candidate.source().countable()).isFalse();
        });
        assertThat(candidates).anySatisfy(candidate ->
                assertThat(candidate.source().roomId())
                        .isEqualTo("room-closed"));
    }

    @Test
    void dryRunApplyValidateAndReapplyConverge() {
        ChatMessage active = active(
                "room-active", 1, 1, "$27", true);
        ChatMessage edited = active(
                "room-edited", 1, 3, "edited", true);
        ChatMessage deleted = deleted(
                "room-deleted", 1, 2, false);
        for (ChatMessage message : List.of(active, edited, deleted)) {
            insertMessage(message);
            insertSequence(message.roomId(), message.roomSequence());
        }
        insertSequence("room-empty", 0);

        RoomInboxSummaryMaintenanceReport dryRun = backfill(
                RoomInboxSummaryMaintenanceMode.DRY_RUN,
                null);
        assertThat(dryRun.created()).isEqualTo(3);
        assertThat(summaryCount()).isZero();

        RoomInboxSummaryMaintenanceReport applied = backfill(
                RoomInboxSummaryMaintenanceMode.APPLY,
                null);
        assertThat(applied.created()).isEqualTo(3);
        assertThat(summaryCount()).isEqualTo(3);
        assertThat(repository.observe("room-active")
                .snapshot().preview()).isEqualTo("$27");
        assertThat(repository.observe("room-edited")
                .snapshot().messageVersion()).isEqualTo(3);
        assertThat(repository.observe("room-deleted")
                .snapshot().state())
                .isEqualTo(MessageState.DELETED_BY_AUTHOR.name());
        assertThat(repository.observe("room-deleted")
                .snapshot().preview()).isNull();
        assertThat(repository.observe("room-empty").kind())
                .isEqualTo(MongoRoomInboxSummaryMaintenanceRepository
                        .ObservationKind.MISSING);

        Document beforeReapply = summaryRaw("room-edited");
        RoomInboxSummaryMaintenanceReport reapplied = backfill(
                RoomInboxSummaryMaintenanceMode.APPLY,
                null);
        assertThat(reapplied.created()).isZero();
        assertThat(reapplied.advancedSequence()).isZero();
        assertThat(reapplied.refreshedVersion()).isZero();
        assertThat(reapplied.repairedSnapshot()).isZero();
        assertThat(reapplied.unchanged()).isEqualTo(3);
        assertThat(summaryRaw("room-edited")).isEqualTo(beforeReapply);

        RoomInboxSummaryMaintenanceReport validation = validate(null);
        assertThat(validation.valid()).isTrue();
        assertThat(validation.violations()).isZero();
    }

    @Test
    void applyAdvancesSequenceAndRefreshesActiveAndDeletedVersions() {
        ChatMessage older = active("room-advance", 1, 1, "old", true);
        ChatMessage latest = active("room-advance", 2, 1, "new", true);
        insertMessage(older);
        insertMessage(latest);
        insertSequence("room-advance", 2);
        insertSummary(expected(older));

        ChatMessage activeV1 = active(
                "room-refresh-active", 1, 1, "before", true);
        ChatMessage activeV2 = active(
                "room-refresh-active", 1, 2, "after", true);
        insertMessage(activeV2);
        insertSequence("room-refresh-active", 1);
        insertSummary(expected(activeV1));

        ChatMessage deletedV2 = deleted(
                "room-refresh-deleted", 1, 2, true);
        insertMessage(deletedV2);
        insertSequence("room-refresh-deleted", 1);
        insertSummary(expected(active(
                "room-refresh-deleted", 1, 1, "before", true)));

        RoomInboxSummaryMaintenanceReport report = backfill(
                RoomInboxSummaryMaintenanceMode.APPLY,
                null);

        assertThat(report.advancedSequence()).isEqualTo(1);
        assertThat(report.refreshedVersion()).isEqualTo(2);
        assertThat(repository.observe("room-refresh-active")
                .snapshot().preview()).isEqualTo("after");
        assertThat(repository.observe("room-refresh-deleted")
                .snapshot().state())
                .isEqualTo(MessageState.DELETED_BY_AUTHOR.name());
        assertThat(validate(null).valid()).isTrue();
    }

    @Test
    void applyNeverDowngradesAheadSummary() {
        ChatMessage source = active("room-1", 10, 2, "source", true);
        insertMessage(source);
        insertSequence("room-1", 11);
        RoomInboxSummary ahead = expected(
                active("room-1", 11, 1, "ahead", true));
        insertSummary(ahead);

        ChatMessage sameSequence = active(
                "room-2", 5, 2, "source", true);
        insertMessage(sameSequence);
        insertSequence("room-2", 5);
        insertSummary(expected(active(
                "room-2", 5, 3, "ahead-version", true)));

        RoomInboxSummaryMaintenanceReport report = backfill(
                RoomInboxSummaryMaintenanceMode.APPLY,
                null);

        assertThat(report.ahead()).isEqualTo(2);
        assertThat(report.completedSuccessfully()).isFalse();
        assertThat(repository.observe("room-1")
                .snapshot().roomSequence()).isEqualTo(11);
        assertThat(repository.observe("room-2")
                .snapshot().messageVersion()).isEqualTo(3);
    }

    @Test
    void repairWriterRepairsEveryExactSnapshotField() {
        RoomInboxSummary expected = expected(
                active("room-1", 3, 2, "$27", true));

        assertRepairs(expected, raw -> last(raw)
                .put("messageId", "wrong-message"));
        assertRepairs(expected, raw -> {
            last(raw).put("state", "DELETED_BY_AUTHOR");
            last(raw).put("preview", null);
        });
        assertRepairs(expected, raw -> last(raw)
                .put("preview", "wrong-preview"));
        assertRepairs(expected, raw -> last(raw)
                .put("previewTruncated", true));
        assertRepairs(expected, raw -> last(raw)
                .put("createdAt", Date.from(CREATED_AT.minusSeconds(1))));
        assertRepairs(expected, raw -> raw
                .put("lastActivityAt",
                        Date.from(CREATED_AT.minusSeconds(1))));
        assertRepairs(expected, raw -> raw
                .put("updatedAt",
                        Date.from(CREATED_AT.plusSeconds(99))));
    }

    @Test
    void repairWriterStoresDollarPrefixedPreviewsLiterally() {
        List<String> previews = List.of(
                "$27", "$$NOW", "$lastMessage.messageId");
        for (int index = 0; index < previews.size(); index++) {
            String roomId = "room-" + index;
            RoomInboxSummary expected = expected(active(
                    roomId, 1, 1, previews.get(index), true));

            MongoRoomInboxSummaryRepairWriter.RepairAttempt result =
                    repairWriter.applyExpected(expected);

            assertThat(result.action())
                    .isEqualTo(RoomInboxSummaryMaintenanceAction.CREATE);
            assertThat(repository.observe(roomId).snapshot().preview())
                    .isEqualTo(previews.get(index));
        }
    }

    @Test
    void concurrentCreateCannotBeMovedBackward() {
        ChatMessage sequence10 = active(
                "room-1", 10, 1, "ten", true);
        insertMessage(sequence10);
        insertSequence("room-1", 10);
        AtomicBoolean once = new AtomicBoolean();
        MongoRoomInboxSummaryWriter runtimeWriter =
                new MongoRoomInboxSummaryWriter(mongoOperations);

        RoomInboxSummaryMaintenanceReport report = backfill(
                RoomInboxSummaryMaintenanceMode.APPLY,
                (candidate, attempt) -> {
                    if (once.compareAndSet(false, true)) {
                        ChatMessage sequence11 = active(
                                "room-1", 11, 1, "eleven", true);
                        insertMessage(sequence11);
                        saveSequence("room-1", 11);
                        runtimeWriter.applyCreated(sequence11);
                    }
                });

        assertThat(report.concurrentlyChanged()).isZero();
        assertThat(repository.observe("room-1")
                .snapshot().roomSequence()).isEqualTo(11);
        assertThat(repository.observe("room-1")
                .snapshot().preview()).isEqualTo("eleven");
    }

    @Test
    void missingSummaryConcurrentUpdateAndDeleteConverge() {
        assertConcurrentMutationConverges(false);
        setUp();
        assertConcurrentMutationConverges(true);
    }

    @Test
    void concurrentValidationRetriesToStableSourceSnapshot() {
        ChatMessage version1 = active(
                "room-1", 1, 1, "before", true);
        insertMessage(version1);
        insertSequence("room-1", 1);
        insertSummary(expected(version1));
        ChatMessage version2 = active(
                "room-1", 1, 2, "after", true);
        AtomicBoolean once = new AtomicBoolean();
        MongoRoomInboxSummaryWriter runtimeWriter =
                new MongoRoomInboxSummaryWriter(mongoOperations);

        RoomInboxSummaryMaintenanceReport report = validate(
                (candidate, attempt) -> {
                    if (once.compareAndSet(false, true)) {
                        mongoOperations.save(document(version2));
                        runtimeWriter.applyUpdated(version2);
                    }
                });

        assertThat(report.valid()).isTrue();
        assertThat(report.concurrentlyChanged()).isZero();
    }

    @Test
    void applyRefusesUnsupportedSummaryAndMalformedMessage() {
        ChatMessage source = active("room-1", 1, 1, "source", true);
        insertMessage(source);
        insertSequence("room-1", 1);
        Document unsupported = expectedDocument(source);
        unsupported.put("schemaVersion", 2);
        insertSummaryRaw(unsupported);

        RoomInboxSummaryMaintenanceReport unsupportedReport = backfill(
                RoomInboxSummaryMaintenanceMode.APPLY,
                null);
        assertThat(unsupportedReport.unsupportedSchemas()).isEqualTo(1);
        assertThat(summaryRaw("room-1").getInteger("schemaVersion"))
                .isEqualTo(2);

        setUp();
        insertMessage(source);
        insertSequence("room-1", 1);
        mongoOperations.getCollection(
                        MongoChatMessageDocument.COLLECTION_NAME)
                .updateOne(
                        Filters.eq("_id", source.messageId()),
                        Updates.unset("countable"));

        RoomInboxSummaryMaintenanceReport malformedReport = backfill(
                RoomInboxSummaryMaintenanceMode.APPLY,
                null);
        assertThat(malformedReport.malformedMessages()).isEqualTo(1);
        assertThat(summaryCount()).isZero();
    }

    @Test
    void validationDetectsMissingStaleMalformedOrphanAndSequenceViolations() {
        ChatMessage source = active("room-1", 1, 1, "source", true);
        insertMessage(source);
        insertSequence("room-1", 1);
        assertThat(validate(null).valid()).isFalse();

        setUp();
        ChatMessage latest = active("room-1", 2, 1, "latest", true);
        insertMessage(active("room-1", 1, 1, "old", true));
        insertMessage(latest);
        insertSequence("room-1", 2);
        insertSummary(expected(active("room-1", 1, 1, "old", true)));
        assertThat(validate(null).valid()).isFalse();

        setUp();
        source = active("room-1", 1, 2, "edited", true);
        insertMessage(source);
        insertSequence("room-1", 1);
        insertSummary(expected(active(
                "room-1", 1, 1, "before", true)));
        assertThat(validate(null).valid()).isFalse();

        setUp();
        insertSummary(expected(active(
                "orphan", 1, 1, "orphan", true)));
        assertThat(validate(null).orphanSummaries()).isEqualTo(1);

        setUp();
        source = active("room-1", 1, 1, "source", true);
        insertMessage(source);
        insertSequence("room-1", 1);
        Document unsupported = expectedDocument(source);
        unsupported.put("schemaVersion", 2);
        insertSummaryRaw(unsupported);
        assertThat(validate(null).unsupportedSchemas()).isEqualTo(1);

        setUp();
        insertMessage(source);
        insertSequence("room-1", 1);
        Document malformed = expectedDocument(source);
        last(malformed).remove("previewTruncated");
        insertSummaryRaw(malformed);
        assertThat(validate(null).malformedSummaries()).isEqualTo(1);

        setUp();
        insertMessage(source);
        insertSequence("room-1", 1);
        mongoOperations.getCollection(
                        MongoChatMessageDocument.COLLECTION_NAME)
                .updateOne(
                        Filters.eq("_id", source.messageId()),
                        Updates.unset("countable"));
        assertThat(validate(null).malformedMessages()).isEqualTo(1);

        setUp();
        ChatMessage sequence2 = active(
                "room-1", 2, 1, "source", true);
        insertMessage(sequence2);
        insertSequence("room-1", 1);
        insertSummary(expected(sequence2));
        assertThat(validate(null).sequenceViolations())
                .isGreaterThanOrEqualTo(1);
    }

    @Test
    void validationDetectsEachExactSnapshotMismatch() {
        ChatMessage source = active("room-1", 1, 2, "expected", true);
        insertMessage(source);
        insertSequence("room-1", 1);
        RoomInboxSummary expected = expected(source);

        assertValidationMismatch(expected, raw -> last(raw)
                .put("messageId", "wrong"));
        assertValidationMismatch(expected, raw -> {
            last(raw).put("state", "DELETED_BY_AUTHOR");
            last(raw).put("preview", null);
        });
        assertValidationMismatch(expected, raw -> last(raw)
                .put("preview", "wrong"));
        assertValidationMismatch(expected, raw -> last(raw)
                .put("previewTruncated", true));
        assertValidationMismatch(expected, raw -> last(raw)
                .put("createdAt", Date.from(CREATED_AT.minusSeconds(1))));
        assertValidationMismatch(expected, raw -> raw
                .put("lastActivityAt",
                        Date.from(CREATED_AT.minusSeconds(1))));
        assertValidationMismatch(expected, raw -> raw
                .put("updatedAt", Date.from(CREATED_AT.plusSeconds(99))));
    }

    @Test
    void candidateScanUsesBoundedCursorForFiveHundredRooms() {
        List<MongoChatMessageDocument> messages = new ArrayList<>();
        for (int index = 0; index < 500; index++) {
            messages.add(document(active(
                    "room-%04d".formatted(index),
                    1,
                    1,
                    "message",
                    true)));
        }
        mongoOperations.insert(
                messages, MongoChatMessageDocument.class);

        assertThat(scanCandidates(20)).hasSize(500);
        assertThat(scanCandidates(100)).hasSize(500);
        assertThat(scanCandidates(500)).hasSize(500);
    }

    @Test
    void explicitCommandRunsDryRunApplyAndValidateOnTestDatabase() {
        ChatMessage source = active("room-1", 1, 1, "source", true);
        insertMessage(source);
        insertSequence("room-1", 1);
        Map<String, String> environment = Map.of(
                "CHAT_MONGODB_URI",
                MongoRuntimeTestContainer.replicaSetUrl());

        assertThat(runCommand("dry-run", environment)).isZero();
        assertThat(summaryCount()).isZero();
        assertThat(runCommand("apply", environment)).isZero();
        assertThat(summaryCount()).isEqualTo(1);
        assertThat(runCommand("validate", environment)).isZero();
    }

    private void assertConcurrentMutationConverges(boolean delete) {
        ChatMessage version1 = active(
                "room-1", 1, 1, "before", true);
        insertMessage(version1);
        insertSequence("room-1", 1);
        AtomicBoolean once = new AtomicBoolean();
        ChatMessage version2 = delete
                ? deleted("room-1", 1, 2, true)
                : active("room-1", 1, 2, "after", true);
        MongoRoomInboxSummaryWriter runtimeWriter =
                new MongoRoomInboxSummaryWriter(mongoOperations);

        RoomInboxSummaryMaintenanceReport report = backfill(
                RoomInboxSummaryMaintenanceMode.APPLY,
                (candidate, attempt) -> {
                    if (once.compareAndSet(false, true)) {
                        mongoOperations.save(document(version2));
                        if (delete) {
                            runtimeWriter.applyDeleted(version2);
                        } else {
                            runtimeWriter.applyUpdated(version2);
                        }
                    }
                });

        assertThat(report.concurrentlyChanged()).isZero();
        assertThat(repository.observe("room-1")
                .snapshot().messageVersion()).isEqualTo(2);
        assertThat(repository.observe("room-1").snapshot().state())
                .isEqualTo(version2.state().name());
        assertThat(repository.observe("room-1").snapshot().preview())
                .isEqualTo(delete ? null : "after");
    }

    private void assertRepairs(
            RoomInboxSummary expected,
            Consumer<Document> corruptor
    ) {
        Document corrupt = MongoRoomInboxSummaryDocument
                .fromDomain(expected)
                .toBson();
        corruptor.accept(corrupt);
        mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .replaceOne(
                        Filters.eq("_id", expected.roomId()),
                        corrupt,
                        new ReplaceOptions().upsert(true));

        MongoRoomInboxSummaryRepairWriter.RepairAttempt result =
                repairWriter.applyExpected(expected);

        assertThat(result.action())
                .isEqualTo(RoomInboxSummaryMaintenanceAction.REPAIR_SNAPSHOT);
        assertThat(result.applied()).isTrue();
        assertThat(summaryRaw(expected.roomId())).isEqualTo(
                MongoRoomInboxSummaryDocument
                        .fromDomain(expected)
                        .toBson());
    }

    private void assertValidationMismatch(
            RoomInboxSummary expected,
            Consumer<Document> corruptor
    ) {
        Document corrupt = MongoRoomInboxSummaryDocument
                .fromDomain(expected)
                .toBson();
        corruptor.accept(corrupt);
        mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .replaceOne(
                        Filters.eq("_id", expected.roomId()),
                        corrupt,
                        new ReplaceOptions().upsert(true));
        assertThat(validate(null).valid()).isFalse();
    }

    private RoomInboxSummaryMaintenanceReport backfill(
            RoomInboxSummaryMaintenanceMode mode,
            com.hamcheeze.chat.room.inbox.summary.maintenance
                    .RoomInboxSummaryMaintenanceHook hook
    ) {
        RoomInboxSummaryBackfillService service = hook == null
                ? new RoomInboxSummaryBackfillService(
                        candidateReader, repairWriter, diagnostic -> {
                        })
                : new RoomInboxSummaryBackfillService(
                        candidateReader,
                        repairWriter,
                        hook,
                        diagnostic -> {
                        });
        return service.run(options(mode, 100));
    }

    private RoomInboxSummaryMaintenanceReport validate(
            com.hamcheeze.chat.room.inbox.summary.maintenance
                    .RoomInboxSummaryMaintenanceHook hook
    ) {
        RoomInboxSummaryValidator validator = hook == null
                ? new RoomInboxSummaryValidator(
                        candidateReader, repository, diagnostic -> {
                        })
                : new RoomInboxSummaryValidator(
                        candidateReader,
                        repository,
                        hook,
                        diagnostic -> {
                        });
        return validator.validate(options(
                RoomInboxSummaryMaintenanceMode.VALIDATE, 100));
    }

    private List<RoomInboxSummaryCandidate> scanCandidates(int batchSize) {
        List<RoomInboxSummaryCandidate> candidates = new ArrayList<>();
        candidateReader.scan(
                options(RoomInboxSummaryMaintenanceMode.DRY_RUN, batchSize),
                new MongoRoomInboxSummaryCandidateReader
                        .CandidateVisitor() {
                    @Override
                    public void onCandidate(
                            RoomInboxSummaryCandidate candidate
                    ) {
                        candidates.add(candidate);
                    }

                    @Override
                    public void onMalformed(
                            MongoRoomInboxSummaryCandidateReader
                                    .MalformedCandidate malformed
                    ) {
                        throw new AssertionError(malformed);
                    }
                });
        return candidates;
    }

    private static RoomInboxSummaryMaintenanceOptions options(
            RoomInboxSummaryMaintenanceMode mode,
            int batchSize
    ) {
        return new RoomInboxSummaryMaintenanceOptions(
                mode, null, null, batchSize, 3);
    }

    private void insertMessage(ChatMessage message) {
        mongoOperations.insert(document(message));
    }

    private static MongoChatMessageDocument document(ChatMessage message) {
        return new MongoChatMessageDocument(
                message.messageId(),
                MongoChatMessageDocument.CURRENT_SCHEMA_VERSION,
                message.roomId(),
                message.roomSequence(),
                message.senderUserId(),
                message.clientMessageId(),
                message.content(),
                "test-fingerprint",
                message.state(),
                message.countable(),
                message.messageVersion(),
                message.createdAt(),
                message.updatedAt(),
                message.deletedAt());
    }

    private void insertSequence(String roomId, long lastSequence) {
        mongoOperations.insert(new MongoRoomSequenceDocument(
                roomId, lastSequence, 0));
    }

    private void saveSequence(String roomId, long lastSequence) {
        mongoOperations.save(new MongoRoomSequenceDocument(
                roomId, lastSequence, 0));
    }

    private void insertSummary(RoomInboxSummary summary) {
        insertSummaryRaw(MongoRoomInboxSummaryDocument
                .fromDomain(summary)
                .toBson());
    }

    private void insertSummaryRaw(Document summary) {
        mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .insertOne(summary);
    }

    private Document summaryRaw(String roomId) {
        return mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .find(Filters.eq("_id", roomId))
                .first();
    }

    private long summaryCount() {
        return mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .countDocuments();
    }

    private static Document expectedDocument(ChatMessage message) {
        return MongoRoomInboxSummaryDocument
                .fromDomain(expected(message))
                .toBson();
    }

    private static Document last(Document summary) {
        return summary.get("lastMessage", Document.class);
    }

    private static RoomInboxSummary expected(ChatMessage message) {
        return RoomInboxSummaryCandidate.from(message).expected();
    }

    private static ChatMessage active(
            String roomId,
            long sequence,
            long version,
            String content,
            boolean countable
    ) {
        Instant updatedAt = CREATED_AT.plusSeconds(version - 1);
        return new ChatMessage(
                roomId + "-message-" + sequence,
                roomId,
                sequence,
                "user-1",
                roomId + "-client-" + sequence,
                content,
                MessageState.ACTIVE,
                countable,
                version,
                CREATED_AT,
                updatedAt,
                null);
    }

    private static ChatMessage deleted(
            String roomId,
            long sequence,
            long version,
            boolean countable
    ) {
        Instant updatedAt = CREATED_AT.plusSeconds(version - 1);
        return new ChatMessage(
                roomId + "-message-" + sequence,
                roomId,
                sequence,
                "user-1",
                roomId + "-client-" + sequence,
                null,
                MessageState.DELETED_BY_AUTHOR,
                countable,
                version,
                CREATED_AT,
                updatedAt,
                updatedAt);
    }

    private static int runCommand(
            String mode,
            Map<String, String> environment
    ) {
        return RoomInboxSummaryMaintenanceCommand.run(
                new String[]{"--mode=" + mode},
                environment,
                new PrintStream(new ByteArrayOutputStream()),
                new PrintStream(new ByteArrayOutputStream()));
    }

    private static void drop(String collectionName) {
        if (mongoOperations.collectionExists(collectionName)) {
            mongoOperations.dropCollection(collectionName);
        }
    }
}
