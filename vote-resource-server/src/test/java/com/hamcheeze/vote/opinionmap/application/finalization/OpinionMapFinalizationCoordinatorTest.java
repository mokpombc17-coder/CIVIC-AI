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
import com.hamcheeze.vote.opinionmap.domain.OpinionMapOptionCount;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSubmissionProjection;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapTaskClosureType;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpinionMapFinalizationCoordinatorTest {

    private static final UUID TASK_ID = UUID.fromString(
            "13110000-0000-0000-0000-000000000201");
    private static final UUID SNAPSHOT_ID = UUID.fromString(
            "13110000-0000-0000-0000-000000000202");
    private static final UUID SUBMISSION_ID = UUID.fromString(
            "13110000-0000-0000-0000-000000000203");
    private static final UUID OPTION_ID = UUID.fromString(
            "13110000-0000-0000-0000-000000000204");
    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-19T01:00:00Z");
    private static final Instant EVALUATED_AT = Instant.parse(
            "2026-08-19T01:01:00Z");

    private final OpinionMapFinalizationRepository finalizations =
            mock(OpinionMapFinalizationRepository.class);
    private final OpinionMapSnapshotRepository snapshots =
            mock(OpinionMapSnapshotRepository.class);
    private final OpinionMapSnapshotManifestRepository manifests =
            mock(OpinionMapSnapshotManifestRepository.class);
    private final OpinionMapSubmissionProjectionRepository submissions =
            mock(OpinionMapSubmissionProjectionRepository.class);
    private final OpinionMapSnapshotManifestFactory manifestFactory =
            mock(OpinionMapSnapshotManifestFactory.class);
    private final OpinionMapFinalizationCoordinator coordinator =
            new OpinionMapFinalizationCoordinator(
                    finalizations,
                    snapshots,
                    manifests,
                    submissions,
                    manifestFactory,
                    Clock.fixed(EVALUATED_AT, ZoneOffset.UTC),
                    () -> SNAPSHOT_ID);

    @Test
    void registersWaitingStateFromCurrentProjectionCount() {
        when(submissions.countByTaskId(TASK_ID)).thenReturn(1L);
        when(finalizations.insertIfAbsent(any())).thenReturn(true);

        OpinionMapFinalization registered = coordinator.register(request(2));

        assertThat(registered.status()).isEqualTo(
                OpinionMapFinalizationStatus.WAITING_FOR_SUBMISSIONS);
        assertThat(registered.projectedSubmissionCount()).isEqualTo(1);
        assertThat(registered.evaluatedAt()).isEqualTo(EVALUATED_AT);
        verify(snapshots, never()).insertIfAbsent(any());
        var ordered = inOrder(finalizations, submissions);
        ordered.verify(finalizations).lockTask(TASK_ID);
        ordered.verify(submissions).countByTaskId(TASK_ID);
    }

    @Test
    void reassessesExistingWaitingStateAfterProjectionArrival() {
        OpinionMapFinalization waiting = OpinionMapFinalization.assess(
                request(2), 1, EVALUATED_AT.minusSeconds(1));
        when(finalizations.findByTaskIdForUpdate(TASK_ID))
                .thenReturn(Optional.of(waiting));
        when(submissions.countByTaskId(TASK_ID)).thenReturn(2L);
        when(snapshots.insertIfAbsent(any())).thenReturn(true);
        when(manifestFactory.create(any(), any())).thenReturn(manifest(2));
        when(manifests.insertIfAbsent(any())).thenReturn(true);

        OpinionMapFinalization ready = coordinator.reassess(TASK_ID)
                .orElseThrow();

        assertThat(ready.status()).isEqualTo(
                OpinionMapFinalizationStatus.READY_TO_FINALIZE);
        ArgumentCaptor<OpinionMapFinalization> saved =
                ArgumentCaptor.forClass(OpinionMapFinalization.class);
        verify(finalizations).updateDecision(saved.capture());
        assertThat(saved.getValue()).isEqualTo(ready);
        ArgumentCaptor<OpinionMapSnapshot> snapshot =
                ArgumentCaptor.forClass(OpinionMapSnapshot.class);
        verify(snapshots).insertIfAbsent(snapshot.capture());
        assertThat(snapshot.getValue()).isEqualTo(new OpinionMapSnapshot(
                SNAPSHOT_ID,
                TASK_ID,
                OpinionMapTaskClosureType.DEADLINE_REACHED,
                CLOSED_AT,
                2,
                2,
                EVALUATED_AT));
    }

    @Test
    void identicalRedeliveryDoesNotRewriteUnchangedDecision() {
        OpinionMapFinalization existing = OpinionMapFinalization.assess(
                request(2), 1, EVALUATED_AT.minusSeconds(1));
        when(finalizations.insertIfAbsent(any())).thenReturn(false);
        when(finalizations.findByTaskIdForUpdate(TASK_ID))
                .thenReturn(Optional.of(existing));
        when(submissions.countByTaskId(TASK_ID)).thenReturn(1L);

        OpinionMapFinalization replayed = coordinator.register(request(2));

        assertThat(replayed).isEqualTo(existing);
        verify(finalizations, never()).updateDecision(any());
    }

    @Test
    void rejectsDifferentRequestForSameTask() {
        OpinionMapFinalization existing = OpinionMapFinalization.assess(
                request(2), 1, EVALUATED_AT.minusSeconds(1));
        when(finalizations.insertIfAbsent(any())).thenReturn(false);
        when(finalizations.findByTaskIdForUpdate(TASK_ID))
                .thenReturn(Optional.of(existing));
        when(submissions.countByTaskId(TASK_ID)).thenReturn(1L);

        assertThatThrownBy(() -> coordinator.register(request(3)))
                .isInstanceOf(
                        OpinionMapFinalizationRequestConflictException.class);
        verify(finalizations, never()).updateDecision(any());
    }

    @Test
    void readyRedeliveryKeepsExistingSnapshotWithoutCreatingAnother() {
        OpinionMapFinalization ready = OpinionMapFinalization.assess(
                request(1), 1, EVALUATED_AT.minusSeconds(1));
        OpinionMapSnapshot existing = OpinionMapSnapshot.finalize(
                SNAPSHOT_ID, ready, EVALUATED_AT.minusSeconds(1));
        when(finalizations.insertIfAbsent(any())).thenReturn(false);
        when(finalizations.findByTaskIdForUpdate(TASK_ID))
                .thenReturn(Optional.of(ready));
        when(submissions.countByTaskId(TASK_ID)).thenReturn(1L);
        when(snapshots.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(existing));
        OpinionMapSnapshotManifest manifest = manifest(1);
        when(manifestFactory.create(any(), any())).thenReturn(manifest);
        when(manifests.findBySnapshotId(SNAPSHOT_ID))
                .thenReturn(Optional.of(manifest));

        coordinator.register(request(1));

        verify(snapshots, never()).insertIfAbsent(any());
        verify(manifests, never()).insertIfAbsent(any());
    }

    @Test
    void rejectsNewProjectionAfterSnapshotFinalization() {
        OpinionMapFinalization ready = OpinionMapFinalization.assess(
                request(1), 1, EVALUATED_AT.minusSeconds(1));
        when(snapshots.findByTaskId(TASK_ID)).thenReturn(Optional.of(
                OpinionMapSnapshot.finalize(
                        SNAPSHOT_ID, ready, EVALUATED_AT)));
        when(submissions.findBySubmissionId(SUBMISSION_ID))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> coordinator.prepareProjection(
                TASK_ID, SUBMISSION_ID))
                .isInstanceOf(
                        OpinionMapSnapshotAlreadyFinalizedException.class);
    }

    @Test
    void allowsIdempotentProjectionReplayAfterSnapshotFinalization() {
        OpinionMapFinalization ready = OpinionMapFinalization.assess(
                request(1), 1, EVALUATED_AT.minusSeconds(1));
        when(snapshots.findByTaskId(TASK_ID)).thenReturn(Optional.of(
                OpinionMapSnapshot.finalize(
                        SNAPSHOT_ID, ready, EVALUATED_AT)));
        when(submissions.findBySubmissionId(SUBMISSION_ID))
                .thenReturn(Optional.of(mock(
                        OpinionMapSubmissionProjection.class)));

        coordinator.prepareProjection(TASK_ID, SUBMISSION_ID);

        verify(finalizations).lockTask(TASK_ID);
    }

    private static OpinionMapFinalizationRequest request(int expectedCount) {
        return new OpinionMapFinalizationRequest(
                TASK_ID,
                OpinionMapTaskClosureType.DEADLINE_REACHED,
                CLOSED_AT,
                expectedCount);
    }

    private static OpinionMapSnapshotManifest manifest(int responseCount) {
        return new OpinionMapSnapshotManifest(
                SNAPSHOT_ID,
                OpinionMapSnapshotManifest.HASH_FORMAT_V1,
                "0".repeat(64),
                responseCount,
                responseCount == 0
                        ? List.of()
                        : List.of(new OpinionMapOptionCount(
                                OPTION_ID, responseCount)));
    }
}
