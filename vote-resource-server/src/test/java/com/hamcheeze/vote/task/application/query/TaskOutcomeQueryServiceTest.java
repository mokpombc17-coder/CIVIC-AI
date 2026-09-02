package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskOutcomeReader;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskOutcomeQueryServiceTest {

    private static final TaskId TASK_ID = new TaskId(UUID.fromString(
            "10000000-0000-0000-0000-000000000001"));

    private final TaskRepository tasks = mock(TaskRepository.class);
    private final TaskOutcomeReader outcomes = mock(TaskOutcomeReader.class);
    private final TaskOutcomeCursorCodec cursors =
            new TaskOutcomeCursorCodec();
    private final TaskOutcomeQueryService service =
            new TaskOutcomeQueryService(tasks, outcomes, cursors);

    @Test
    void returnsChronologicalPageAndCheckpointCursor() {
        when(tasks.findById(TASK_ID)).thenReturn(Optional.of(mock(Task.class)));
        TaskOutcomeView first = outcome(1, "2026-09-02T04:00:00Z");
        TaskOutcomeView second = outcome(2, "2026-09-02T04:01:00Z");
        TaskOutcomeView extra = outcome(3, "2026-09-02T04:02:00Z");
        when(outcomes.findByTask(eq(TASK_ID), eq(Optional.empty()), eq(3)))
                .thenReturn(List.of(first, second, extra));

        TaskOutcomeQueryService.TaskOutcomePage page = service.findByTask(
                TASK_ID, null, 2).orElseThrow();

        assertThat(page.items()).containsExactly(first, second);
        assertThat(page.hasMore()).isTrue();
        assertThat(page.nextCursor()).isNotBlank();
        assertThat(cursors.decode(page.nextCursor()))
                .isEqualTo(new TaskOutcomeCursor(
                        TASK_ID, second.submittedAt(), second.outcomeId()));
    }

    @Test
    void rejectsCursorIssuedForAnotherTask() {
        when(tasks.findById(TASK_ID)).thenReturn(Optional.of(mock(Task.class)));
        String cursor = cursors.encode(new TaskOutcomeCursor(
                new TaskId(UUID.fromString(
                        "10000000-0000-0000-0000-000000000002")),
                Instant.parse("2026-09-02T04:00:00Z"),
                new TaskSubmissionId(UUID.fromString(
                        "20000000-0000-0000-0000-000000000001"))));

        assertThatThrownBy(() -> service.findByTask(TASK_ID, cursor, 10))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("task outcome cursor does not match task");
    }

    @Test
    void distinguishesUnknownTaskFromEmptyOutcomePage() {
        when(tasks.findById(TASK_ID)).thenReturn(Optional.empty());

        assertThat(service.findByTask(TASK_ID, null, 10)).isEmpty();
        verify(outcomes, never()).findByTask(any(), any(), any(Integer.class));
    }

    @Test
    void findsOneOutcomeByExternalPersonaId() {
        TaskPersonaId personaId = new TaskPersonaId("persona-01");
        TaskOutcomeView expected = outcome(1, "2026-09-02T04:00:00Z");
        when(outcomes.findByTaskAndPersona(TASK_ID, personaId))
                .thenReturn(Optional.of(expected));

        assertThat(service.findByTaskAndPersona(TASK_ID, personaId))
                .contains(expected);
    }

    private static TaskOutcomeView outcome(int suffix, String submittedAt) {
        return new TaskOutcomeView(
                new TaskSubmissionId(UUID.fromString(String.format(
                        "20000000-0000-0000-0000-%012d", suffix))),
                new TaskPersonaId("persona-01"),
                new TaskPredictionId(UUID.fromString(
                        "30000000-0000-0000-0000-000000000001")),
                TASK_ID,
                new TaskQuestionId(UUID.fromString(
                        "40000000-0000-0000-0000-000000000001")),
                new TaskOptionId(UUID.fromString(
                        "50000000-0000-0000-0000-000000000001")),
                TaskReasonSource.AI_ACCEPTED,
                new TaskPredictedReasonId(UUID.fromString(
                        "60000000-0000-0000-0000-000000000001")),
                "확정 이유",
                Instant.parse(submittedAt));
    }
}
