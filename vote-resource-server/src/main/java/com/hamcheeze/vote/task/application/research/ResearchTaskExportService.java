package com.hamcheeze.vote.task.application.research;

import com.hamcheeze.vote.task.application.result.TaskResultSummaryAssembler;
import com.hamcheeze.vote.task.application.result.TaskResultViewIntegrityException;
import com.hamcheeze.vote.task.application.result.TaskResultViewVerificationService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

@Service
public class ResearchTaskExportService {

    private static final Comparator<ResearchTaskExportParticipant>
            PARTICIPANT_ORDER = Comparator.comparing(participant ->
                    participant.submissionId().value().toString());

    private final TaskResultViewVerificationService verification;
    private final TaskResultSummaryAssembler summaryAssembler;
    private final ResearchTaskExportDataReader dataReader;
    private final ResearchTaskExportArtifactGenerator artifactGenerator;

    public ResearchTaskExportService(
            TaskResultViewVerificationService verification,
            TaskResultSummaryAssembler summaryAssembler,
            ResearchTaskExportDataReader dataReader,
            ResearchTaskExportArtifactGenerator artifactGenerator
    ) {
        this.verification = Objects.requireNonNull(
                verification, "verification");
        this.summaryAssembler = Objects.requireNonNull(
                summaryAssembler, "summaryAssembler");
        this.dataReader = Objects.requireNonNull(dataReader, "dataReader");
        this.artifactGenerator = Objects.requireNonNull(
                artifactGenerator, "artifactGenerator");
    }

    @Transactional(readOnly = true)
    public Optional<ResearchTaskExportArtifact> export(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return verification.findByTaskId(taskId).map(verified -> {
            try {
                List<ResearchTaskExportParticipant> participants =
                        orderedParticipants(
                                taskId,
                                dataReader.findParticipants(taskId));
                if (participants.size()
                        != verified.view().responses().size()) {
                    throw integrity(taskId,
                            "research participant count does not match");
                }
                return artifactGenerator.generate(
                        taskId,
                        verified,
                        summaryAssembler.assemble(verified.view()),
                        participants);
            } catch (TaskResultViewIntegrityException exception) {
                throw exception;
            } catch (IllegalArgumentException | IllegalStateException
                     exception) {
                throw integrity(taskId,
                        "research export cannot be assembled");
            }
        });
    }

    private static List<ResearchTaskExportParticipant> orderedParticipants(
            TaskId taskId,
            List<ResearchTaskExportParticipant> participants
    ) {
        List<ResearchTaskExportParticipant> ordered = new ArrayList<>(
                Objects.requireNonNull(participants, "participants"));
        ordered.sort(PARTICIPANT_ORDER);
        Set<Object> submissionIds = new HashSet<>();
        Set<String> userIds = new HashSet<>();
        for (ResearchTaskExportParticipant participant : ordered) {
            Objects.requireNonNull(participant, "participant");
            if (!submissionIds.add(participant.submissionId())) {
                throw integrity(taskId,
                        "research participants contain duplicate submission");
            }
            if (!userIds.add(participant.userId())) {
                throw integrity(taskId,
                        "research participants contain duplicate user");
            }
        }
        return List.copyOf(ordered);
    }

    private static TaskResultViewIntegrityException integrity(
            TaskId taskId,
            String reason
    ) {
        return new TaskResultViewIntegrityException(taskId, reason);
    }
}
