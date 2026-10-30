package com.hamcheeze.chat.room.inbox.summary.maintenance;

import com.hamcheeze.chat.message.mongo.MongoRoomSequenceDocument;
import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryCandidateReader;
import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryMaintenanceRepository;
import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryRepairWriter;
import org.bson.Document;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;

public final class RoomInboxSummaryValidator {

    private final MongoRoomInboxSummaryCandidateReader candidateReader;
    private final MongoRoomInboxSummaryMaintenanceRepository repository;
    private final RoomInboxSummaryMaintenanceHook hook;
    private final Consumer<RoomInboxSummaryMaintenanceDiagnostic>
            diagnosticSink;

    public RoomInboxSummaryValidator(
            MongoRoomInboxSummaryCandidateReader candidateReader,
            MongoRoomInboxSummaryMaintenanceRepository repository,
            Consumer<RoomInboxSummaryMaintenanceDiagnostic> diagnosticSink
    ) {
        this(
                candidateReader,
                repository,
                RoomInboxSummaryMaintenanceHook.NONE,
                diagnosticSink);
    }

    public RoomInboxSummaryValidator(
            MongoRoomInboxSummaryCandidateReader candidateReader,
            MongoRoomInboxSummaryMaintenanceRepository repository,
            RoomInboxSummaryMaintenanceHook hook,
            Consumer<RoomInboxSummaryMaintenanceDiagnostic> diagnosticSink
    ) {
        this.candidateReader = Objects.requireNonNull(
                candidateReader, "candidateReader");
        this.repository = Objects.requireNonNull(
                repository, "repository");
        this.hook = Objects.requireNonNull(hook, "hook");
        this.diagnosticSink = Objects.requireNonNull(
                diagnosticSink, "diagnosticSink");
    }

    public RoomInboxSummaryMaintenanceReport validate(
            RoomInboxSummaryMaintenanceOptions options
    ) {
        if (options.mode()
                != RoomInboxSummaryMaintenanceMode.VALIDATE) {
            throw new IllegalArgumentException(
                    "Validator requires validate mode");
        }
        RoomInboxSummaryMaintenanceReport report =
                new RoomInboxSummaryMaintenanceReport(options.mode());
        Set<String> projectionViolationRooms = new HashSet<>();
        validateMessageToSummary(
                options, report, projectionViolationRooms);
        hook.beforeSummaryToMessageValidation();
        validateSummaryToMessage(
                options, report, projectionViolationRooms);
        if (report.roomsWithMessages() != report.summariesObserved()
                && projectionViolationRooms.isEmpty()
                && report.orphanSummaries() == 0
                && report.unsupportedSchemas() == 0
                && report.malformedMessages() == 0
                && report.malformedSummaries() == 0
                && report.concurrentlyChanged() == 0) {
            report.incrementProjectionViolations();
            diagnosticSink.accept(new RoomInboxSummaryMaintenanceDiagnostic(
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    RoomInboxSummaryMaintenanceAction.MALFORMED,
                    List.of("sparseDocumentCount"),
                    "message-room-and-summary-count-differ"));
        }
        return report;
    }

    private void validateMessageToSummary(
            RoomInboxSummaryMaintenanceOptions options,
            RoomInboxSummaryMaintenanceReport report,
            Set<String> projectionViolationRooms
    ) {
        candidateReader.scan(
                options,
                new MongoRoomInboxSummaryCandidateReader
                        .CandidateVisitor() {
                    @Override
                    public void onCandidate(
                            RoomInboxSummaryCandidate candidate
                    ) {
                        report.incrementRoomsWithMessages();
                        validateStableCandidate(
                                candidate,
                                options,
                                report,
                                projectionViolationRooms);
                    }

                    @Override
                    public void onMalformed(
                            MongoRoomInboxSummaryCandidateReader
                                    .MalformedCandidate malformed
                    ) {
                        if (malformed.roomId() != null) {
                            report.incrementRoomsWithMessages();
                        }
                        report.incrementMalformedMessages();
                        diagnosticSink.accept(diagnostic(
                                malformed.roomId(),
                                malformed.messageId(),
                                RoomInboxSummaryMaintenanceAction.MALFORMED,
                                null,
                                List.of("message"),
                                malformed.reason()));
                    }
                });
    }

    private void validateStableCandidate(
            RoomInboxSummaryCandidate initial,
            RoomInboxSummaryMaintenanceOptions options,
            RoomInboxSummaryMaintenanceReport report,
            Set<String> projectionViolationRooms
    ) {
        RoomInboxSummaryCandidate current = initial;
        for (int attempt = 0;
                attempt <= options.maxRoomRetries();
                attempt++) {
            hook.afterCandidateRead(current, attempt);
            MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                    observed = repository.observe(
                    current.source().roomId());
            MongoRoomInboxSummaryCandidateReader.CandidateRead reread =
                    candidateReader.latest(current.source().roomId());
            if (reread.malformed() != null) {
                report.incrementMalformedMessages();
                return;
            }
            if (reread.missing()
                    || !current.source().equals(
                            reread.candidate().source())) {
                if (attempt < options.maxRoomRetries()
                        && !reread.missing()) {
                    current = reread.candidate();
                    continue;
                }
                concurrentlyChanged(current, report);
                return;
            }
            validateStablePair(
                    current,
                    observed,
                    report,
                    projectionViolationRooms);
            validateMessageSequence(current, report);
            return;
        }
    }

    private void validateStablePair(
            RoomInboxSummaryCandidate candidate,
            MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                    observed,
            RoomInboxSummaryMaintenanceReport report,
            Set<String> projectionViolationRooms
    ) {
        switch (observed.kind()) {
            case MISSING -> {
                recordProjectionViolation(
                        candidate.source().roomId(),
                        report,
                        projectionViolationRooms);
                diagnosticSink.accept(diagnostic(
                        candidate.source().roomId(),
                        candidate.source().messageId(),
                        RoomInboxSummaryMaintenanceAction.CREATE,
                        candidate,
                        List.of("summary"),
                        "missing-summary"));
            }
            case VALID -> {
                MongoRoomInboxSummaryRepairWriter.RepairAttempt mismatch =
                        MongoRoomInboxSummaryRepairWriter.classify(
                                observed,
                                candidate.expected());
                if (mismatch.action()
                        != RoomInboxSummaryMaintenanceAction.UNCHANGED) {
                    recordProjectionViolation(
                            candidate.source().roomId(),
                            report,
                            projectionViolationRooms);
                    diagnosticSink.accept(diagnostic(
                            candidate.source().roomId(),
                            candidate.source().messageId(),
                            mismatch.action(),
                            candidate,
                            mismatch.mismatchFields(),
                            "message-to-summary-mismatch"));
                }
            }
            case UNSUPPORTED_SCHEMA, MALFORMED -> {
                // Counted once during the Summary -> Message scan.
            }
        }
    }

    private void validateSummaryToMessage(
            RoomInboxSummaryMaintenanceOptions options,
            RoomInboxSummaryMaintenanceReport report,
            Set<String> projectionViolationRooms
    ) {
        repository.scan(options, observed -> {
            if (observed.roomId() == null) {
                report.incrementSummariesObserved();
                report.incrementMalformedSummaries();
                diagnosticSink.accept(diagnostic(
                        null,
                        null,
                        RoomInboxSummaryMaintenanceAction.MALFORMED,
                        null,
                        List.of("summary._id"),
                        "malformed-summary"));
            } else {
                validateReverse(
                        observed.roomId(),
                        options,
                        report,
                        projectionViolationRooms);
            }
        });
    }

    private void validateReverse(
            String roomId,
            RoomInboxSummaryMaintenanceOptions options,
            RoomInboxSummaryMaintenanceReport report,
            Set<String> projectionViolationRooms
    ) {
        StableReversePair stable = null;
        for (int attempt = 0;
                attempt <= options.maxRoomRetries();
                attempt++) {
            MongoRoomInboxSummaryCandidateReader.CandidateRead sourceA =
                    candidateReader.latest(roomId);
            MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                    summaryA = repository.observe(roomId);
            hook.afterReverseFirstObservation(roomId, attempt);
            MongoRoomInboxSummaryCandidateReader.CandidateRead sourceB =
                    candidateReader.latest(roomId);
            MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                    summaryB = repository.observe(roomId);
            if (sourceA.sameSnapshot(sourceB)
                    && summaryA.sameSnapshot(summaryB)) {
                stable = new StableReversePair(sourceB, summaryB);
                break;
            }
        }
        if (stable == null) {
            report.recordAction(
                    RoomInboxSummaryMaintenanceAction
                            .CONCURRENTLY_CHANGED);
            diagnosticSink.accept(diagnostic(
                    roomId,
                    null,
                    RoomInboxSummaryMaintenanceAction
                            .CONCURRENTLY_CHANGED,
                    null,
                    List.of("sourceSnapshot", "summarySnapshot"),
                    "reverse-validation-retry-exhausted"));
            return;
        }

        MongoRoomInboxSummaryCandidateReader.CandidateRead source =
                stable.source();
        MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                observed = stable.summary();
        if (observed.kind()
                == MongoRoomInboxSummaryMaintenanceRepository
                .ObservationKind.MISSING) {
            if (!source.missing() && source.malformed() == null) {
                recordProjectionViolation(
                        roomId, report, projectionViolationRooms);
                diagnosticSink.accept(diagnostic(
                        roomId,
                        source.candidate().source().messageId(),
                        RoomInboxSummaryMaintenanceAction.CREATE,
                        source.candidate(),
                        List.of("summary"),
                        "reverse-missing-summary"));
            }
            return;
        }

        report.incrementSummariesObserved();
        if (observed.kind()
                == MongoRoomInboxSummaryMaintenanceRepository
                .ObservationKind.UNSUPPORTED_SCHEMA) {
            report.incrementUnsupportedSchemas();
            diagnosticSink.accept(diagnostic(
                    roomId,
                    null,
                    RoomInboxSummaryMaintenanceAction.UNSUPPORTED_SCHEMA,
                    null,
                    List.of("schemaVersion"),
                    "unsupported-summary-schema"));
            return;
        }
        if (observed.kind()
                == MongoRoomInboxSummaryMaintenanceRepository
                .ObservationKind.MALFORMED) {
            report.incrementMalformedSummaries();
            diagnosticSink.accept(diagnostic(
                    roomId,
                    null,
                    RoomInboxSummaryMaintenanceAction.MALFORMED,
                    null,
                    List.of("summary"),
                    "malformed-summary"));
            return;
        }

        MongoRoomInboxSummaryMaintenanceRepository.StoredSummarySnapshot
                summary = observed.snapshot();
        if (source.missing()) {
            report.recordAction(
                    RoomInboxSummaryMaintenanceAction.ORPHAN_SUMMARY);
            diagnosticSink.accept(diagnostic(
                    roomId,
                    summary.messageId(),
                    RoomInboxSummaryMaintenanceAction.ORPHAN_SUMMARY,
                    null,
                    List.of("sourceMessage"),
                    "orphan-summary"));
            validateSummarySequence(
                    roomId, summary, report);
            return;
        }
        if (source.malformed() != null) {
            return;
        }

        MongoRoomInboxSummaryRepairWriter.RepairAttempt comparison =
                MongoRoomInboxSummaryRepairWriter.classify(
                        observed,
                        source.candidate().expected());
        if (comparison.action()
                != RoomInboxSummaryMaintenanceAction.UNCHANGED) {
            recordProjectionViolation(
                    roomId, report, projectionViolationRooms);
            diagnosticSink.accept(diagnostic(
                    roomId,
                    summary.messageId(),
                    comparison.action(),
                    source.candidate(),
                    comparison.mismatchFields(),
                    "reverse-exact-snapshot-mismatch"));
        }
        validateSummarySequence(roomId, summary, report);
    }

    private void validateMessageSequence(
            RoomInboxSummaryCandidate candidate,
            RoomInboxSummaryMaintenanceReport report
    ) {
        Long lastSequence = roomLastSequence(
                candidate.source().roomId());
        if (lastSequence == null
                || candidate.source().roomSequence() > lastSequence) {
            report.incrementSequenceViolations();
            diagnosticSink.accept(diagnostic(
                    candidate.source().roomId(),
                    candidate.source().messageId(),
                    RoomInboxSummaryMaintenanceAction.MALFORMED,
                    candidate,
                    List.of("roomSequence.lastSequence"),
                    "message-sequence-violation"));
        }
    }

    private void validateSummarySequence(
            String roomId,
            MongoRoomInboxSummaryMaintenanceRepository
                    .StoredSummarySnapshot summary,
            RoomInboxSummaryMaintenanceReport report
    ) {
        Long lastSequence = roomLastSequence(roomId);
        if (lastSequence == null
                || summary.roomSequence() > lastSequence) {
            report.incrementSequenceViolations();
            diagnosticSink.accept(diagnostic(
                    roomId,
                    summary.messageId(),
                    RoomInboxSummaryMaintenanceAction.MALFORMED,
                    null,
                    List.of("roomSequence.lastSequence"),
                    "summary-sequence-violation"));
        }
    }

    private Long roomLastSequence(String roomId) {
        Document raw = repository.mongoOperations()
                .getCollection(MongoRoomSequenceDocument.COLLECTION_NAME)
                .find(new Document("_id", roomId))
                .first();
        if (raw == null
                || !(raw.get("lastSequence") instanceof Long value)
                || value < 0) {
            return null;
        }
        return value;
    }

    private static void recordProjectionViolation(
            String roomId,
            RoomInboxSummaryMaintenanceReport report,
            Set<String> projectionViolationRooms
    ) {
        if (projectionViolationRooms.add(roomId)) {
            report.incrementProjectionViolations();
        }
    }

    private void concurrentlyChanged(
            RoomInboxSummaryCandidate candidate,
            RoomInboxSummaryMaintenanceReport report
    ) {
        report.recordAction(
                RoomInboxSummaryMaintenanceAction.CONCURRENTLY_CHANGED);
        diagnosticSink.accept(diagnostic(
                candidate.source().roomId(),
                candidate.source().messageId(),
                RoomInboxSummaryMaintenanceAction.CONCURRENTLY_CHANGED,
                candidate,
                List.of("sourceSnapshot"),
                "validation-retry-exhausted"));
    }

    private static RoomInboxSummaryMaintenanceDiagnostic diagnostic(
            String roomId,
            String messageId,
            RoomInboxSummaryMaintenanceAction action,
            RoomInboxSummaryCandidate expected,
            List<String> mismatchFields,
            String detail
    ) {
        return new RoomInboxSummaryMaintenanceDiagnostic(
                roomId,
                messageId,
                null,
                null,
                expected == null
                        ? null
                        : expected.source().roomSequence(),
                expected == null
                        ? null
                        : expected.source().messageVersion(),
                expected == null
                        ? null
                        : expected.source().state().name(),
                action,
                mismatchFields,
                detail);
    }

    private record StableReversePair(
            MongoRoomInboxSummaryCandidateReader.CandidateRead source,
            MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                    summary
    ) {
    }
}
