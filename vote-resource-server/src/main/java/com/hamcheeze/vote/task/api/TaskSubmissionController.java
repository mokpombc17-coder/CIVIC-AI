package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionExecutionService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionOutcome;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/me")
final class TaskSubmissionController {

    private final AuthenticatedUserIdResolver userIds;
    private final TaskSubmissionExecutionService submissions;
    private final MyTaskSubmissionQueryService submissionQueries;

    TaskSubmissionController(
            AuthenticatedUserIdResolver userIds,
            TaskSubmissionExecutionService submissions,
            MyTaskSubmissionQueryService submissionQueries
    ) {
        this.userIds = userIds;
        this.submissions = submissions;
        this.submissionQueries = submissionQueries;
    }

    @PostMapping("/tasks/{taskId}/submission")
    ResponseEntity<?> submit(
            Authentication authentication,
            @PathVariable UUID taskId,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody TaskApiModels.SubmitRequest request,
            HttpServletRequest httpRequest
    ) {
        TaskSubmissionExecutionService.SubmissionExecution execution =
                submissions.submit(
                        user(authentication), idempotencyKey,
                        new TaskSubmissionService.SubmitTaskCommand(
                                new TaskId(taskId),
                                new TaskPersonaGenerationId(
                                        request.personaGenerationId()),
                                request.predictionId() == null ? null
                                        : new TaskPredictionId(
                                                request.predictionId()),
                                request.toAnswer()));
        TaskSubmissionOutcome outcome = execution.outcome();
        if (!outcome.succeeded()) {
            return TaskApiExceptionHandler.response(
                    HttpStatus.valueOf(outcome.httpStatus()), outcome.code(),
                    "The task submission was rejected.", httpRequest,
                    execution.replayed(), outcome.violations());
        }
        TaskApiModels.SubmissionResponse response =
                TaskApiModels.SubmissionResponse.from(
                        outcome, execution.replayed());
        ResponseEntity.BodyBuilder responseBuilder = ResponseEntity
                .status(outcome.httpStatus())
                .location(URI.create("/api/v1/me/submissions/"
                        + response.submissionId()));
        if (execution.simulated()) {
            responseBuilder.header("X-Local-Simulated", "true");
        }
        return responseBuilder.body(response);
    }

    @GetMapping("/submissions")
    TaskApiModels.MySubmissionResponse findByTask(
            Authentication authentication,
            @RequestParam UUID taskId
    ) {
        return submissionQueries.findByTask(
                        user(authentication), new TaskId(taskId))
                .map(TaskApiModels.MySubmissionResponse::from)
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_SUBMISSION_NOT_FOUND",
                        "The task submission does not exist."));
    }

    @GetMapping("/submissions/{submissionId}")
    TaskApiModels.MySubmissionResponse findById(
            Authentication authentication,
            @PathVariable UUID submissionId
    ) {
        return submissionQueries.findById(
                        user(authentication),
                        new TaskSubmissionId(submissionId))
                .map(TaskApiModels.MySubmissionResponse::from)
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_SUBMISSION_NOT_FOUND",
                        "The task submission does not exist."));
    }

    private TaskUserId user(Authentication authentication) {
        return new TaskUserId(userIds.resolve(authentication));
    }
}
