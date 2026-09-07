package com.hamcheeze.vote.task.application.research;

import com.hamcheeze.vote.task.application.result.TaskResultSummaryAssembler;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1;
import com.hamcheeze.vote.task.application.result.TaskResultViewIntegrityException;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1;
import com.hamcheeze.vote.task.application.result.TaskResultViewVerificationService;
import com.hamcheeze.vote.task.application.result.VerifiedTaskResultView;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResearchTaskExportServiceTest {

    private static final TaskId TASK_ID = new TaskId(new UUID(0, 1));

    @Mock
    private TaskResultViewVerificationService verification;
    @Mock
    private TaskResultSummaryAssembler summaryAssembler;
    @Mock
    private ResearchTaskExportDataReader dataReader;
    @Mock
    private ResearchTaskExportArtifactGenerator artifactGenerator;

    private ResearchTaskExportService service;

    @BeforeEach
    void setUp() {
        service = new ResearchTaskExportService(
                verification,
                summaryAssembler,
                dataReader,
                artifactGenerator);
    }

    @Test
    void verifiesResultAndOrdersResearchIdentitiesBySubmissionId() {
        VerifiedTaskResultView verified = verified(2);
        TaskResultSummaryV1 summary = mock(TaskResultSummaryV1.class);
        ResearchTaskExportArtifact artifact =
                new ResearchTaskExportArtifact(
                        new byte[]{1}, "a".repeat(64), 2, 0);
        ResearchTaskExportParticipant later = participant(20, "user-2");
        ResearchTaskExportParticipant earlier = participant(10, "user-1");
        when(verification.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(verified));
        when(dataReader.findParticipants(TASK_ID))
                .thenReturn(List.of(later, earlier));
        when(summaryAssembler.assemble(verified.view()))
                .thenReturn(summary);
        when(artifactGenerator.generate(
                org.mockito.ArgumentMatchers.eq(TASK_ID),
                org.mockito.ArgumentMatchers.eq(verified),
                org.mockito.ArgumentMatchers.eq(summary),
                org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(artifact);

        assertThat(service.export(TASK_ID)).contains(artifact);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ResearchTaskExportParticipant>> captor =
                ArgumentCaptor.forClass(List.class);
        verify(artifactGenerator).generate(
                org.mockito.ArgumentMatchers.eq(TASK_ID),
                org.mockito.ArgumentMatchers.eq(verified),
                org.mockito.ArgumentMatchers.eq(summary),
                captor.capture());
        assertThat(captor.getValue()).containsExactly(earlier, later);
    }

    @Test
    void rejectsIdentityCountThatDoesNotMatchVerifiedResponses() {
        VerifiedTaskResultView verified = verified(1);
        when(verification.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(verified));
        when(dataReader.findParticipants(TASK_ID))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service.export(TASK_ID))
                .isInstanceOf(TaskResultViewIntegrityException.class)
                .hasMessageContaining(
                        "research participant count does not match");
        verifyNoInteractions(summaryAssembler, artifactGenerator);
    }

    @Test
    void returnsEmptyWhenFinalizedResultDoesNotExist() {
        when(verification.findByTaskId(TASK_ID))
                .thenReturn(Optional.empty());

        assertThat(service.export(TASK_ID)).isEmpty();
        verifyNoInteractions(
                summaryAssembler, dataReader, artifactGenerator);
    }

    private static VerifiedTaskResultView verified(int responseCount) {
        VerifiedTaskResultView verified = mock(VerifiedTaskResultView.class);
        TaskResultViewV1 view = mock(TaskResultViewV1.class);
        List<TaskResultViewV1.ResponseData> responses =
                java.util.stream.IntStream.range(0, responseCount)
                        .mapToObj(ignored ->
                                mock(TaskResultViewV1.ResponseData.class))
                        .toList();
        when(verified.view()).thenReturn(view);
        when(view.responses()).thenReturn(responses);
        return verified;
    }

    private static ResearchTaskExportParticipant participant(
            long submissionId,
            String userId
    ) {
        return new ResearchTaskExportParticipant(
                new TaskSubmissionId(new UUID(0, submissionId)),
                userId,
                "persona-" + userId,
                null,
                null,
                List.of());
    }
}
