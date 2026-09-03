package com.hamcheeze.vote.task.infra.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationProvider;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationCommand;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationProviderResult;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationRemoteStatus;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStatus;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationVerification;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.Objects;

@Component
@Profile("local")
@ConditionalOnExpression(
        "'${vote.task.preparation.enabled:false}' == 'true' and "
                + "'${vote.task.preparation.provider:http}' == 'fake'")
public class LocalTaskPreparationFakeProvider
        implements TaskPreparationProvider {

    private final Clock clock;

    public LocalTaskPreparationFakeProvider() {
        this(Clock.systemUTC());
    }

    LocalTaskPreparationFakeProvider(Clock clock) {
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Override
    public TaskPreparationProviderResult prepare(
            TaskPreparationCommand command
    ) {
        Objects.requireNonNull(command, "command");
        return new TaskPreparationProviderResult(
                command.schemaVersion(),
                command.requestId(),
                command.taskId(),
                command.contentFingerprint(),
                TaskPreparationStatus.READY,
                false,
                clock.instant());
    }

    @Override
    public TaskPreparationRemoteStatus findStatus(
            TaskPreparationVerification verification
    ) {
        Objects.requireNonNull(verification, "verification");
        var now = clock.instant();
        return new TaskPreparationRemoteStatus(
                verification.schemaVersion(),
                verification.requestId(),
                verification.taskId(),
                verification.contentFingerprint(),
                TaskPreparationStatus.READY,
                now,
                now,
                null,
                now);
    }
}
