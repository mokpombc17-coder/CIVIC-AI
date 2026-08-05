package com.hamcheeze.chat.room.inbox.summary.maintenance;

import com.hamcheeze.chat.message.mongo.MongoRoomSequenceDocument;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryCandidateReader;
import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryMaintenanceRepository;
import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryRepairWriter;
import org.bson.Document;

import java.util.List;
import java.util.Objects;
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
        validateMessageToSummary(options, report);
        validateSummaryToMessage(options, report);
        if (report.roomsWithMessages() != report.summariesObserved()) {
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
            RoomInboxSummaryMaintenanceReport report
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
                                candidate, options, report);
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
            RoomInboxSummaryMaintenanceReport report
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
            validateStablePair(current, observed, report);
            validateMessageSequence(current, report);
            return;
        }
    }

    private void validateStablePair(
            RoomInboxSummaryCandidate candidate,
            MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                    observed,
            RoomInboxSummaryMaintenanceReport report
    ) {
        switch (observed.kind()) {
            case MISSING -> {
                report.incrementProjectionViolations();
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
                    report.incrementProjectionViolations();
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
            RoomInboxSummaryMaintenanceReport report
    ) {
        repository.scan(options, observed -> {
            report.incrementSummariesObserved();
            switch (observed.kind()) {
                case UNSUPPORTED_SCHEMA -> {
                    report.incrementUnsupportedSchemas();
                    diagnosticSink.accept(diagnostic(
                            observed.roomId(),
                            null,
                            RoomInboxSummaryMaintenanceAction
                                    .UNSUPPORTED_SCHEMA,
                            null,
                            List.of("schemaVersion"),
                            "unsupported-summary-schema"));
                }
                case MALFORMED -> {
                    report.incrementMalformedSummaries();
                    diagnosticSink.accept(diagnostic(
                            observed.roomId(),
                            null,
                            RoomInboxSummaryMaintenanceAction.MALFORMED,
                            null,
                            List.of("summary"),
                            "malformed-summary"));
                }
                case MISSING -> throw new IllegalStateException(
                        "Summary scan cannot yield missing observation");
                case VALID -> validateReverse(
                        observed, options, report);
            }
        });
    }

    private void validateReverse(
            MongoRoomInboxSummaryMaintenanceRepository.SummaryObservation
                    observed,
            RoomInboxSummaryMaintenanceOptions options,
            RoomInboxSummaryMaintenanceReport report
    ) {
        MongoRoomInboxSummaryMaintenanceRepository.StoredSummarySnapshot
                summary = observed.snapshot();
        MongoRoomInboxSummaryCandidateReader.CandidateRead stable = null;
        for (int attempt = 0;
                attempt <= options.maxRoomRetries();
                attempt++) {
            MongoRoomInboxSummaryCandidateReader.CandidateRead first =
                    candidateReader.latest(observed.roomId());
            MongoRoomInboxSummaryCandidateReader.CandidateRead second =
                    candidateReader.latest(observed.roomId());
            if (first.missing() && second.missing()) {
                stable = second;
                break;
            }
            if (first.malformed() != null
                    || second.malformed() != null) {
                report.incrementProjectionViolations();
                return;
            }
            if (!first.missing()
                    && !second.missing()
                    && first.candidate().source().equals(
                            second.candidate().source())) {
                stable = second;
                break;
            }
        }
        if (stable == null) {
            report.recordAction(
                    RoomInboxSummaryMaintenanceAction
                            .CONCURRENTLY_CHANGED);
            return;
        }
        if (stable.missing()) {
            report.recordAction(
                    RoomInboxSummaryMaintenanceAction.ORPHAN_SUMMARY);
            diagnosticSink.accept(diagnostic(
                    observed.roomId(),
                    summary.messageId(),
                    RoomInboxSummaryMaintenanceAction.ORPHAN_SUMMARY,
                    null,
                    List.of("sourceMessage"),
                    "orphan-summary"));
            validateSummarySequence(
                    observed.roomId(), summary, report);
            return;
        }

        MongoRoomInboxSummaryCandidateReader.MessageRead source =
                candidateReader.findMessage(
                        summary.messageId());
        if (source.missing()
                || source.malformedReason() != null
                || !source.message().roomId().equals(observed.roomId())
                || !source.message().messageId().equals(
                        stable.candidate().source().messageId())) {
            report.incrementProjectionViolations();
            diagnosticSink.accept(diagnostic(
                    observed.roomId(),
                    summary.messageId(),
                    RoomInboxSummaryMaintenanceAction.REPAIR_SNAPSHOT,
                    stable.candidate(),
                    List.of("sourceMessage"),
                    "summary-to-message-mismatch"));
        }
        validateSummarySequence(observed.roomId(), summary, report);
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
        if (raw == null || !(raw.get("lastSequence") instanceof Number value)) {
            return null;
        }
        return value.longValue();
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
}
