package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
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
import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.USER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserTaskQueryServiceTest {

    @Mock
    private TaskRepository tasks;

    @Mock
    private TaskSubmissionRepository submissions;

    private UserTaskQueryService service;

    @BeforeEach
    void setUp() {
        service = new UserTaskQueryService(
                tasks, submissions,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void listsOnlyActuallyOpenTasksWithLatestDeadlineAndSubmissionState() {
        Task later = TaskQueryFixtures.openTask(
                "나중 마감", NOW.plusSeconds(1200));
        Task sooner = TaskQueryFixtures.openTask(
                "먼저 마감", NOW.plusSeconds(600));
        Task overdue = TaskQueryFixtures.openTask(
                "전환 지연", NOW.minusSeconds(1));
        Task scheduled = TaskQueryFixtures.scheduledTask("예약 과업");
        TaskSubmission submitted = TaskQueryFixtures.directSubmission(
                sooner, TaskQueryFixtures.failedPrediction(sooner));
        when(tasks.findAll()).thenReturn(
                List.of(later, overdue, scheduled, sooner));
        when(submissions.findByUserAndTask(USER, sooner.id()))
                .thenReturn(Optional.of(submitted));
        when(submissions.findByUserAndTask(USER, later.id()))
                .thenReturn(Optional.empty());

        List<UserTaskQueryService.UserTaskSummary> result =
                service.findOpenTasks(USER);

        assertThat(result).extracting(
                        UserTaskQueryService.UserTaskSummary::title)
                .containsExactly("먼저 마감", "나중 마감");
        assertThat(result.getFirst().closesAt())
                .isEqualTo(NOW.plusSeconds(600));
        assertThat(result.getFirst().submission().submitted()).isTrue();
        assertThat(result.getFirst().submission().submissionId())
                .isEqualTo(submitted.id());
        assertThat(result.get(1).submission().submitted()).isFalse();
    }

    @Test
    void detailHidesTaskThatIsNotOpenAtReadTime() {
        Task closed = TaskQueryFixtures.closedTask("종료 과업");
        when(tasks.findById(closed.id())).thenReturn(Optional.of(closed));

        assertThat(service.findOpenTask(USER, closed.id())).isEmpty();
    }

    @Test
    void detailIncludesContentAndExplicitSubmissionMetadata() {
        Task task = TaskQueryFixtures.openTask(
                "상세 과업", NOW.plusSeconds(600));
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(submissions.findByUserAndTask(USER, task.id()))
                .thenReturn(Optional.empty());

        UserTaskQueryService.UserTaskDetail detail = service
                .findOpenTask(USER, task.id()).orElseThrow();

        assertThat(detail.task()).isSameAs(task);
        assertThat(detail.closesAt()).isEqualTo(NOW.plusSeconds(600));
        assertThat(detail.submission().submitted()).isFalse();
    }
}
