package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.survey.application.integration.SurveyResponseSubmittedReplayAudit;
import com.hamcheeze.vote.survey.application.integration.SurveyResponseSubmittedReplayService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/operations/survey/outbox-events")
public class SurveyOutboxOperationsController {

    private final AuthenticatedUserIdResolver userIds;
    private final SurveyResponseSubmittedReplayService replays;

    public SurveyOutboxOperationsController(
            AuthenticatedUserIdResolver userIds,
            SurveyResponseSubmittedReplayService replays
    ) {
        this.userIds = Objects.requireNonNull(userIds, "userIds");
        this.replays = Objects.requireNonNull(replays, "replays");
    }

    @PostMapping("/{eventId}/replays")
    ResponseEntity<ReplayResponse> replay(
            @PathVariable UUID eventId,
            @Valid @RequestBody ReplayRequest request,
            Authentication authentication
    ) {
        String requestedBy = userIds.resolve(authentication);
        SurveyResponseSubmittedReplayService.ReplayExecution execution =
                replays.replay(
                        new SurveyResponseSubmittedReplayService.ReplayCommand(
                                eventId,
                                requestedBy,
                                request.reason()));
        HttpStatus status = execution.created()
                ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(
                ReplayResponse.from(execution));
    }

    record ReplayRequest(
            @NotBlank
            @Size(max = SurveyResponseSubmittedReplayAudit.MAX_REASON_LENGTH)
            String reason
    ) {
        ReplayRequest {
            if (reason != null) {
                reason = reason.trim();
            }
        }
    }

    record ReplayResponse(
            UUID originalEventId,
            UUID replayEventId,
            boolean created,
            String requestedBy,
            Instant requestedAt,
            String reason
    ) {
        static ReplayResponse from(
                SurveyResponseSubmittedReplayService.ReplayExecution execution
        ) {
            SurveyResponseSubmittedReplayAudit audit = execution.audit();
            return new ReplayResponse(
                    audit.originalEventId(),
                    audit.replayEventId(),
                    execution.created(),
                    audit.requestedBy(),
                    audit.requestedAt(),
                    audit.reason());
        }
    }
}
