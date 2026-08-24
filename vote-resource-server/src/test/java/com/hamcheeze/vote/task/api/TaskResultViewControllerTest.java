package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.result.TaskResultViewDocument;
import com.hamcheeze.vote.task.application.result.TaskResultViewDocumentQueryService;
import com.hamcheeze.vote.task.application.result.TaskResultViewIntegrityException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TaskResultViewControllerTest {

    private static final UUID TASK_ID = new UUID(0, 1);
    private static final String HASH = "a".repeat(64);
    private static final String JSONL = """
            {"type":"manifest","schemaVersion":"task-result-view/v1"}
            {"type":"task","title":"결과 과업"}
            """;

    private final TaskResultViewDocumentQueryService documents =
            mock(TaskResultViewDocumentQueryService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TaskResultViewController(documents))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void downloadsVerifiedResultAsNdjsonWithImmutableIdentity() throws Exception {
        when(documents.findByTaskId(new TaskId(TASK_ID)))
                .thenReturn(Optional.of(document()));

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/result-view",
                        TASK_ID))
                .andExpect(status().isOk())
                .andExpect(content().contentType(
                        TaskResultViewDocument.CONTENT_TYPE))
                .andExpect(header().string(HttpHeaders.ETAG,
                        '"' + HASH + '"'))
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"task-result-view-v1.jsonl\""))
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL, "no-cache, private"))
                .andExpect(content().string(JSONL));
    }

    @Test
    void returnsNotFoundUntilAResultManifestExists() throws Exception {
        when(documents.findByTaskId(new TaskId(TASK_ID)))
                .thenReturn(Optional.empty());

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/result-view",
                        TASK_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("TASK_RESULT_VIEW_NOT_FOUND"));
    }

    @Test
    void hidesResultIntegrityFailureDetails() throws Exception {
        when(documents.findByTaskId(new TaskId(TASK_ID)))
                .thenThrow(new TaskResultViewIntegrityException(
                        new TaskId(TASK_ID), "sensitive mismatch detail"));

        mockMvc.perform(get(
                        "/api/v1/admin/tasks/{taskId}/result-view",
                        TASK_ID))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code")
                        .value("TASK_RESULT_VIEW_INTEGRITY_FAILURE"))
                .andExpect(jsonPath("$.detail").value(
                        "The finalized task result view failed verification."));
    }

    private static TaskResultViewDocument document() {
        return new TaskResultViewDocument(
                1,
                "task-result-view/v1",
                Instant.parse("2026-08-24T00:00:00Z"),
                0,
                HASH,
                JSONL);
    }
}
