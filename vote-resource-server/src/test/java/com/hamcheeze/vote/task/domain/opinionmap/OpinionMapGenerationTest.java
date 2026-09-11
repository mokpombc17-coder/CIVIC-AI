package com.hamcheeze.vote.task.domain.opinionmap;

import com.hamcheeze.vote.task.domain.common.TaskId;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class OpinionMapGenerationTest {

    private static final Instant NOW =
            Instant.parse("2026-09-11T01:00:00Z");

    @Test
    void retriesAClaimAndBecomesUnavailableAtTheAttemptLimit() {
        OpinionMapGeneration generation = pending();
        UUID firstClaim = new UUID(0, 3);

        assertThat(generation.claim(
                firstClaim, NOW, Duration.ofMinutes(2), 2)).isTrue();
        assertThat(generation.status())
                .isEqualTo(OpinionMapGenerationStatus.PROCESSING);
        assertThat(generation.attemptCount()).isEqualTo(1);
        assertThat(generation.fail(
                firstClaim,
                "PROVIDER_TIMEOUT",
                true,
                2,
                Duration.ofSeconds(30),
                NOW.plusSeconds(5))).isTrue();
        assertThat(generation.status())
                .isEqualTo(OpinionMapGenerationStatus.RETRY_WAIT);
        assertThat(generation.isDispatchableAt(NOW.plusSeconds(34)))
                .isFalse();
        assertThat(generation.isDispatchableAt(NOW.plusSeconds(35)))
                .isTrue();

        UUID secondClaim = new UUID(0, 4);
        assertThat(generation.claim(
                secondClaim,
                NOW.plusSeconds(35),
                Duration.ofMinutes(2),
                2)).isTrue();
        assertThat(generation.fail(
                secondClaim,
                "PROVIDER_TIMEOUT",
                true,
                2,
                Duration.ofSeconds(30),
                NOW.plusSeconds(40))).isTrue();

        assertThat(generation.status())
                .isEqualTo(OpinionMapGenerationStatus.UNAVAILABLE);
        assertThat(generation.completedAt()).isEqualTo(NOW.plusSeconds(40));
        assertThat(generation.isDispatchableAt(NOW.plusSeconds(100)))
                .isFalse();
    }

    @Test
    void expiredLeaseCanBeReclaimedAndRejectsTheStaleClaim() {
        OpinionMapGeneration generation = pending();
        UUID staleClaim = new UUID(0, 5);
        UUID currentClaim = new UUID(0, 6);

        assertThat(generation.claim(
                staleClaim, NOW, Duration.ofSeconds(60), 3)).isTrue();
        assertThat(generation.claim(
                currentClaim,
                NOW.plusSeconds(60),
                Duration.ofSeconds(60),
                3)).isTrue();

        assertThat(generation.succeed(
                staleClaim, "{\"stale\":true}", NOW.plusSeconds(61)))
                .isFalse();
        assertThat(generation.succeed(
                currentClaim, "{\"ok\":true}", NOW.plusSeconds(62)))
                .isTrue();
        assertThat(generation.status())
                .isEqualTo(OpinionMapGenerationStatus.AVAILABLE);
        assertThat(generation.outputJson()).isEqualTo("{\"ok\":true}");
    }

    private static OpinionMapGeneration pending() {
        return OpinionMapGeneration.pending(
                new OpinionMapGenerationId(new UUID(0, 1)),
                new TaskId(new UUID(0, 2)),
                1,
                "a".repeat(64),
                "task-result-prompt/v1",
                NOW);
    }
}
