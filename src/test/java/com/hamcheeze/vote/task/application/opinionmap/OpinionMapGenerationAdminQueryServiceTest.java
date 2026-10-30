package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationAdminViewRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationAdminViewRepository.UnavailableRow;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class OpinionMapGenerationAdminQueryServiceTest {

    private final OpinionMapUnavailableCursorCodec cursors =
            new OpinionMapUnavailableCursorCodec();

    @Test
    void returnsLatestFailuresWithAnOpaqueNextCursor() {
        UnavailableRow first = row(1, "첫 번째", "TIMEOUT",
                Instant.parse("2026-09-11T05:00:00Z"));
        UnavailableRow second = row(2, "두 번째", "RATE_LIMIT",
                Instant.parse("2026-09-11T04:00:00Z"));
        OpinionMapGenerationAdminViewRepository views = (cursor, limit) -> {
            assertThat(cursor).isEmpty();
            assertThat(limit).isEqualTo(2);
            return List.of(first, second);
        };
        OpinionMapGenerationAdminQueryService service =
                new OpinionMapGenerationAdminQueryService(
                        views, cursors, policy(true));

        var page = service.findUnavailable(null, 1);

        assertThat(page.items()).hasSize(1);
        assertThat(page.items().getFirst().taskTitle())
                .isEqualTo("첫 번째");
        assertThat(page.items().getFirst().canRetry()).isTrue();
        assertThat(cursors.decode(page.nextCursor()))
                .isEqualTo(new OpinionMapUnavailableCursor(
                        first.failedAt(), first.generationId()));
    }

    @Test
    void passesDecodedCursorAndOmitsNextCursorOnLastPage() {
        OpinionMapUnavailableCursor cursor = new OpinionMapUnavailableCursor(
                Instant.parse("2026-09-11T05:00:00Z"),
                new OpinionMapGenerationId(new UUID(0, 10)));
        OpinionMapGenerationAdminViewRepository views = (actual, limit) -> {
            assertThat(actual).isEqualTo(Optional.of(cursor));
            return List.of(row(3, "마지막", "INVALID_OUTPUT",
                    Instant.parse("2026-09-11T03:00:00Z")));
        };
        OpinionMapGenerationAdminQueryService service =
                new OpinionMapGenerationAdminQueryService(
                        views, cursors, policy(false));

        var page = service.findUnavailable(cursors.encode(cursor), 20);

        assertThat(page.nextCursor()).isNull();
        assertThat(page.items().getFirst().canRetry()).isFalse();
    }

    private static UnavailableRow row(
            long sequence,
            String title,
            String error,
            Instant failedAt
    ) {
        return new UnavailableRow(
                new OpinionMapGenerationId(new UUID(0, sequence)),
                new TaskId(new UUID(1, sequence)),
                title,
                1,
                3,
                error,
                failedAt);
    }

    private static OpinionMapGenerationPolicy policy(boolean enabled) {
        return new OpinionMapGenerationPolicy(
                enabled,
                "task-result-prompt/v1",
                Duration.ofSeconds(60),
                3,
                Duration.ofSeconds(30),
                Duration.ofSeconds(90),
                10);
    }
}
