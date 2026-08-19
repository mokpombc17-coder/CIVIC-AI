package com.hamcheeze.vote.opinionmap.application.query;

import com.hamcheeze.vote.opinionmap.application.finalization.OpinionMapSnapshotManifestFactory;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotManifestRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSubmissionProjectionRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapTaskQueryPort;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapTaskQueryPort.OptionKind;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapTaskQueryPort.Status;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapReasonSource;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSubmissionProjection;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapTaskClosureType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class OpinionMapSnapshotQueryService {

    private static final Comparator<OpinionMapSubmissionProjection>
            SUBMISSION_ORDER = Comparator.comparing(
                    response -> response.submissionId().toString());

    private final OpinionMapSnapshotRepository snapshots;
    private final OpinionMapSnapshotManifestRepository manifests;
    private final OpinionMapSubmissionProjectionRepository submissions;
    private final OpinionMapTaskQueryPort taskContexts;
    private final OpinionMapSnapshotManifestFactory manifestFactory;

    public OpinionMapSnapshotQueryService(
            OpinionMapSnapshotRepository snapshots,
            OpinionMapSnapshotManifestRepository manifests,
            OpinionMapSubmissionProjectionRepository submissions,
            OpinionMapTaskQueryPort taskContexts,
            OpinionMapSnapshotManifestFactory manifestFactory
    ) {
        this.snapshots = Objects.requireNonNull(snapshots, "snapshots");
        this.manifests = Objects.requireNonNull(manifests, "manifests");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.taskContexts = Objects.requireNonNull(
                taskContexts, "taskContexts");
        this.manifestFactory = Objects.requireNonNull(
                manifestFactory, "manifestFactory");
    }

    @Transactional(readOnly = true)
    public Optional<SnapshotResult> findBySnapshotId(UUID snapshotId) {
        Objects.requireNonNull(snapshotId, "snapshotId");
        return snapshots.findBySnapshotId(snapshotId)
                .map(this::assemble);
    }

    private SnapshotResult assemble(OpinionMapSnapshot snapshot) {
        OpinionMapSnapshotManifest manifest = manifests.findBySnapshotId(
                        snapshot.snapshotId())
                .orElseThrow(() -> integrity(
                        snapshot, "manifest is missing"));
        List<OpinionMapSubmissionProjection> responses = submissions
                .findAllByTaskId(snapshot.taskId()).stream()
                .sorted(SUBMISSION_ORDER)
                .toList();
        OpinionMapSnapshotManifest recalculated;
        try {
            recalculated = manifestFactory.create(snapshot, responses);
        } catch (IllegalArgumentException exception) {
            throw integrity(snapshot, exception.getMessage());
        }
        if (!manifest.equals(recalculated)) {
            throw integrity(snapshot,
                    "stored manifest does not match current responses");
        }

        OpinionMapTaskQueryPort.TaskContext task = taskContexts.findByTaskId(
                        snapshot.taskId())
                .orElseThrow(() -> integrity(
                        snapshot, "task context is missing"));
        validateTaskContext(snapshot, task, responses);
        OpinionMapTaskQueryPort.Question question =
                task.questions().getFirst();
        Map<UUID, Integer> counts = new HashMap<>();
        manifest.optionCounts().forEach(count -> counts.put(
                count.optionId(), count.responseCount()));

        return new SnapshotResult(
                snapshot.snapshotId(),
                snapshot.taskId(),
                SnapshotStatus.FINALIZED,
                snapshot.closureType(),
                snapshot.closedAt(),
                snapshot.finalizedAt(),
                snapshot.expectedSubmissionCount(),
                snapshot.responseCount(),
                manifest.responseHashFormat(),
                manifest.responseHashSha256(),
                task.title(),
                task.description(),
                new QuestionResult(
                        question.questionId(),
                        question.content(),
                        question.description(),
                        question.options().stream()
                                .map(option -> new OptionResult(
                                        option.optionId(),
                                        option.displayOrder(),
                                        option.content(),
                                        counts.getOrDefault(
                                                option.optionId(), 0)))
                                .toList()),
                responses.stream()
                        .map(OpinionMapSnapshotQueryService::mapResponse)
                        .toList());
    }

    private static void validateTaskContext(
            OpinionMapSnapshot snapshot,
            OpinionMapTaskQueryPort.TaskContext task,
            List<OpinionMapSubmissionProjection> responses
    ) {
        if (!snapshot.taskId().equals(task.taskId())) {
            throw integrity(snapshot, "task ID does not match");
        }
        if (task.status() != Status.CLOSED) {
            throw integrity(snapshot, "task is not closed");
        }
        if (!snapshot.closedAt().equals(task.closedAt())) {
            throw integrity(snapshot, "task closedAt does not match");
        }
        if (task.questions().size() != 1) {
            throw integrity(snapshot,
                    "closed task must have exactly one question");
        }
        OpinionMapTaskQueryPort.Question question =
                task.questions().getFirst();
        if (question.answerType()
                != OpinionMapTaskQueryPort.AnswerType.SINGLE_CHOICE) {
            throw integrity(snapshot, "question must be single choice");
        }
        if (question.options().stream()
                .anyMatch(option -> option.kind() == OptionKind.OTHER)) {
            throw integrity(snapshot, "question must not have OTHER option");
        }
        Set<UUID> optionIds = new HashSet<>();
        question.options().forEach(option -> optionIds.add(option.optionId()));
        for (OpinionMapSubmissionProjection response : responses) {
            if (!question.questionId().equals(response.questionId())) {
                throw integrity(snapshot,
                        "response question ID does not match task");
            }
            if (!optionIds.contains(response.selectedOptionId())) {
                throw integrity(snapshot,
                        "response option ID does not exist in task");
            }
        }
    }

    private static ParticipantResponse mapResponse(
            OpinionMapSubmissionProjection response
    ) {
        return new ParticipantResponse(
                response.submissionId(),
                response.userId(),
                response.predictionId(),
                response.personaGenerationId(),
                response.personaVersionId(),
                response.selectedOptionId(),
                response.reasonSource(),
                response.acceptedPredictedReasonId(),
                response.finalReason(),
                response.submittedAt());
    }

    private static OpinionMapSnapshotIntegrityException integrity(
            OpinionMapSnapshot snapshot,
            String reason
    ) {
        return new OpinionMapSnapshotIntegrityException(
                snapshot.snapshotId(), reason);
    }

    public record SnapshotResult(
            UUID snapshotId,
            UUID taskId,
            SnapshotStatus status,
            OpinionMapTaskClosureType closureType,
            Instant closedAt,
            Instant finalizedAt,
            int expectedSubmissionCount,
            int responseCount,
            String responseHashFormat,
            String responseHashSha256,
            String taskTitle,
            String taskDescription,
            QuestionResult question,
            List<ParticipantResponse> responses
    ) {

        public SnapshotResult {
            Objects.requireNonNull(snapshotId, "snapshotId");
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(closureType, "closureType");
            Objects.requireNonNull(closedAt, "closedAt");
            Objects.requireNonNull(finalizedAt, "finalizedAt");
            Objects.requireNonNull(taskTitle, "taskTitle");
            Objects.requireNonNull(question, "question");
            responses = List.copyOf(Objects.requireNonNull(
                    responses, "responses"));
        }
    }

    public record QuestionResult(
            UUID questionId,
            String content,
            String description,
            List<OptionResult> options
    ) {

        public QuestionResult {
            Objects.requireNonNull(questionId, "questionId");
            Objects.requireNonNull(content, "content");
            options = List.copyOf(Objects.requireNonNull(
                    options, "options"));
        }
    }

    public record OptionResult(
            UUID optionId,
            int displayOrder,
            String content,
            int responseCount
    ) {
    }

    public record ParticipantResponse(
            UUID submissionId,
            String participantId,
            UUID predictionId,
            UUID personaGenerationId,
            UUID personaVersionId,
            UUID selectedOptionId,
            OpinionMapReasonSource reasonSource,
            UUID acceptedPredictedReasonId,
            String finalReason,
            Instant submittedAt
    ) {
    }

    public enum SnapshotStatus {
        FINALIZED
    }
}
