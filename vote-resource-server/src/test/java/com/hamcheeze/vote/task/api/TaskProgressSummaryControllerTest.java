package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.query.TaskProgressSummaryQueryService;
import com.hamcheeze.vote.task.application.query.TaskProgressSummaryQueryService.OptionProgress;
import com.hamcheeze.vote.task.application.query.TaskProgressSummaryQueryService.TaskProgressSummary;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TaskProgressSummaryControllerTest {

    private static final UUID TASK_ID = new UUID(0, 1);
    private static final UUID FIRST_OPTION_ID = new UUID(0, 2);
    private static final UUID SECOND_OPTION_ID = new UUID(0, 3);
    private static final Instant OBSERVED_AT =
            Instant.parse("2026-09-03T01:00:00Z");

    private final TaskProgressSummaryQueryService summaries =
            mock(TaskProgressSummaryQueryService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TaskProgressSummaryController(summaries))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void returnsOnlyQuantitativeProgressFieldsAndDisablesCaching()
            throws Exception {
        when(summaries.findByTaskId(new TaskId(TASK_ID)))
                .thenReturn(Optional.of(summary()));

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/progress-summary",
                        TASK_ID))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.taskId").value(TASK_ID.toString()))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.observedAt")
                        .value(OBSERVED_AT.toString()))
                .andExpect(jsonPath("$.submissionCount").value(3))
                .andExpect(jsonPath("$.options[0].optionId")
                        .value(FIRST_OPTION_ID.toString()))
                .andExpect(jsonPath("$.options[0].content").value("찬성"))
                .andExpect(jsonPath("$.options[0].count").value(2))
                .andExpect(jsonPath("$.options[0].rate")
                        .value(2.0 / 3.0))
                .andExpect(jsonPath("$.options[1].optionId")
                        .value(SECOND_OPTION_ID.toString()))
                .andExpect(jsonPath("$.options[1].count").value(1))
                .andExpect(jsonPath("$.userId").doesNotExist())
                .andExpect(jsonPath("$.personaId").doesNotExist())
                .andExpect(jsonPath("$.finalReason").doesNotExist())
                .andExpect(jsonPath("$.options[0].userId").doesNotExist())
                .andExpect(jsonPath("$.options[0].reason").doesNotExist());
    }

    @Test
    void returnsTaskNotFoundForUnknownTask() throws Exception {
        when(summaries.findByTaskId(new TaskId(TASK_ID)))
                .thenReturn(Optional.empty());

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/progress-summary",
                        TASK_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));
    }

    @Test
    void returnsConflictWhenTaskIsNotOpen() throws Exception {
        when(summaries.findByTaskId(new TaskId(TASK_ID)))
                .thenThrow(TaskDomainException.invariant(
                        "TASK_PROGRESS_SUMMARY_NOT_AVAILABLE",
                        "task.status",
                        "progress summary is available only while task is open"));

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/progress-summary",
                        TASK_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("TASK_PROGRESS_SUMMARY_NOT_AVAILABLE"))
                .andExpect(jsonPath("$.violations[0].path")
                        .value("task.status"));
    }

    private static TaskProgressSummary summary() {
        return new TaskProgressSummary(
                new TaskId(TASK_ID),
                TaskStatus.OPEN,
                OBSERVED_AT,
                3,
                List.of(
                        new OptionProgress(
                                new TaskOptionId(FIRST_OPTION_ID),
                                "찬성", 2, 2.0 / 3.0),
                        new OptionProgress(
                                new TaskOptionId(SECOND_OPTION_ID),
                                "반대", 1, 1.0 / 3.0)));
    }
}
