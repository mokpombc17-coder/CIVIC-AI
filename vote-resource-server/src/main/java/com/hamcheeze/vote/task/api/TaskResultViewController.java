package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.result.TaskResultViewDocument;
import com.hamcheeze.vote.task.application.result.TaskResultViewDocumentQueryService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/tasks")
final class TaskResultViewController {

    private static final String DOWNLOAD_FILE_NAME =
            "task-result-view-v1.jsonl";

    private final TaskResultViewDocumentQueryService documents;

    TaskResultViewController(TaskResultViewDocumentQueryService documents) {
        this.documents = Objects.requireNonNull(documents, "documents");
    }

    @GetMapping(
            value = "/{taskId}/result-view",
            produces = TaskResultViewDocument.CONTENT_TYPE
    )
    ResponseEntity<String> findByTaskId(@PathVariable UUID taskId) {
        TaskResultViewDocument document = documents.findByTaskId(
                        new TaskId(taskId))
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_RESULT_VIEW_NOT_FOUND",
                        "The finalized task result view does not exist."));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(
                        TaskResultViewDocument.CONTENT_TYPE))
                .eTag('"' + document.bodySha256() + '"')
                .cacheControl(CacheControl.noCache().cachePrivate())
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment()
                                .filename(DOWNLOAD_FILE_NAME)
                                .build()
                                .toString())
                .body(document.content());
    }
}
