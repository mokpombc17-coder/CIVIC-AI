package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.result.TaskResultForLlmDocument;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmDocumentQueryService;
import com.hamcheeze.vote.task.application.result.TaskResultViewIntegrityException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TaskResultForLlmExportControllerTest {

    private static final UUID TASK_ID = new UUID(0, 1);
    private static final String SOURCE_HASH = "a".repeat(64);
    private static final String BODY_HASH = "b".repeat(64);
    private static final String JSONL = """
            {"type":"manifest","schemaVersion":"task-result-for-llm/v1"}
            {"type":"task","title":"결과 과업"}
            """;

    private final TaskResultForLlmDocumentQueryService documents =
            mock(TaskResultForLlmDocumentQueryService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TaskResultForLlmExportController(documents))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void exportsVerifiedResultForLlmWithImmutableIdentity() throws Exception {
        when(documents.findByTaskId(new TaskId(TASK_ID)))
                .thenReturn(Optional.of(document()));

        mockMvc.perform(get(
                        "/api/v1/integrations/llm/tasks/{taskId}/result-export",
                        TASK_ID))
                .andExpect(status().isOk())
                .andExpect(content().contentType(
                        TaskResultForLlmDocument.CONTENT_TYPE))
                .andExpect(header().string(HttpHeaders.ETAG,
                        '"' + BODY_HASH + '"'))
                .andExpect(header().string(
                        TaskResultForLlmExportController.EXPORT_SCHEMA_HEADER,
                        "task-result-for-llm/v1"))
                .andExpect(header().string(
                        TaskResultForLlmExportController.SOURCE_RESULT_SHA_HEADER,
                        SOURCE_HASH))
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION,
                        TaskDownloadFileName.resultAttachment(
                                        "지역 공공도서관 운영 시간 확대",
                                        TASK_ID,
                                        "jsonl")
                                .toString()))
                .andExpect(content().string(JSONL));
    }

    @Test
    void returnsNotFoundUntilAResultManifestExists() throws Exception {
        when(documents.findByTaskId(new TaskId(TASK_ID)))
                .thenReturn(Optional.empty());

        mockMvc.perform(get(
                        "/api/v1/integrations/llm/tasks/{taskId}/result-export",
                        TASK_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("TASK_RESULT_FOR_LLM_NOT_FOUND"));
    }

    @Test
    void hidesResultIntegrityFailureDetails() throws Exception {
        when(documents.findByTaskId(new TaskId(TASK_ID)))
                .thenThrow(new TaskResultViewIntegrityException(
                        new TaskId(TASK_ID), "sensitive mismatch detail"));

        mockMvc.perform(get(
                        "/api/v1/integrations/llm/tasks/{taskId}/result-export",
                        TASK_ID))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code")
                        .value("TASK_RESULT_VIEW_INTEGRITY_FAILURE"))
                .andExpect(jsonPath("$.detail").value(
                        "The finalized task result view failed verification."));
    }

    private static TaskResultForLlmDocument document() {
        return new TaskResultForLlmDocument(
                "지역 공공도서관 운영 시간 확대",
                "task-result-for-llm/v1",
                1,
                2,
                SOURCE_HASH,
                BODY_HASH,
                JSONL);
    }
}
