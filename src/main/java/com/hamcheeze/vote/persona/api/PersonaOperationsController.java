package com.hamcheeze.vote.persona.api;

import com.hamcheeze.vote.persona.application.PersonaGenerationRetryRequest;
import com.hamcheeze.vote.persona.application.PersonaGenerationRetryService;
import com.hamcheeze.vote.persona.application.PersonaGenerationRetryService.RetryCommand;
import com.hamcheeze.vote.persona.application.PersonaGenerationRetryService.RetryExecution;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/operations/persona/generations")
public class PersonaOperationsController {

    private final AuthenticatedUserIdResolver userIds;
    private final PersonaGenerationRetryService retries;

    public PersonaOperationsController(
            AuthenticatedUserIdResolver userIds,
            PersonaGenerationRetryService retries
    ) {
        this.userIds = Objects.requireNonNull(userIds, "userIds");
        this.retries = Objects.requireNonNull(retries, "retries");
    }

    @PostMapping("/{generationId}/retries")
    ResponseEntity<RetryResponse> retry(
            @PathVariable UUID generationId,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody RetryRequest request,
            Authentication authentication
    ) {
        RetryExecution execution = retries.retry(new RetryCommand(
                new PersonaGenerationId(generationId),
                idempotencyKey,
                userIds.resolve(authentication),
                request.reason()));
        return ResponseEntity.status(execution.created()
                        ? HttpStatus.ACCEPTED : HttpStatus.OK)
                .body(RetryResponse.from(execution));
    }

    record RetryRequest(
            @NotBlank
            @Size(max = PersonaGenerationRetryRequest.MAX_REASON_LENGTH)
            String reason
    ) {
        RetryRequest {
            if (reason != null) {
                reason = reason.trim();
            }
        }
    }

    record RetryResponse(
            UUID generationId,
            UUID retryRequestId,
            boolean created,
            int failedAttemptCount,
            Instant nextAttemptAt,
            String requestedBy,
            Instant requestedAt,
            String reason
    ) {
        static RetryResponse from(RetryExecution execution) {
            PersonaGenerationRetryRequest request = execution.request();
            return new RetryResponse(
                    request.generationId().value(),
                    request.retryRequestId(),
                    execution.created(),
                    request.failedAttemptCount(),
                    request.requestedAt(),
                    request.requestedBy(),
                    request.requestedAt(),
                    request.reason());
        }
    }
}
