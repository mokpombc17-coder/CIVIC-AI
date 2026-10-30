package com.hamcheeze.chat.room.inbox.summary.maintenance.mongo;

import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryMaintenanceAction;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.mongodb.MongoWriteException;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.ReplaceOptions;
import com.mongodb.client.result.UpdateResult;
import org.bson.Document;
import org.bson.conversions.Bson;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class MongoRoomInboxSummaryRepairWriter {

    private final MongoRoomInboxSummaryMaintenanceRepository repository;

    public MongoRoomInboxSummaryRepairWriter(
            MongoRoomInboxSummaryMaintenanceRepository repository
    ) {
        this.repository = Objects.requireNonNull(
                repository, "repository");
    }

    public RepairAttempt inspect(RoomInboxSummary expected) {
        return classify(repository.observe(expected.roomId()), expected);
    }

    public long summariesObserved(
            com.hamcheeze.chat.room.inbox.summary.maintenance
                    .RoomInboxSummaryMaintenanceOptions options
    ) {
        return repository.count(options);
    }

    public RepairAttempt applyExpected(RoomInboxSummary expected) {
        MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                observed = repository.observe(expected.roomId());
        RepairAttempt classified = classify(observed, expected);
        if (!classified.requiresWrite()) {
            return classified;
        }
        Document replacement = repository.replacement(expected);
        if (observed.kind()
                == MongoRoomInboxSummaryMaintenanceRepository
                .ObservationKind.MISSING) {
            try {
                repository.mongoOperations()
                        .getCollection(
                                MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                        .insertOne(replacement);
                return classified.asApplied();
            } catch (MongoWriteException exception) {
                if (exception.getError().getCode() == 11000) {
                    return RepairAttempt.concurrentlyChanged();
                }
                throw exception;
            }
        }
        UpdateResult result = repository.mongoOperations()
                .getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .replaceOne(
                        exactObservedFilter(observed),
                        replacement,
                        new ReplaceOptions().upsert(false));
        return result.getMatchedCount() == 1
                ? classified.asApplied()
                : RepairAttempt.concurrentlyChanged();
    }

    public static RepairAttempt classify(
            MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                    observed,
            RoomInboxSummary expected
    ) {
        return switch (observed.kind()) {
            case MISSING -> RepairAttempt.write(
                    RoomInboxSummaryMaintenanceAction.CREATE,
                    List.of());
            case UNSUPPORTED_SCHEMA -> RepairAttempt.noWrite(
                    RoomInboxSummaryMaintenanceAction.UNSUPPORTED_SCHEMA,
                    List.of("schemaVersion"));
            case MALFORMED -> RepairAttempt.noWrite(
                    RoomInboxSummaryMaintenanceAction.MALFORMED,
                    List.of("document"));
            case VALID -> classifyValid(observed.snapshot(), expected);
        };
    }

    public static List<String> mismatchFields(
            RoomInboxSummary stored,
            RoomInboxSummary expected
    ) {
        return mismatchFields(
                new MongoRoomInboxSummaryMaintenanceRepository
                        .StoredSummarySnapshot(
                        stored.lastMessage().messageId(),
                        stored.lastMessage().roomSequence(),
                        stored.lastMessage().messageVersion(),
                        stored.lastMessage().state().name(),
                        stored.lastMessage().preview(),
                        stored.lastMessage().previewTruncated(),
                        stored.lastMessage().createdAt(),
                        stored.lastActivityAt(),
                        stored.updatedAt()),
                expected);
    }

    public static List<String> mismatchFields(
            MongoRoomInboxSummaryMaintenanceRepository
                    .StoredSummarySnapshot stored,
            RoomInboxSummary expected
    ) {
        List<String> fields = new ArrayList<>();
        RoomInboxLastMessage expectedMessage = expected.lastMessage();
        add(fields, "messageId",
                stored.messageId(), expectedMessage.messageId());
        add(fields, "roomSequence",
                stored.roomSequence(),
                expectedMessage.roomSequence());
        add(fields, "messageVersion",
                stored.messageVersion(),
                expectedMessage.messageVersion());
        add(fields, "state",
                stored.state(), expectedMessage.state().name());
        add(fields, "preview",
                stored.preview(), expectedMessage.preview());
        add(fields, "previewTruncated",
                stored.previewTruncated(),
                expectedMessage.previewTruncated());
        add(fields, "createdAt",
                stored.createdAt(), expectedMessage.createdAt());
        add(fields, "lastActivityAt",
                stored.lastActivityAt(), expected.lastActivityAt());
        add(fields, "updatedAt",
                stored.updatedAt(), expected.updatedAt());
        return List.copyOf(fields);
    }

    private static RepairAttempt classifyValid(
            RoomInboxSummary stored,
            RoomInboxSummary expected
    ) {
        return classifyValid(
                new MongoRoomInboxSummaryMaintenanceRepository
                        .StoredSummarySnapshot(
                        stored.lastMessage().messageId(),
                        stored.lastMessage().roomSequence(),
                        stored.lastMessage().messageVersion(),
                        stored.lastMessage().state().name(),
                        stored.lastMessage().preview(),
                        stored.lastMessage().previewTruncated(),
                        stored.lastMessage().createdAt(),
                        stored.lastActivityAt(),
                        stored.updatedAt()),
                expected);
    }

    private static RepairAttempt classifyValid(
            MongoRoomInboxSummaryMaintenanceRepository
                    .StoredSummarySnapshot stored,
            RoomInboxSummary expected
    ) {
        long storedSequence = stored.roomSequence();
        long expectedSequence = expected.lastMessage().roomSequence();
        long storedVersion = stored.messageVersion();
        long expectedVersion = expected.lastMessage().messageVersion();
        if (storedSequence > expectedSequence
                || storedSequence == expectedSequence
                && storedVersion > expectedVersion) {
            return RepairAttempt.noWrite(
                    RoomInboxSummaryMaintenanceAction.AHEAD,
                    mismatchFields(stored, expected));
        }
        if (storedSequence < expectedSequence) {
            return RepairAttempt.write(
                    RoomInboxSummaryMaintenanceAction.ADVANCE_SEQUENCE,
                    mismatchFields(stored, expected));
        }
        if (storedVersion < expectedVersion) {
            return RepairAttempt.write(
                    RoomInboxSummaryMaintenanceAction.REFRESH_VERSION,
                    mismatchFields(stored, expected));
        }
        List<String> mismatches = mismatchFields(stored, expected);
        if (!mismatches.isEmpty()) {
            return RepairAttempt.write(
                    RoomInboxSummaryMaintenanceAction.REPAIR_SNAPSHOT,
                    mismatches);
        }
        return RepairAttempt.noWrite(
                RoomInboxSummaryMaintenanceAction.UNCHANGED,
                List.of());
    }

    private static Bson exactObservedFilter(
            MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                    observed
    ) {
        Document raw = observed.raw();
        return Filters.and(
                Filters.eq("_id", raw.get("_id")),
                Filters.eq("schemaVersion", raw.get("schemaVersion")),
                Filters.eq("lastMessage", raw.get("lastMessage")),
                Filters.eq("lastActivityAt", raw.get("lastActivityAt")),
                Filters.eq("updatedAt", raw.get("updatedAt")));
    }

    private static void add(
            List<String> fields,
            String field,
            Object stored,
            Object expected
    ) {
        if (!Objects.equals(stored, expected)) {
            fields.add(field);
        }
    }

    public record RepairAttempt(
            RoomInboxSummaryMaintenanceAction action,
            boolean requiresWrite,
            boolean applied,
            List<String> mismatchFields
    ) {

        public RepairAttempt {
            mismatchFields = List.copyOf(mismatchFields);
        }

        static RepairAttempt write(
                RoomInboxSummaryMaintenanceAction action,
                List<String> mismatchFields
        ) {
            return new RepairAttempt(
                    action, true, false, mismatchFields);
        }

        static RepairAttempt noWrite(
                RoomInboxSummaryMaintenanceAction action,
                List<String> mismatchFields
        ) {
            return new RepairAttempt(
                    action, false, false, mismatchFields);
        }

        static RepairAttempt concurrentlyChanged() {
            return noWrite(
                    RoomInboxSummaryMaintenanceAction
                            .CONCURRENTLY_CHANGED,
                    List.of());
        }

        RepairAttempt asApplied() {
            return new RepairAttempt(
                    action, true, true, mismatchFields);
        }
    }
}
