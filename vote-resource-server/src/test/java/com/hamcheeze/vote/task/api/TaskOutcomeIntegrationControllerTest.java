package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.query.TaskOutcomeQueryService;
import com.hamcheeze.vote.task.application.query.TaskOutcomeView;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
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

class TaskOutcomeIntegrationControllerTest {

    private static final UUID TASK_UUID = UUID.fromString(
            "10000000-0000-0000-0000-000000000001");
    private static final TaskId TASK_ID = new TaskId(TASK_UUID);

    private final TaskOutcomeQueryService outcomes =
            mock(TaskOutcomeQueryService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TaskOutcomeIntegrationController(outcomes))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void returnsPullPageContractWithoutCaching() throws Exception {
        TaskOutcomeView outcome = outcome();
        when(outcomes.findByTask(TASK_ID, null, 100))
                .thenReturn(Optional.of(
                        new TaskOutcomeQueryService.TaskOutcomePage(
                                List.of(outcome), "next", false)));

        mockMvc.perform(get(
                        "/api/v1/integrations/persona/tasks/{taskId}/outcomes",
                        TASK_UUID))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.schemaVersion").value(1))
                .andExpect(jsonPath("$.items[0].outcomeId")
                        .value(outcome.outcomeId().value().toString()))
                .andExpect(jsonPath("$.items[0].personaId")
                        .value("persona-01"))
                .andExpect(jsonPath("$.items[0].reasonSource")
                        .value("USER_WRITTEN"))
                .andExpect(jsonPath("$.items[0].predictionRequestId")
                        .doesNotExist())
                .andExpect(jsonPath("$.items[0].acceptedCandidateId")
                        .doesNotExist())
                .andExpect(jsonPath("$.nextCursor").value("next"))
                .andExpect(jsonPath("$.hasMore").value(false));
    }

    @Test
    void returnsOneOutcomeByOpaquePersonaQueryParameter()
            throws Exception {
        TaskOutcomeView outcome = outcome();
        when(outcomes.findByTaskAndPersona(
                TASK_ID, new TaskPersonaId("persona-01")))
                .thenReturn(Optional.of(outcome));

        mockMvc.perform(get(
                        "/api/v1/integrations/persona/tasks/{taskId}/outcome",
                        TASK_UUID)
                        .queryParam("personaId", "persona-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schemaVersion").value(1))
                .andExpect(jsonPath("$.taskId")
                        .value(TASK_UUID.toString()))
                .andExpect(jsonPath("$.selectedOptionId")
                        .value(outcome.selectedOptionId().value().toString()))
                .andExpect(jsonPath("$.finalReason").value("직접 작성 이유"));
    }

    private static TaskOutcomeView outcome() {
        return new TaskOutcomeView(
                new TaskSubmissionId(UUID.fromString(
                        "20000000-0000-0000-0000-000000000001")),
                new TaskPersonaId("persona-01"),
                null,
                TASK_ID,
                new TaskQuestionId(UUID.fromString(
                        "40000000-0000-0000-0000-000000000001")),
                new TaskOptionId(UUID.fromString(
                        "50000000-0000-0000-0000-000000000001")),
                TaskReasonSource.USER_WRITTEN,
                null,
                "직접 작성 이유",
                Instant.parse("2026-09-02T04:00:00Z"));
    }
}
