package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class OpinionMapGenerationJpaAdapterIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-09-11T03:00:00Z");

    @Autowired
    private OpinionMapGenerationRepository generations;

    @Test
    void insertsIdempotentlyClaimsAndRestoresTheGeneration() {
        TaskId taskId = new TaskId(new UUID(0, 20));
        OpinionMapGeneration generation = OpinionMapGeneration.pending(
                new OpinionMapGenerationId(new UUID(0, 21)),
                taskId,
                1,
                "a".repeat(64),
                "task-result-prompt/v1",
                NOW);
        OpinionMapGeneration duplicate = OpinionMapGeneration.pending(
                new OpinionMapGenerationId(new UUID(0, 22)),
                taskId,
                1,
                "a".repeat(64),
                "task-result-prompt/v1",
                NOW.plusSeconds(1));

        assertThat(generations.insertIfAbsent(generation)).isTrue();
        assertThat(generations.insertIfAbsent(duplicate)).isFalse();
        OpinionMapGeneration claimed = generations
                .findNextDispatchableForUpdate(NOW)
                .orElseThrow();
        UUID claimId = new UUID(0, 23);
        assertThat(claimed.claim(
                claimId, NOW, Duration.ofSeconds(60), 3)).isTrue();
        generations.save(claimed);
        assertThat(claimed.succeed(
                claimId, "{\"status\":\"ok\"}", NOW.plusSeconds(1)))
                .isTrue();
        generations.save(claimed);

        assertThat(generations.findByTaskResult(taskId, 1))
                .get()
                .satisfies(restored -> {
                    assertThat(restored.id()).isEqualTo(generation.id());
                    assertThat(restored.status())
                            .isEqualTo(OpinionMapGenerationStatus.AVAILABLE);
                    assertThat(restored.attemptCount()).isEqualTo(1);
                    assertThat(restored.outputJson())
                            .isEqualTo("{\"status\":\"ok\"}");
                });
    }
}
