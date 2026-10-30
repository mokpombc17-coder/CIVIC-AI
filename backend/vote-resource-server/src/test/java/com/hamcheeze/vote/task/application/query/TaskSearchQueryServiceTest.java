package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskSearchReader;
import com.hamcheeze.vote.task.application.port.out.TaskSearchReader.TaskSearchRow;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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

class TaskSearchQueryServiceTest {

    private static final TaskUserId USER_ID =
            new TaskUserId("task-search-user");
    private static final TaskUserId OTHER_USER_ID =
            new TaskUserId("other-task-search-user");
    private static final Instant NOW =
            Instant.parse("2026-10-06T12:00:00Z");

    private final TaskSearchReader reader = mock(TaskSearchReader.class);
    private final TaskSearchCursorCodec codec = new TaskSearchCursorCodec();
    private final TaskSearchQueryService service =
            new TaskSearchQueryService(
                    reader, codec, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void normalizesQueryMapsBothStatusesAndBuildsBoundCursor() {
        TaskSearchRow open = openRow(1, null, null);
        TaskSearchRow closed = closedRow(2);
        TaskSearchRow lookahead = closedRow(3);
        when(reader.findByUser(
                USER_ID, "교통 정책", Optional.empty(), NOW, 3))
                .thenReturn(List.of(open, closed, lookahead));

        TaskSearchQueryService.TaskSearchPage page = service.findByUser(
                USER_ID, "  교통 정책  ", null, 2);

        assertThat(page.items()).extracting(item -> item.taskStatus())
                .containsExactly(TaskStatus.OPEN, TaskStatus.CLOSED);
        assertThat(page.items().getFirst().mySubmission()).isNull();
        assertThat(page.items().getLast().mySubmission()).isNotNull();
        assertThat(page.items().getFirst().resultAvailable()).isFalse();
        assertThat(page.items().getLast().resultAvailable()).isTrue();

        TaskSearchCursor cursor = codec.decode(page.nextCursor());
        assertThat(cursor.taskStatus()).isEqualTo(TaskStatus.CLOSED);
        assertThat(cursor.sortAt()).isEqualTo(closed.sortAt());
        assertThat(cursor.taskId()).isEqualTo(closed.taskId());
        assertThat(cursor.queryFingerprint()).hasSize(64);
        assertThat(cursor.userFingerprint()).hasSize(64);
    }

    @Test
    void acceptsCursorOnlyForSameQueryAndAuthenticatedUser() {
        TaskSearchRow first = openRow(1, null, null);
        TaskSearchRow lookahead = closedRow(2);
        when(reader.findByUser(
                USER_ID, "검색", Optional.empty(), NOW, 2))
                .thenReturn(List.of(first, lookahead));
        String cursor = service.findByUser(
                USER_ID, "검색", null, 1).nextCursor();
        when(reader.findByUser(
                eq(USER_ID), eq("검색"), any(), eq(NOW), eq(2)))
                .thenReturn(List.of());

        service.findByUser(USER_ID, "검색", cursor, 1);

        verify(reader).findByUser(
                eq(USER_ID), eq("검색"),
                org.mockito.ArgumentMatchers.argThat(Optional::isPresent),
                eq(NOW), eq(2));
        assertThatThrownBy(() -> service.findByUser(
                USER_ID, "다른 검색", cursor, 1))
                .isInstanceOf(TaskSearchCursorException.class);
        assertThatThrownBy(() -> service.findByUser(
                OTHER_USER_ID, "검색", cursor, 1))
                .isInstanceOf(TaskSearchCursorException.class);
    }

    @Test
    void rejectsBlankOversizedAndInvalidPaginationBeforeReading() {
        assertThatThrownBy(() -> service.findByUser(
                USER_ID, null, null, 20))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findByUser(
                USER_ID, "   ", null, 20))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findByUser(
                USER_ID,
                "a".repeat(TaskSearchQueryService.MAX_QUERY_LENGTH + 1),
                null, 20))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findByUser(
                USER_ID, "검색", null, 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findByUser(
                USER_ID, "검색", null,
                TaskSearchQueryService.MAX_SIZE + 1))
                .isInstanceOf(IllegalArgumentException.class);
        verify(reader, never()).findByUser(
                any(), any(), any(), any(), anyInt());
    }

    private static TaskSearchRow openRow(
            int sequence,
            TaskSubmissionId submissionId,
            Instant submittedAt
    ) {
        Instant closesAt = NOW.plusSeconds(sequence * 60L);
        return new TaskSearchRow(
                new TaskId(uuid(sequence)),
                "Open " + sequence,
                sequence == 1 ? null : "Description " + sequence,
                TaskStatus.OPEN,
                NOW.minusSeconds(3600),
                closesAt,
                null,
                null,
                submissionId,
                submittedAt,
                false,
                closesAt);
    }

    private static TaskSearchRow closedRow(int sequence) {
        Instant closedAt = NOW.minusSeconds(sequence * 60L);
        return new TaskSearchRow(
                new TaskId(uuid(sequence)),
                "Closed " + sequence,
                "Description " + sequence,
                TaskStatus.CLOSED,
                NOW.minusSeconds(7200),
                NOW.minusSeconds(3600),
                closedAt,
                TaskClosureType.DEADLINE_REACHED,
                new TaskSubmissionId(uuid(sequence + 100)),
                NOW.minusSeconds(5400),
                true,
                closedAt);
    }

    private static UUID uuid(int sequence) {
        return UUID.fromString(String.format(
                "70000000-0000-0000-0000-%012d", sequence));
    }
}
