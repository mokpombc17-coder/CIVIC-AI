package com.hamcheeze.vote.opinionmap.application.finalization;

import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapFinalizationRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotManifestRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSubmissionProjectionRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalization;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalizationRequest;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalizationStatus;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;
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
    private final OpinionMapSnapshotManifestRepository manifests;
    private final OpinionMapSubmissionProjectionRepository submissions;
    private final OpinionMapSnapshotManifestFactory manifestFactory;
    private final Clock clock;
    private final Supplier<UUID> snapshotIdSupplier;

    @Autowired
    public OpinionMapFinalizationCoordinator(
            OpinionMapFinalizationRepository finalizations,
            OpinionMapSnapshotRepository snapshots,
            OpinionMapSnapshotManifestRepository manifests,
            OpinionMapSubmissionProjectionRepository submissions,
            OpinionMapSnapshotManifestFactory manifestFactory
    ) {
        this(finalizations, snapshots, manifests, submissions,
                manifestFactory, Clock.systemUTC(), UUID::randomUUID);
    }

    OpinionMapFinalizationCoordinator(
            OpinionMapFinalizationRepository finalizations,
            OpinionMapSnapshotRepository snapshots,
            OpinionMapSnapshotManifestRepository manifests,
            OpinionMapSubmissionProjectionRepository submissions,
            OpinionMapSnapshotManifestFactory manifestFactory,
            Clock clock,
            Supplier<UUID> snapshotIdSupplier
    ) {
        this.finalizations = Objects.requireNonNull(
                finalizations, "finalizations");
        this.snapshots = Objects.requireNonNull(snapshots, "snapshots");
        this.manifests = Objects.requireNonNull(manifests, "manifests");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.manifestFactory = Objects.requireNonNull(
                manifestFactory, "manifestFactory");
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
        OpinionMapSnapshot snapshot = resolveSnapshot(finalization);
        OpinionMapSnapshotManifest generated = manifestFactory.create(
                snapshot,
                submissions.findAllByTaskId(finalization.taskId()));
        Optional<OpinionMapSnapshotManifest> existingManifest =
                manifests.findBySnapshotId(snapshot.snapshotId());
        if (existingManifest.isPresent()) {
            validateManifest(
                    existingManifest.orElseThrow(), generated);
            return;
        }
        if (manifests.insertIfAbsent(generated)) {
            return;
        }
        OpinionMapSnapshotManifest conflicted = manifests.findBySnapshotId(
                        snapshot.snapshotId())
                .orElseThrow(() -> new IllegalStateException(
                        "opinion map snapshot manifest is unavailable after conflict"));
        validateManifest(conflicted, generated);
    }

    private OpinionMapSnapshot resolveSnapshot(
            OpinionMapFinalization finalization
    ) {
        Optional<OpinionMapSnapshot> existing = snapshots.findByTaskId(
                finalization.taskId());
        if (existing.isPresent()) {
            OpinionMapSnapshot snapshot = existing.orElseThrow();
            validateSnapshot(snapshot, finalization);
            return snapshot;
        }

        OpinionMapSnapshot snapshot = OpinionMapSnapshot.finalize(
                snapshotIdSupplier.get(), finalization, clock.instant());
        if (snapshots.insertIfAbsent(snapshot)) {
            return snapshot;
        }
        OpinionMapSnapshot conflicted = snapshots.findByTaskId(
                        finalization.taskId())
                .orElseThrow(() -> new IllegalStateException(
                        "opinion map snapshot is unavailable after conflict"));
        validateSnapshot(conflicted, finalization);
        return conflicted;
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

    private static void validateManifest(
            OpinionMapSnapshotManifest existing,
            OpinionMapSnapshotManifest generated
    ) {
        if (!existing.equals(generated)) {
            throw new OpinionMapSnapshotManifestConflictException(
                    generated.snapshotId());
        }
    }
}
