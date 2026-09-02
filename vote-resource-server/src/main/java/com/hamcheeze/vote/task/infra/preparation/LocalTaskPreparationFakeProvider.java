package com.hamcheeze.vote.task.infra.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationProvider;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationCommand;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationProviderResult;
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
                false,
                clock.instant());
    }
}
