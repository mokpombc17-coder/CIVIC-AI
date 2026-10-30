package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationAttemptRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Service
public class OpinionMapGenerationAttemptService {

    private final OpinionMapGenerationAttemptRepository attempts;
    private final Clock clock;

    @Autowired
    public OpinionMapGenerationAttemptService(
            OpinionMapGenerationAttemptRepository attempts
    ) {
        this(attempts, Clock.systemUTC());
    }

    OpinionMapGenerationAttemptService(
            OpinionMapGenerationAttemptRepository attempts,
            Clock clock
    ) {
        this.attempts = Objects.requireNonNull(attempts, "attempts");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public OpinionMapGenerationAttempt start(
            UUID runId,
            int attemptNumber,
            OpinionMapGenerationProvider provider
    ) {
        OpinionMapGenerationAttempt attempt =
                new OpinionMapGenerationAttempt(
                        UUID.randomUUID(),
                        runId,
                        attemptNumber,
                        provider.provider(),
                        provider.requestedModel(),
                        clock.instant());
        attempts.insert(attempt);
        return attempt;
    }

    public void succeed(
            OpinionMapGenerationAttempt attempt,
            OpinionMapGenerationGatewayResult result
    ) {
        Instant completedAt = clock.instant();
        attempts.completeSuccess(
                attempt.attemptId(),
                result,
                completedAt,
                latency(attempt.startedAt(), completedAt));
    }

    public void fail(
            OpinionMapGenerationAttempt attempt,
            OpinionMapGenerationException failure
    ) {
        Instant completedAt = clock.instant();
        attempts.completeFailure(
                attempt.attemptId(),
                failure,
                completedAt,
                latency(attempt.startedAt(), completedAt));
    }

    private static long latency(Instant startedAt, Instant completedAt) {
        return Math.max(0, Duration.between(
                startedAt, completedAt).toMillis());
    }
}
