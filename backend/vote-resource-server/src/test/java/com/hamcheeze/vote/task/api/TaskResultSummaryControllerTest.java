package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.result.TaskResultSummaryQueryService;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1.OptionCount;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TaskResultSummaryControllerTest {

    private static final UUID TASK_ID = new UUID(0, 1);

    private final TaskResultSummaryQueryService summaries =
            mock(TaskResultSummaryQueryService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TaskResultSummaryController(summaries))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void returnsOptionCountsAsJson() throws Exception {
        when(summaries.findByTaskId(new TaskId(TASK_ID)))
                .thenReturn(Optional.of(summary()));

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/result-summary",
                        TASK_ID))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(
                        "application/json"))
                .andExpect(jsonPath("$.schemaVersion")
                        .value(TaskResultSummaryV1.SCHEMA_VERSION))
                .andExpect(jsonPath("$.resultVersion").value(1))
                .andExpect(jsonPath("$.responseCount").value(3))
                .andExpect(jsonPath("$.options[0].key").value("O1"))
                .andExpect(jsonPath("$.options[0].content")
                        .value("첫 번째"))
                .andExpect(jsonPath("$.options[0].count").value(1))
                .andExpect(jsonPath("$.options[1].key").value("O2"))
                .andExpect(jsonPath("$.options[1].count").value(2))
                .andExpect(jsonPath("$.options[2].key").value("O3"))
                .andExpect(jsonPath("$.options[2].count").value(0))
                .andExpect(jsonPath("$.taskId").doesNotExist())
                .andExpect(jsonPath("$.userId").doesNotExist())
                .andExpect(jsonPath("$.submittedAt").doesNotExist())
                .andExpect(jsonPath("$.reason").doesNotExist());
    }

    @Test
    void returnsNotFoundUntilAResultManifestExists() throws Exception {
        when(summaries.findByTaskId(new TaskId(TASK_ID)))
                .thenReturn(Optional.empty());

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/result-summary",
                        TASK_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("TASK_RESULT_SUMMARY_NOT_FOUND"));
    }

    private static TaskResultSummaryV1 summary() {
        return new TaskResultSummaryV1(
                TaskResultSummaryV1.SCHEMA_VERSION,
                1,
                3,
                List.of(
                        new OptionCount("O1", "첫 번째", 1),
                        new OptionCount("O2", "두 번째", 2),
                        new OptionCount("O3", "세 번째", 0)));
    }
}
