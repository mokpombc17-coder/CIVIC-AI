package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.domain.common.TaskId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaskResultSummaryQueryServiceTest {

    private static final TaskId TASK_ID = new TaskId(new UUID(0, 1));

    @Mock
    private TaskResultViewVerificationService verification;

    @Mock
    private TaskResultSummaryAssembler assembler;

    private TaskResultSummaryQueryService service;

    @BeforeEach
    void setUp() {
        service = new TaskResultSummaryQueryService(verification, assembler);
    }

    @Test
    void summarizesOnlyAVerifiedTaskResultView() {
        VerifiedTaskResultView verified = mock(VerifiedTaskResultView.class);
        TaskResultViewV1 view = mock(TaskResultViewV1.class);
        TaskResultSummaryV1 summary = mock(TaskResultSummaryV1.class);
        when(verification.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(verified));
        when(verified.view()).thenReturn(view);
        when(assembler.assemble(view)).thenReturn(summary);

        assertThat(service.findByTaskId(TASK_ID)).contains(summary);
    }

    @Test
    void anUnfinalizedTaskHasNoSummary() {
        when(verification.findByTaskId(TASK_ID))
                .thenReturn(Optional.empty());

        assertThat(service.findByTaskId(TASK_ID)).isEmpty();

        verifyNoInteractions(assembler);
    }
}
