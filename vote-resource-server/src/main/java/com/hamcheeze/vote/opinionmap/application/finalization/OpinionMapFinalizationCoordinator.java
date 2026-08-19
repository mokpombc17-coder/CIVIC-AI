package com.hamcheeze.vote.opinionmap.application.finalization;

import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapFinalizationRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSubmissionProjectionRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalization;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalizationRequest;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalizationStatus;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

@Service
public class OpinionMapFinalizationCoordinator {

    private final OpinionMapFinalizationRepository finalizations;
    private final OpinionMapSnapshotRepository snapshots;
    private final OpinionMapSubmissionProjectionRepository submissions;
    private final Clock clock;
    private final Supplier<UUID> snapshotIdSupplier;

    @Autowired
    public OpinionMapFinalizationCoordinator(
            OpinionMapFinalizationRepository finalizations,
            OpinionMapSnapshotRepository snapshots,
            OpinionMapSubmissionProjectionRepository submissions
    ) {
        this(finalizations, snapshots, submissions, Clock.systemUTC(),
                UUID::randomUUID);
    }

    OpinionMapFinalizationCoordinator(
            OpinionMapFinalizationRepository finalizations,
            OpinionMapSnapshotRepository snapshots,
            OpinionMapSubmissionProjectionRepository submissions,
            Clock clock,
            Supplier<UUID> snapshotIdSupplier
    ) {
        this.finalizations = Objects.requireNonNull(
                finalizations, "finalizations");
        this.snapshots = Objects.requireNonNull(snapshots, "snapshots");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.snapshotIdSupplier = Objects.requireNonNull(
                snapshotIdSupplier, "snapshotIdSupplier");
    }

    @Transactional
    public OpinionMapFinalization register(
            OpinionMapFinalizationRequest request
    ) {
        Objects.requireNonNull(request, "request");
        finalizations.lockTask(request.taskId());
        OpinionMapFinalization assessed = assess(request);
        if (finalizations.insertIfAbsent(assessed)) {
            finalizeSnapshotIfReady(assessed);
            return assessed;
        }

        OpinionMapFinalization existing = finalizations
                .findByTaskIdForUpdate(request.taskId())
                .orElseThrow(() -> new IllegalStateException(
                        "opinion map finalization is unavailable after conflict"));
        if (!existing.hasSameRequest(request)) {
            throw new OpinionMapFinalizationRequestConflictException(
                    request.taskId());
        }
        OpinionMapFinalization reassessed = reassessAndSave(existing);
        finalizeSnapshotIfReady(reassessed);
        return reassessed;
    }

    @Transactional
    public Optional<OpinionMapFinalization> reassess(UUID taskId) {
        Objects.requireNonNull(taskId, "taskId");
        finalizations.lockTask(taskId);
        return finalizations.findByTaskIdForUpdate(taskId)
                .map(this::reassessAndFinalize);
    }

    @Transactional
    public void prepareProjection(UUID taskId, UUID submissionId) {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(submissionId, "submissionId");
        finalizations.lockTask(taskId);
        if (snapshots.findByTaskId(taskId).isPresent()
                && submissions.findBySubmissionId(submissionId).isEmpty()) {
            throw new OpinionMapSnapshotAlreadyFinalizedException(taskId);
        }
    }

    private OpinionMapFinalization assess(
            OpinionMapFinalizationRequest request
    ) {
        int projectedSubmissionCount = Math.toIntExact(
                submissions.countByTaskId(request.taskId()));
        return OpinionMapFinalization.assess(
                request, projectedSubmissionCount, clock.instant());
    }

    private OpinionMapFinalization reassessAndSave(
            OpinionMapFinalization existing
    ) {
        OpinionMapFinalization reassessed = assess(existing.request());
        if (!reassessed.decision().equals(existing.decision())) {
            finalizations.updateDecision(reassessed);
            return reassessed;
        }
        return existing;
    }

    private OpinionMapFinalization reassessAndFinalize(
            OpinionMapFinalization existing
    ) {
        OpinionMapFinalization reassessed = reassessAndSave(existing);
        finalizeSnapshotIfReady(reassessed);
        return reassessed;
    }

    private void finalizeSnapshotIfReady(
            OpinionMapFinalization finalization
    ) {
        if (finalization.status()
                != OpinionMapFinalizationStatus.READY_TO_FINALIZE) {
            return;
        }
        Optional<OpinionMapSnapshot> existing = snapshots.findByTaskId(
                finalization.taskId());
        if (existing.isPresent()) {
            validateSnapshot(existing.orElseThrow(), finalization);
            return;
        }

        OpinionMapSnapshot snapshot = OpinionMapSnapshot.finalize(
                snapshotIdSupplier.get(), finalization, clock.instant());
        if (snapshots.insertIfAbsent(snapshot)) {
            return;
        }
        OpinionMapSnapshot conflicted = snapshots.findByTaskId(
                        finalization.taskId())
                .orElseThrow(() -> new IllegalStateException(
                        "opinion map snapshot is unavailable after conflict"));
        validateSnapshot(conflicted, finalization);
    }

    private static void validateSnapshot(
            OpinionMapSnapshot snapshot,
            OpinionMapFinalization finalization
    ) {
        if (!snapshot.matches(finalization)) {
            throw new OpinionMapSnapshotConflictException(
                    finalization.taskId());
        }
    }
}
