package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskProgressResponseReader;
import com.hamcheeze.vote.task.application.port.out.TaskProgressResponseReader.SubmissionCursor;
import com.hamcheeze.vote.task.application.port.out.TaskProgressResponseReader.SubmissionRow;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaskProgressResponsesQueryServiceTest {

    @Mock
    private TaskRepository tasks;

    @Mock
    private TaskProgressResponseReader responses;

    private TaskProgressResponsesQueryService service;

    @BeforeEach
    void setUp() {
        service = new TaskProgressResponsesQueryService(
                tasks, responses, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void returnsAnonymousResponsesWithOptionContentAndCheckpointCursor() {
        Task task = TaskQueryFixtures.openTask(
                "진행 중 과업", NOW.plusSeconds(600));
        var options = task.questions().getFirst().options();
        SubmissionRow first = row(
                1, options.getFirst().id(), TaskReasonSource.AI_ACCEPTED,
                "AI 예상 이유를 채택했습니다.", NOW.minusSeconds(20));
        SubmissionRow second = row(
                2, options.getLast().id(), TaskReasonSource.USER_WRITTEN,
                "직접 작성한 이유입니다.", NOW.minusSeconds(10));
        SubmissionRow extra = row(
                3, options.getFirst().id(), TaskReasonSource.USER_WRITTEN,
                "다음 페이지 응답입니다.", NOW.minusSeconds(5));
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(responses.findByTask(
                task.id(), Optional.empty(), 3))
                .thenReturn(List.of(first, second, extra));

        var page = service.findByTaskId(
                task.id(), null, 2).orElseThrow();

        assertThat(page.taskId()).isEqualTo(task.id());
        assertThat(page.status()).isEqualTo(task.status());
        assertThat(page.observedAt()).isEqualTo(NOW);
        assertThat(page.hasMore()).isTrue();
        assertThat(page.nextCursor()).isNotBlank();
        assertThat(page.responses()).hasSize(2);
        assertThat(page.responses().getFirst().selectedOptionContent())
                .isEqualTo(options.getFirst().content());
        assertThat(page.responses().getFirst().reasonSource())
                .isEqualTo(TaskReasonSource.AI_ACCEPTED);
        assertThat(page.responses().getFirst().reason())
                .isEqualTo(first.finalReason());

        SubmissionCursor expectedCursor = new SubmissionCursor(
                task.id(), second.submittedAt(), second.submissionId());
        when(responses.findByTask(
                task.id(), Optional.of(expectedCursor), 3))
                .thenReturn(List.of(extra));

        var nextPage = service.findByTaskId(
                task.id(), page.nextCursor(), 2).orElseThrow();

        assertThat(nextPage.responses()).hasSize(1);
        assertThat(nextPage.responses().getFirst().reason())
                .isEqualTo(extra.finalReason());
        assertThat(nextPage.hasMore()).isFalse();
    }

    @Test
    void rejectsProgressResponsesForTasksThatAreNotOpen() {
        Task task = TaskQueryFixtures.scheduledTask("예약 과업");
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> service.findByTaskId(task.id(), null, 10))
                .isInstanceOf(TaskDomainException.class)
                .satisfies(exception -> assertThat(
                        ((TaskDomainException) exception).violation().code())
                        .isEqualTo("TASK_PROGRESS_RESPONSES_NOT_AVAILABLE"));
        verify(responses, never()).findByTask(
                task.id(), Optional.empty(), 11);
    }

    @Test
    void missingTaskDoesNotReadResponses() {
        TaskId taskId = TaskQueryFixtures.draftTask("없는 과업").id();
        when(tasks.findById(taskId)).thenReturn(Optional.empty());

        assertThat(service.findByTaskId(taskId, null, 10)).isEmpty();
        verify(responses, never()).findByTask(
                taskId, Optional.empty(), 11);
    }

    @Test
    void rejectsMalformedCursorAndInvalidLimit() {
        Task task = TaskQueryFixtures.openTask(
                "진행 중 과업", NOW.plusSeconds(600));
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> service.findByTaskId(
                task.id(), "not-a-cursor", 10))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("task progress responses cursor is invalid");
        assertThatThrownBy(() -> service.findByTaskId(task.id(), null, 101))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("between 1 and 100");
    }

    @Test
    void rejectsSubmissionThatReferencesUnknownOption() {
        Task task = TaskQueryFixtures.openTask(
                "진행 중 과업", NOW.plusSeconds(600));
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(responses.findByTask(task.id(), Optional.empty(), 11))
                .thenReturn(List.of(row(
                        1, new TaskOptionId(UUID.randomUUID()),
                        TaskReasonSource.USER_WRITTEN,
                        "알 수 없는 선택지", NOW)));

        assertThatThrownBy(() -> service.findByTaskId(task.id(), null, 10))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("submission references an unknown task option");
    }

    private static SubmissionRow row(
            int suffix,
            TaskOptionId optionId,
            TaskReasonSource reasonSource,
            String reason,
            Instant submittedAt
    ) {
        return new SubmissionRow(
                new TaskSubmissionId(UUID.fromString(String.format(
                        "70000000-0000-0000-0000-%012d", suffix))),
                optionId, reasonSource, reason, submittedAt);
    }
}
