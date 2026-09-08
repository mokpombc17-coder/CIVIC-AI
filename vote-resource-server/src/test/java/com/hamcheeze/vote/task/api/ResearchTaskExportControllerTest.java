package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.research.ResearchTaskExportArtifact;
import com.hamcheeze.vote.task.application.research.ResearchTaskExportService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ResearchTaskExportControllerTest {

    private static final UUID TASK_ID = new UUID(0, 1);
    private static final String HASH = "b".repeat(64);

    private final ResearchTaskExportService service =
            mock(ResearchTaskExportService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new ResearchTaskExportController(service))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void downloadsTaskResearchExportZip() throws Exception {
        byte[] zip = {1, 2, 3};
        when(service.export(new TaskId(TASK_ID)))
                .thenReturn(Optional.of(new ResearchTaskExportArtifact(
                        "지역 공공도서관 운영 시간 확대",
                        zip, HASH, 1, 1)));

        mockMvc.perform(post(
                        "/api/v1/research/tasks/{taskId}/exports",
                        TASK_ID))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/zip"))
                .andExpect(content().bytes(zip))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL,
                        "no-store"))
                .andExpect(header().string(HttpHeaders.ETAG,
                        '"' + HASH + '"'))
                .andExpect(header().string(
                        "X-Export-Schema-Version",
                        "research-task-export/v1"))
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION,
                        TaskDownloadFileName.resultAttachment(
                                        "지역 공공도서관 운영 시간 확대",
                                        TASK_ID,
                                        "zip")
                                .toString()));
    }

    @Test
    void returnsNotFoundUntilTaskResultIsFinalized() throws Exception {
        when(service.export(new TaskId(TASK_ID)))
                .thenReturn(Optional.empty());

        mockMvc.perform(post(
                        "/api/v1/research/tasks/{taskId}/exports",
                        TASK_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("RESEARCH_TASK_EXPORT_NOT_FOUND"));
    }
}
