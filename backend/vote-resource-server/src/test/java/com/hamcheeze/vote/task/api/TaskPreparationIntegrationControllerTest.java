package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationResult;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStateService;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TaskPreparationIntegrationControllerTest {

    private static final UUID REQUEST_ID = UUID.fromString(
            "10000000-0000-0000-0000-000000000001");
    private static final UUID TASK_ID = UUID.fromString(
            "20000000-0000-0000-0000-000000000001");
    private static final String FINGERPRINT = "sha256:" + "a".repeat(64);

    private final TaskPreparationStateService preparations =
            mock(TaskPreparationStateService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TaskPreparationIntegrationController(preparations))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void acceptsReadyResultWithoutAResponseBody() throws Exception {
        mockMvc.perform(post(
                        "/api/v1/integrations/persona/"
                                + "task-preparations/{requestId}/result",
                        REQUEST_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(readyBody(REQUEST_ID)))
                .andExpect(status().isNoContent());

        ArgumentCaptor<TaskPreparationResult> result =
                ArgumentCaptor.forClass(TaskPreparationResult.class);
        verify(preparations).applyCallback(result.capture());
        assertThat(result.getValue().status())
                .isEqualTo(TaskPreparationStatus.READY);
        assertThat(result.getValue().taskId().value()).isEqualTo(TASK_ID);
    }

    @Test
    void rejectsDifferentPathAndBodyRequestIds() throws Exception {
        mockMvc.perform(post(
                        "/api/v1/integrations/persona/"
                                + "task-preparations/{requestId}/result",
                        UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(readyBody(REQUEST_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void rejectsInconsistentFailureRetryability() throws Exception {
        String body = """
                {
                  "schemaVersion": 1,
                  "requestId": "%s",
                  "taskId": "%s",
                  "contentFingerprint": "%s",
                  "status": "FAILED",
                  "preparedAt": null,
                  "error": {
                    "code": "MODEL_UNAVAILABLE",
                    "detail": "runtime unavailable",
                    "retryable": false
                  }
                }
                """.formatted(REQUEST_ID, TASK_ID, FINGERPRINT);

        mockMvc.perform(post(
                        "/api/v1/integrations/persona/"
                                + "task-preparations/{requestId}/result",
                        REQUEST_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    private static String readyBody(UUID requestId) {
        return """
                {
                  "schemaVersion": 1,
                  "requestId": "%s",
                  "taskId": "%s",
                  "contentFingerprint": "%s",
                  "status": "READY",
                  "preparedAt": "2026-09-03T03:03:00Z",
                  "error": null
                }
                """.formatted(requestId, TASK_ID, FINGERPRINT);
    }
}
