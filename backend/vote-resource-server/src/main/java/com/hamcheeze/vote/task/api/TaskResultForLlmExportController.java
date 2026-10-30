package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.result.TaskResultForLlmDocument;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmDocumentQueryService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/integrations/llm/tasks/{taskId}")
final class TaskResultForLlmExportController {

    static final String EXPORT_SCHEMA_HEADER = "X-Export-Schema-Version";
    static final String SOURCE_RESULT_SHA_HEADER = "X-Source-Result-SHA256";

    private final TaskResultForLlmDocumentQueryService documents;

    TaskResultForLlmExportController(
            TaskResultForLlmDocumentQueryService documents
    ) {
        this.documents = Objects.requireNonNull(documents, "documents");
    }

    @GetMapping(
            value = "/result-export",
            produces = TaskResultForLlmDocument.CONTENT_TYPE
    )
    ResponseEntity<String> export(@PathVariable UUID taskId) {
        TaskResultForLlmDocument document = documents.findByTaskId(
                        new TaskId(taskId))
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_RESULT_FOR_LLM_NOT_FOUND",
                        "The finalized task result for LLM does not exist."));
        String content = document.content();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(
                        TaskResultForLlmDocument.CONTENT_TYPE))
                .contentLength(content.getBytes(StandardCharsets.UTF_8).length)
                .eTag('"' + document.bodySha256() + '"')
                .cacheControl(CacheControl.noStore())
                .header(EXPORT_SCHEMA_HEADER, document.schemaVersion())
                .header(
                        SOURCE_RESULT_SHA_HEADER,
                        document.sourceBodySha256())
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        TaskDownloadFileName.resultAttachment(
                                        document.taskTitle(),
                                        taskId,
                                        "jsonl")
                                .toString())
                .body(content);
    }
}
