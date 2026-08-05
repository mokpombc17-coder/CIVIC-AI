package com.hamcheeze.chat.room.inbox.summary.maintenance;

import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryCandidateReader;
import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryRepairWriter;

import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;

public final class RoomInboxSummaryBackfillService {

    private final MongoRoomInboxSummaryCandidateReader candidateReader;
    private final MongoRoomInboxSummaryRepairWriter repairWriter;
    private final RoomInboxSummaryMaintenanceHook hook;
    private final Consumer<RoomInboxSummaryMaintenanceDiagnostic>
            diagnosticSink;

    public RoomInboxSummaryBackfillService(
            MongoRoomInboxSummaryCandidateReader candidateReader,
            MongoRoomInboxSummaryRepairWriter repairWriter,
            Consumer<RoomInboxSummaryMaintenanceDiagnostic> diagnosticSink
    ) {
        this(
                candidateReader,
                repairWriter,
                RoomInboxSummaryMaintenanceHook.NONE,
                diagnosticSink);
    }

    public RoomInboxSummaryBackfillService(
            MongoRoomInboxSummaryCandidateReader candidateReader,
            MongoRoomInboxSummaryRepairWriter repairWriter,
            RoomInboxSummaryMaintenanceHook hook,
            Consumer<RoomInboxSummaryMaintenanceDiagnostic> diagnosticSink
    ) {
        this.candidateReader = Objects.requireNonNull(
                candidateReader, "candidateReader");
        this.repairWriter = Objects.requireNonNull(
                repairWriter, "repairWriter");
        this.hook = Objects.requireNonNull(hook, "hook");
        this.diagnosticSink = Objects.requireNonNull(
                diagnosticSink, "diagnosticSink");
    }

    public RoomInboxSummaryMaintenanceReport run(
            RoomInboxSummaryMaintenanceOptions options
    ) {
        if (options.mode()
                == RoomInboxSummaryMaintenanceMode.VALIDATE) {
            throw new IllegalArgumentException(
                    "Backfill service does not run validate mode");
        }
        RoomInboxSummaryMaintenanceReport report =
                new RoomInboxSummaryMaintenanceReport(options.mode());
        report.addSummariesObserved(
                repairWriter.summariesObserved(options));
        candidateReader.scan(
                options,
                new MongoRoomInboxSummaryCandidateReader
                        .CandidateVisitor() {
                    @Override
                    public void onCandidate(
                            RoomInboxSummaryCandidate candidate
                    ) {
                        report.incrementRoomsWithMessages();
                        process(candidate, options, report);
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
        return report;
    }

    private void process(
            RoomInboxSummaryCandidate initial,
            RoomInboxSummaryMaintenanceOptions options,
            RoomInboxSummaryMaintenanceReport report
    ) {
        RoomInboxSummaryCandidate current = initial;
        boolean wrote = false;
        try {
            for (int attempt = 0;
                    attempt <= options.maxRoomRetries();
                    attempt++) {
                hook.afterCandidateRead(current, attempt);
                MongoRoomInboxSummaryRepairWriter.RepairAttempt repair =
                        options.mode()
                                == RoomInboxSummaryMaintenanceMode.APPLY
                                ? repairWriter.applyExpected(
                                        current.expected())
                                : repairWriter.inspect(current.expected());
                if (repair.applied()) {
                    wrote = true;
                    report.recordAction(repair.action());
                }

                MongoRoomInboxSummaryCandidateReader.CandidateRead reread =
                        candidateReader.latest(
                                current.source().roomId());
                if (reread.malformed() != null) {
                    report.incrementMalformedMessages();
                    diagnosticSink.accept(diagnostic(
                            reread.roomId(),
                            reread.malformed().messageId(),
                            RoomInboxSummaryMaintenanceAction.MALFORMED,
                            current,
                            List.of("message"),
                            reread.malformed().reason()));
                    return;
                }
                boolean sourceChanged = reread.missing()
                        || !current.source().equals(
                                reread.candidate().source());
                boolean summaryChanged = repair.action()
                        == RoomInboxSummaryMaintenanceAction
                        .CONCURRENTLY_CHANGED;
                if (sourceChanged || summaryChanged) {
                    if (attempt < options.maxRoomRetries()
                            && !reread.missing()) {
                        current = reread.candidate();
                        continue;
                    }
                    report.recordAction(
                            RoomInboxSummaryMaintenanceAction
                                    .CONCURRENTLY_CHANGED);
                    diagnosticSink.accept(diagnostic(
                            current.source().roomId(),
                            current.source().messageId(),
                            RoomInboxSummaryMaintenanceAction
                                    .CONCURRENTLY_CHANGED,
                            current,
                            List.of("sourceSnapshot"),
                            "retry-exhausted"));
                    return;
                }

                if (!repair.applied()) {
                    if (repair.action()
                            != RoomInboxSummaryMaintenanceAction.UNCHANGED
                            || !wrote) {
                        report.recordAction(repair.action());
                    }
                    if (repair.action()
                            != RoomInboxSummaryMaintenanceAction.UNCHANGED) {
                        diagnosticSink.accept(diagnostic(
                                current.source().roomId(),
                                current.source().messageId(),
                                repair.action(),
                                current,
                                repair.mismatchFields(),
                                "stable-observation"));
                    }
                }
                return;
            }
        } catch (RuntimeException exception) {
            report.recordAction(RoomInboxSummaryMaintenanceAction.FAILED);
            diagnosticSink.accept(diagnostic(
                    current.source().roomId(),
                    current.source().messageId(),
                    RoomInboxSummaryMaintenanceAction.FAILED,
                    current,
                    List.of(),
                    exception.getClass().getSimpleName()));
        }
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
