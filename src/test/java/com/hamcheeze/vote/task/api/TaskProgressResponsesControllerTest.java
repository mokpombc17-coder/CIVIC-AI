package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.query.TaskProgressResponsesQueryService;
import com.hamcheeze.vote.task.application.query.TaskProgressResponsesQueryService.TaskProgressResponse;
import com.hamcheeze.vote.task.application.query.TaskProgressResponsesQueryService.TaskProgressResponsePage;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
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

class TaskProgressResponsesControllerTest {

    private static final UUID TASK_ID = new UUID(0, 1);
    private static final UUID OPTION_ID = new UUID(0, 2);
    private static final Instant OBSERVED_AT =
            Instant.parse("2026-09-03T01:00:00Z");
    private static final Instant SUBMITTED_AT =
            Instant.parse("2026-09-03T00:50:00Z");

    private final TaskProgressResponsesQueryService responses =
            mock(TaskProgressResponsesQueryService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TaskProgressResponsesController(responses))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void returnsAnonymousResponsesAndDisablesCaching() throws Exception {
        when(responses.findByTaskId(new TaskId(TASK_ID), null, 100))
                .thenReturn(Optional.of(page()));

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/progress-responses",
                        TASK_ID))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.taskId").value(TASK_ID.toString()))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.observedAt")
                        .value(OBSERVED_AT.toString()))
                .andExpect(jsonPath("$.responses[0].selectedOptionId")
                        .value(OPTION_ID.toString()))
                .andExpect(jsonPath(
                        "$.responses[0].selectedOptionContent")
                        .value("찬성"))
                .andExpect(jsonPath("$.responses[0].reasonSource")
                        .value("AI_ACCEPTED"))
                .andExpect(jsonPath("$.responses[0].reason")
                        .value("AI 예상 이유를 채택했습니다."))
                .andExpect(jsonPath("$.responses[0].submittedAt")
                        .value(SUBMITTED_AT.toString()))
                .andExpect(jsonPath("$.nextCursor").value("next-cursor"))
                .andExpect(jsonPath("$.hasMore").value(true))
                .andExpect(jsonPath("$.responses[0].userId")
                        .doesNotExist())
                .andExpect(jsonPath("$.responses[0].personaId")
                        .doesNotExist())
                .andExpect(jsonPath("$.responses[0].submissionId")
                        .doesNotExist())
                .andExpect(jsonPath("$.responses[0].predictionId")
                        .doesNotExist());
    }

    @Test
    void returnsTaskNotFoundForUnknownTask() throws Exception {
        when(responses.findByTaskId(new TaskId(TASK_ID), null, 100))
                .thenReturn(Optional.empty());

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/progress-responses",
                        TASK_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));
    }

    @Test
    void returnsConflictWhenTaskIsNotOpen() throws Exception {
        when(responses.findByTaskId(new TaskId(TASK_ID), null, 100))
                .thenThrow(TaskDomainException.invariant(
                        "TASK_PROGRESS_RESPONSES_NOT_AVAILABLE",
                        "task.status",
                        "progress responses are available only while task is open"));

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/progress-responses",
                        TASK_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("TASK_PROGRESS_RESPONSES_NOT_AVAILABLE"))
                .andExpect(jsonPath("$.violations[0].path")
                        .value("task.status"));
    }

    private static TaskProgressResponsePage page() {
        return new TaskProgressResponsePage(
                new TaskId(TASK_ID), TaskStatus.OPEN, OBSERVED_AT,
                List.of(new TaskProgressResponse(
                        new TaskOptionId(OPTION_ID), "찬성",
                        TaskReasonSource.AI_ACCEPTED,
                        "AI 예상 이유를 채택했습니다.", SUBMITTED_AT)),
                "next-cursor", true);
    }
}
