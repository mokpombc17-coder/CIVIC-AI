package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.CompletedTaskReader;
import com.hamcheeze.vote.task.application.port.out.CompletedTaskReader.CompletedTaskRow;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CompletedTaskQueryServiceTest {

    private static final TaskUserId USER_ID =
            new TaskUserId("completed-query-user");
    private static final Instant NOW =
            Instant.parse("2026-08-27T12:00:00Z");

    private final CompletedTaskReader reader =
            mock(CompletedTaskReader.class);
    private final CompletedTaskCursorCodec codec =
            new CompletedTaskCursorCodec();
    private final CompletedTaskQueryService service =
            new CompletedTaskQueryService(reader, codec);

    @Test
    void fetchesSizePlusOneAndBuildsCursorFromLastVisibleItem() {
        CompletedTaskRow first = row(3, NOW);
        CompletedTaskRow second = row(2, NOW.minusSeconds(60));
        CompletedTaskRow lookahead = row(1, NOW.minusSeconds(120));
        when(reader.findByUser(USER_ID, Optional.empty(), 3))
                .thenReturn(List.of(first, second, lookahead));

        CompletedTaskQueryService.CompletedTaskPage page =
                service.findByUser(USER_ID, null, 2);

        assertThat(page.items()).extracting(item -> item.taskId().value())
                .containsExactly(
                        first.taskId().value(), second.taskId().value());
        assertThat(codec.decode(page.nextCursor())).isEqualTo(
                new CompletedTaskCursor(
                        second.closedAt(), second.taskId()));
        assertThat(page.items().getFirst().mySubmission().submissionId())
                .isEqualTo(first.submissionId());
    }

    @Test
    void passesDecodedCursorAndReturnsNullCursorOnLastPage() {
        CompletedTaskCursor cursor = new CompletedTaskCursor(
                NOW, new TaskId(uuid(5)));
        CompletedTaskRow last = row(4, NOW.minusSeconds(60));
        when(reader.findByUser(
                eq(USER_ID), any(), eq(3)))
                .thenReturn(List.of(last));

        CompletedTaskQueryService.CompletedTaskPage page =
                service.findByUser(USER_ID, codec.encode(cursor), 2);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Optional<CompletedTaskCursor>> captured =
                ArgumentCaptor.forClass(Optional.class);
        verify(reader).findByUser(eq(USER_ID), captured.capture(), eq(3));
        assertThat(captured.getValue()).contains(cursor);
        assertThat(page.items()).hasSize(1);
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void emptyPageHasNoNextCursor() {
        when(reader.findByUser(USER_ID, Optional.empty(), 21))
                .thenReturn(List.of());

        CompletedTaskQueryService.CompletedTaskPage page =
                service.findByUser(
                        USER_ID, null,
                        CompletedTaskQueryService.DEFAULT_SIZE);

        assertThat(page.items()).isEmpty();
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void rejectsInvalidSizeAndCursorBeforeQuerying() {
        assertThatThrownBy(() -> service.findByUser(USER_ID, null, 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findByUser(
                USER_ID, null, CompletedTaskQueryService.MAX_SIZE + 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findByUser(
                USER_ID, "invalid cursor", 20))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("completed task cursor is invalid");
        verify(reader, never()).findByUser(any(), any(), anyInt());
    }

    private CompletedTaskRow row(int sequence, Instant closedAt) {
        return new CompletedTaskRow(
                new TaskId(uuid(sequence)),
                "Task " + sequence,
                "Description " + sequence,
                closedAt.minusSeconds(3600),
                closedAt,
                TaskClosureType.DEADLINE_REACHED,
                new TaskSubmissionId(uuid(sequence + 100)),
                closedAt.minusSeconds(1800));
    }

    private static UUID uuid(int sequence) {
        return UUID.fromString(String.format(
                "30000000-0000-0000-0000-%012d", sequence));
    }
}
