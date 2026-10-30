package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.ParticipatedTaskReader;
import com.hamcheeze.vote.task.application.port.out.ParticipatedTaskReader.ParticipatedTaskRow;
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

class ParticipatedTaskQueryServiceTest {

    private static final TaskUserId USER_ID =
            new TaskUserId("participated-query-user");
    private static final Instant NOW =
            Instant.parse("2026-08-27T12:00:00Z");

    private final ParticipatedTaskReader reader =
            mock(ParticipatedTaskReader.class);
    private final ParticipatedTaskCursorCodec codec =
            new ParticipatedTaskCursorCodec();
    private final ParticipatedTaskQueryService service =
            new ParticipatedTaskQueryService(
                    reader, codec, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void exposesIndependentLifecycleParticipationAndResultStates() {
        ParticipatedTaskRow available = row(
                4, TaskStatus.CLOSED, NOW.minusSeconds(60),
                TaskClosureType.DEADLINE_REACHED, 1, NOW.minusSeconds(60));
        ParticipatedTaskRow calculating = row(
                3, TaskStatus.OPEN, null, null, null, null);
        ParticipatedTaskRow waiting = row(
                2, TaskStatus.OPEN, null, null, null, null);
        ParticipatedTaskRow cancelled = row(
                1, TaskStatus.CLOSED, NOW.minusSeconds(120),
                TaskClosureType.CANCELLED, null, null);
        ParticipatedTaskRow missed = new ParticipatedTaskRow(
                new TaskId(uuid(5)),
                "Missed Task",
                null,
                null,
                NOW.minusSeconds(60),
                TaskStatus.CLOSED,
                NOW,
                TaskClosureType.MISSED_SCHEDULE,
                new TaskSubmissionId(uuid(105)),
                NOW.minusSeconds(300),
                null,
                null);
        calculating = withClosesAt(calculating, NOW);
        waiting = withClosesAt(waiting, NOW.plusSeconds(600));
        when(reader.findByUser(USER_ID, null, Optional.empty(), 21))
                .thenReturn(List.of(
                        available, calculating, waiting, cancelled, missed));

        ParticipatedTaskQueryService.ParticipatedTaskPage page =
                service.findByUser(USER_ID, null, null, 20);

        assertThat(page.items()).extracting(item -> item.taskStatus())
                .containsExactly(
                        ParticipatedTaskLifecycleStatus.CLOSED,
                        ParticipatedTaskLifecycleStatus.CLOSING,
                        ParticipatedTaskLifecycleStatus.OPEN,
                        ParticipatedTaskLifecycleStatus.CANCELLED,
                        ParticipatedTaskLifecycleStatus.MISSED_SCHEDULE);
        assertThat(page.items()).extracting(item -> item.result().status())
                .containsExactly(
                        ParticipatedTaskResultStatus.AVAILABLE,
                        ParticipatedTaskResultStatus.CALCULATING,
                        ParticipatedTaskResultStatus.NOT_AVAILABLE,
                        ParticipatedTaskResultStatus.UNAVAILABLE,
                        ParticipatedTaskResultStatus.UNAVAILABLE);
        assertThat(page.items()).allMatch(item -> !item.canSubmit());
        assertThat(page.items()).allMatch(item ->
                item.participation().status()
                        == ParticipatedTaskQueryService
                        .ParticipationStatus.SUBMITTED);
        assertThat(page.items().getFirst().result().version()).isEqualTo(1);
        assertThat(page.items().getFirst().result().accessAllowed()).isTrue();
        assertThat(page.items().get(1).result().version()).isNull();
        assertThat(page.items().get(3).result().accessAllowed()).isFalse();
    }

    @Test
    void normalizesSearchAndBuildsCursorFromImmutableSubmissionOrder() {
        ParticipatedTaskRow first = row(
                3, TaskStatus.OPEN, null, null, null, null);
        ParticipatedTaskRow second = row(
                2, TaskStatus.OPEN, null, null, null, null);
        ParticipatedTaskRow lookahead = row(
                1, TaskStatus.OPEN, null, null, null, null);
        when(reader.findByUser(
                USER_ID, "vote 과업", Optional.empty(), 3))
                .thenReturn(List.of(first, second, lookahead));

        ParticipatedTaskQueryService.ParticipatedTaskPage page =
                service.findByUser(USER_ID, "  VOTE 과업  ", null, 2);

        assertThat(page.items()).extracting(item -> item.taskId())
                .containsExactly(first.taskId(), second.taskId());
        ParticipatedTaskCursor cursor = codec.decode(page.nextCursor());
        assertThat(cursor.submittedAt()).isEqualTo(second.submittedAt());
        assertThat(cursor.taskId()).isEqualTo(second.taskId());
        assertThat(cursor.queryFingerprint()).hasSize(64);
    }

    @Test
    void passesDecodedCursorAndRejectsCursorForDifferentSearch() {
        ParticipatedTaskRow first = row(
                1, TaskStatus.OPEN, null, null, null, null);
        when(reader.findByUser(
                USER_ID, "검색", Optional.empty(), 2))
                .thenReturn(List.of(first, row(
                        2, TaskStatus.OPEN, null, null, null, null)));
        String cursor = service.findByUser(
                USER_ID, "검색", null, 1).nextCursor();
        when(reader.findByUser(eq(USER_ID), eq("검색"), any(), eq(2)))
                .thenReturn(List.of());

        service.findByUser(USER_ID, "검색", cursor, 1);

        verify(reader).findByUser(
                eq(USER_ID), eq("검색"),
                org.mockito.ArgumentMatchers.argThat(Optional::isPresent),
                eq(2));
        assertThatThrownBy(() -> service.findByUser(
                USER_ID, "다른 검색", cursor, 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not match query");
    }

    @Test
    void rejectsInvalidPageAndSearchBeforeReading() {
        assertThatThrownBy(() -> service.findByUser(USER_ID, null, null, 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findByUser(
                USER_ID, null, null,
                ParticipatedTaskQueryService.MAX_SIZE + 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findByUser(
                USER_ID,
                "a".repeat(ParticipatedTaskQueryService.MAX_QUERY_LENGTH + 1),
                null,
                20))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findByUser(
                USER_ID, null, "invalid cursor", 20))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("participated task cursor is invalid");
        verify(reader, never()).findByUser(any(), any(), any(), anyInt());
    }

    private static ParticipatedTaskRow row(
            int sequence,
            TaskStatus status,
            Instant closedAt,
            TaskClosureType closureType,
            Integer resultVersion,
            Instant finalizedAt
    ) {
        Instant submittedAt = NOW.minusSeconds(sequence * 60L);
        return new ParticipatedTaskRow(
                new TaskId(uuid(sequence)),
                "Task " + sequence,
                "Description " + sequence,
                NOW.minusSeconds(3600),
                NOW.plusSeconds(600),
                status,
                closedAt,
                closureType,
                new TaskSubmissionId(uuid(sequence + 100)),
                submittedAt,
                resultVersion,
                finalizedAt);
    }

    private static ParticipatedTaskRow withClosesAt(
            ParticipatedTaskRow row,
            Instant closesAt
    ) {
        return new ParticipatedTaskRow(
                row.taskId(), row.title(), row.description(), row.openedAt(),
                closesAt, row.taskStatus(), row.closedAt(), row.closureType(),
                row.submissionId(), row.submittedAt(), row.resultVersion(),
                row.finalizedAt());
    }

    private static UUID uuid(int sequence) {
        return UUID.fromString(String.format(
                "50000000-0000-0000-0000-%012d", sequence));
    }
}
