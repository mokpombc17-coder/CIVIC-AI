package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.research.ResearchTaskExportArtifact;
import com.hamcheeze.vote.task.application.research.ResearchTaskExportService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/research/tasks/{taskId}/exports")
public final class ResearchTaskExportController {

    private final ResearchTaskExportService service;

    public ResearchTaskExportController(ResearchTaskExportService service) {
        this.service = Objects.requireNonNull(service, "service");
    }

    @PostMapping(produces = ResearchTaskExportArtifact.CONTENT_TYPE)
    ResponseEntity<byte[]> export(@PathVariable UUID taskId) {
        ResearchTaskExportArtifact artifact = service.export(
                        new TaskId(taskId))
                .orElseThrow(() -> TaskApiException.notFound(
                        "RESEARCH_TASK_EXPORT_NOT_FOUND",
                        "The finalized Task result was not found."));
        byte[] content = artifact.content();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(
                        ResearchTaskExportArtifact.CONTENT_TYPE))
                .contentLength(content.length)
                .cacheControl(CacheControl.noStore())
                .eTag('"' + artifact.sha256() + '"')
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        TaskDownloadFileName.resultAttachment(
                                        artifact.taskTitle(),
                                        taskId,
                                        "zip")
                                .toString())
                .header(
                        "X-Export-Schema-Version",
                        ResearchTaskExportArtifact.SCHEMA_VERSION)
                .body(content);
    }
}
