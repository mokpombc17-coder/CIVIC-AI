package com.hamcheeze.vote.opinionmap.application.query;

import com.hamcheeze.vote.opinionmap.application.finalization.OpinionMapSnapshotManifestFactory;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotManifestRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSubmissionProjectionRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapTaskQueryPort;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapReasonSource;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSubmissionProjection;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapTaskClosureType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OpinionMapSnapshotQueryServiceTest {

    private static final UUID SNAPSHOT_ID = uuid(1);
    private static final UUID TASK_ID = uuid(2);
    private static final UUID QUESTION_ID = uuid(3);
    private static final UUID FIRST_OPTION_ID = uuid(4);
    private static final UUID SECOND_OPTION_ID = uuid(5);
    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-19T01:00:00Z");

    private final OpinionMapSnapshotRepository snapshots =
            mock(OpinionMapSnapshotRepository.class);
    private final OpinionMapSnapshotManifestRepository manifests =
            mock(OpinionMapSnapshotManifestRepository.class);
    private final OpinionMapSubmissionProjectionRepository submissions =
            mock(OpinionMapSubmissionProjectionRepository.class);
    private final OpinionMapTaskQueryPort tasks =
            mock(OpinionMapTaskQueryPort.class);
    private final OpinionMapSnapshotManifestFactory manifestFactory =
            new OpinionMapSnapshotManifestFactory();
    private final OpinionMapSnapshotQueryService service =
            new OpinionMapSnapshotQueryService(
                    snapshots, manifests, submissions,
                    tasks, manifestFactory);

    @Test
    void returnsEmptyWhenSnapshotDoesNotExist() {
        when(snapshots.findBySnapshotId(SNAPSHOT_ID))
                .thenReturn(Optional.empty());

        assertThat(service.findBySnapshotId(SNAPSHOT_ID)).isEmpty();

        verifyNoInteractions(manifests, submissions, tasks);
    }

    @Test
    void returnsVerifiedImmutableResultWithContextAndSortedResponses() {
        OpinionMapSnapshot snapshot = snapshot(2);
        OpinionMapSubmissionProjection first = response(
                10, FIRST_OPTION_ID, OpinionMapReasonSource.AI_ACCEPTED,
                uuid(110), "AI 예상 이유");
        OpinionMapSubmissionProjection second = response(
                20, SECOND_OPTION_ID, OpinionMapReasonSource.USER_WRITTEN,
                null, "직접 작성 이유");
        List<OpinionMapSubmissionProjection> reversed =
                List.of(second, first);
        OpinionMapSnapshotManifest manifest = manifestFactory.create(
                snapshot, reversed);
        when(snapshots.findBySnapshotId(SNAPSHOT_ID))
                .thenReturn(Optional.of(snapshot));
        when(manifests.findBySnapshotId(SNAPSHOT_ID))
                .thenReturn(Optional.of(manifest));
        when(submissions.findAllByTaskId(TASK_ID)).thenReturn(reversed);
        when(tasks.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(taskContext()));

        var result = service.findBySnapshotId(SNAPSHOT_ID).orElseThrow();

        assertThat(result.status()).isEqualTo(
                OpinionMapSnapshotQueryService.SnapshotStatus.FINALIZED);
        assertThat(result.responseHashSha256()).isEqualTo(
                manifest.responseHashSha256());
        assertThat(result.question().questionId()).isEqualTo(QUESTION_ID);
        assertThat(result.question().options())
                .extracting(option -> option.responseCount())
                .containsExactly(1, 1);
        assertThat(result.responses())
                .extracting(response -> response.submissionId())
                .containsExactly(first.submissionId(), second.submissionId());
        assertThat(result.responses().getFirst().participantId())
                .isEqualTo(first.userId());
        assertThat(result.responses().getFirst().reasonSource())
                .isEqualTo(OpinionMapReasonSource.AI_ACCEPTED);
        assertThat(result.responses().getFirst().acceptedPredictedReasonId())
                .isEqualTo(uuid(110));
    }

    @Test
    void rejectsResponseSetThatDoesNotMatchStoredManifest() {
        OpinionMapSnapshot snapshot = snapshot(1);
        OpinionMapSubmissionProjection stored = response(
                10, FIRST_OPTION_ID, OpinionMapReasonSource.USER_WRITTEN,
                null, "원래 이유");
        OpinionMapSnapshotManifest manifest = manifestFactory.create(
                snapshot, List.of(stored));
        OpinionMapSubmissionProjection changed = response(
                10, FIRST_OPTION_ID, OpinionMapReasonSource.USER_WRITTEN,
                null, "변경된 이유");
        when(snapshots.findBySnapshotId(SNAPSHOT_ID))
                .thenReturn(Optional.of(snapshot));
        when(manifests.findBySnapshotId(SNAPSHOT_ID))
                .thenReturn(Optional.of(manifest));
        when(submissions.findAllByTaskId(TASK_ID))
                .thenReturn(List.of(changed));

        assertThatThrownBy(() -> service.findBySnapshotId(SNAPSHOT_ID))
                .isInstanceOf(OpinionMapSnapshotIntegrityException.class)
                .hasMessageContaining("manifest");
    }

    @Test
    void rejectsTaskContextThatIsNotClosed() {
        OpinionMapSnapshot snapshot = snapshot(0);
        OpinionMapSnapshotManifest manifest = manifestFactory.create(
                snapshot, List.of());
        when(snapshots.findBySnapshotId(SNAPSHOT_ID))
                .thenReturn(Optional.of(snapshot));
        when(manifests.findBySnapshotId(SNAPSHOT_ID))
                .thenReturn(Optional.of(manifest));
        when(submissions.findAllByTaskId(TASK_ID)).thenReturn(List.of());
        OpinionMapTaskQueryPort.TaskContext open = new OpinionMapTaskQueryPort
                .TaskContext(
                TASK_ID,
                "투표 제목",
                "투표 설명",
                OpinionMapTaskQueryPort.Status.OPEN,
                CLOSED_AT.minusSeconds(100),
                null,
                taskContext().questions());
        when(tasks.findByTaskId(TASK_ID)).thenReturn(Optional.of(open));

        assertThatThrownBy(() -> service.findBySnapshotId(SNAPSHOT_ID))
                .isInstanceOf(OpinionMapSnapshotIntegrityException.class)
                .hasMessageContaining("not closed");
    }

    private static OpinionMapSnapshot snapshot(int responseCount) {
        return new OpinionMapSnapshot(
                SNAPSHOT_ID,
                TASK_ID,
                OpinionMapTaskClosureType.DEADLINE_REACHED,
                CLOSED_AT,
                responseCount,
                responseCount,
                CLOSED_AT.plusSeconds(1));
    }

    private static OpinionMapTaskQueryPort.TaskContext taskContext() {
        return new OpinionMapTaskQueryPort.TaskContext(
                TASK_ID,
                "투표 제목",
                "투표 설명",
                OpinionMapTaskQueryPort.Status.CLOSED,
                CLOSED_AT.minusSeconds(100),
                CLOSED_AT,
                List.of(new OpinionMapTaskQueryPort.Question(
                        QUESTION_ID,
                        1,
                        OpinionMapTaskQueryPort.AnswerType.SINGLE_CHOICE,
                        "질문 문구",
                        "질문 설명",
                        List.of(
                                new OpinionMapTaskQueryPort.Option(
                                        FIRST_OPTION_ID,
                                        1,
                                        OpinionMapTaskQueryPort.OptionKind
                                                .STANDARD,
                                        "첫 번째 선택지"),
                                new OpinionMapTaskQueryPort.Option(
                                        SECOND_OPTION_ID,
                                        2,
                                        OpinionMapTaskQueryPort.OptionKind
                                                .STANDARD,
                                        "두 번째 선택지")))));
    }

    private static OpinionMapSubmissionProjection response(
            long suffix,
            UUID selectedOptionId,
            OpinionMapReasonSource reasonSource,
            UUID predictedReasonId,
            String finalReason
    ) {
        return new OpinionMapSubmissionProjection(
                uuid(suffix),
                "participant-" + suffix,
                TASK_ID,
                uuid(suffix + 1000),
                uuid(suffix + 2000),
                uuid(suffix + 3000),
                QUESTION_ID,
                selectedOptionId,
                reasonSource,
                predictedReasonId,
                finalReason,
                CLOSED_AT.minusSeconds(suffix));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13170000-0000-0000-0000-%012d".formatted(suffix));
    }
}
