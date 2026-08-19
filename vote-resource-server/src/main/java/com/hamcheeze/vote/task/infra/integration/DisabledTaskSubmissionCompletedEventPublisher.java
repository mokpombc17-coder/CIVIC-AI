package com.hamcheeze.vote.task.infra.integration;

import com.hamcheeze.vote.task.application.port.out.TaskSubmissionCompletedEventPublisher;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.submission-outbox",
        name = "enabled",
        havingValue = "false",
        matchIfMissing = true)
final class DisabledTaskSubmissionCompletedEventPublisher
        implements TaskSubmissionCompletedEventPublisher {

    @Override
    public void publish(TaskSubmission submission) {
        Objects.requireNonNull(submission, "submission");
        // Producer rollout is intentionally held until a Result consumer exists.
    }
}
