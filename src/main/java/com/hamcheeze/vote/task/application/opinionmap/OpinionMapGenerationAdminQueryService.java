package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationAdminViewRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationAdminViewRepository.UnavailableRow;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class OpinionMapGenerationAdminQueryService {

    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 100;

    private final OpinionMapGenerationAdminViewRepository views;
    private final OpinionMapUnavailableCursorCodec cursors;
    private final OpinionMapGenerationPolicy policy;

    public OpinionMapGenerationAdminQueryService(
            OpinionMapGenerationAdminViewRepository views,
            OpinionMapUnavailableCursorCodec cursors,
            OpinionMapGenerationPolicy policy
    ) {
        this.views = Objects.requireNonNull(views, "views");
        this.cursors = Objects.requireNonNull(cursors, "cursors");
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    @Transactional(readOnly = true)
    public UnavailablePage findUnavailable(String cursor, int size) {
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException(
                    "size must be between 1 and " + MAX_PAGE_SIZE);
        }
        Optional<OpinionMapUnavailableCursor> decoded =
                cursor == null || cursor.isBlank()
                        ? Optional.empty()
                        : Optional.of(cursors.decode(cursor));
        List<UnavailableRow> rows = views.findUnavailable(decoded, size + 1);
        boolean hasNext = rows.size() > size;
        List<UnavailableItem> items = rows.stream()
                .limit(size)
                .map(row -> new UnavailableItem(
                        row.taskId(), row.taskTitle(), row.resultVersion(),
                        row.attemptCount(), row.lastErrorCode(),
                        row.failedAt(), policy.enabled()))
                .toList();
        UnavailableRow last = hasNext ? rows.get(size - 1) : null;
        String nextCursor = last == null ? null : cursors.encode(
                new OpinionMapUnavailableCursor(
                        last.failedAt(), last.generationId()));
        return new UnavailablePage(items, nextCursor);
    }

    public record UnavailablePage(
            List<UnavailableItem> items,
            String nextCursor
    ) {
        public UnavailablePage {
            items = List.copyOf(Objects.requireNonNull(items, "items"));
        }
    }

    public record UnavailableItem(
            TaskId taskId,
            String taskTitle,
            int resultVersion,
            int attemptCount,
            String lastErrorCode,
            Instant failedAt,
            boolean canRetry
    ) {
        public UnavailableItem {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(taskTitle, "taskTitle");
            Objects.requireNonNull(lastErrorCode, "lastErrorCode");
            Objects.requireNonNull(failedAt, "failedAt");
        }
    }
}
