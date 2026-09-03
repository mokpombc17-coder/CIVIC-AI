package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskProgressSummaryReader;
import com.hamcheeze.vote.task.application.port.out.TaskProgressSummaryReader.OptionSubmissionCount;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaskProgressSummaryQueryServiceTest {

    @Mock
    private TaskRepository tasks;

    @Mock
    private TaskProgressSummaryReader progress;

    private TaskProgressSummaryQueryService service;

    @BeforeEach
    void setUp() {
        service = new TaskProgressSummaryQueryService(
                tasks, progress, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void returnsOrderedAggregateCountsWithoutLoadingSubmissionDetails() {
        Task task = TaskQueryFixtures.openTask(
                "진행 중 과업", NOW.plusSeconds(600));
        var options = task.questions().getFirst().options();
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(progress.countSelections(task.id())).thenReturn(List.of(
                new OptionSubmissionCount(options.getFirst().id(), 2),
                new OptionSubmissionCount(options.getLast().id(), 1)));

        var summary = service.findByTaskId(task.id()).orElseThrow();

        assertThat(summary.taskId()).isEqualTo(task.id());
        assertThat(summary.status()).isEqualTo(task.status());
        assertThat(summary.observedAt()).isEqualTo(NOW);
        assertThat(summary.submissionCount()).isEqualTo(3);
        assertThat(summary.options())
                .extracting(option -> option.optionId())
                .containsExactly(
                        options.getFirst().id(), options.getLast().id());
        assertThat(summary.options())
                .extracting(option -> option.count())
                .containsExactly(2L, 1L);
        assertThat(summary.options().getFirst().rate())
                .isEqualTo(2.0 / 3.0);
        assertThat(summary.options().getLast().rate())
                .isEqualTo(1.0 / 3.0);
    }

    @Test
    void includesEveryOptionWithZeroCountsWhenNobodySubmitted() {
        Task task = TaskQueryFixtures.openTask(
                "응답 없는 과업", NOW.plusSeconds(600));
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(progress.countSelections(task.id())).thenReturn(List.of());

        var summary = service.findByTaskId(task.id()).orElseThrow();

        assertThat(summary.submissionCount()).isZero();
        assertThat(summary.options())
                .allSatisfy(option -> {
                    assertThat(option.count()).isZero();
                    assertThat(option.rate()).isZero();
                });
    }

    @Test
    void rejectsProgressForTasksThatAreNotOpen() {
        Task task = TaskQueryFixtures.scheduledTask("예약 과업");
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> service.findByTaskId(task.id()))
                .isInstanceOf(TaskDomainException.class)
                .satisfies(exception -> assertThat(
                        ((TaskDomainException) exception).violation().code())
                        .isEqualTo("TASK_PROGRESS_SUMMARY_NOT_AVAILABLE"));
        verify(progress, never()).countSelections(task.id());
    }

    @Test
    void missingTaskDoesNotReadSubmissionCounts() {
        TaskId taskId = TaskQueryFixtures.draftTask("없는 과업").id();
        when(tasks.findById(taskId)).thenReturn(Optional.empty());

        assertThat(service.findByTaskId(taskId)).isEmpty();
        verify(progress, never()).countSelections(taskId);
    }
}
