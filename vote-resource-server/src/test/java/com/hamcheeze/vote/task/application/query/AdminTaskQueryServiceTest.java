package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminTaskQueryServiceTest {

    @Mock
    private TaskRepository tasks;

    private AdminTaskQueryService service;

    @BeforeEach
    void setUp() {
        service = new AdminTaskQueryService(tasks);
    }

    @Test
    void listsEveryTaskStateWithoutLoadingPersonalSubmissions() {
        Task draft = Task.draft(
                new TaskId(UUID.randomUUID()),
                "빈 초안",
                null,
                List.of(),
                NOW.minusSeconds(60));
        Task scheduled = TaskQueryFixtures.scheduledTask("예약");
        Task open = TaskQueryFixtures.openTask(
                "진행", NOW.plusSeconds(600));
        Task closed = TaskQueryFixtures.closedTask("종료");
        when(tasks.findAll()).thenReturn(
                List.of(draft, scheduled, open, closed));

        var result = service.findAll();

        assertThat(result).extracting(
                        AdminTaskQueryService.AdminTaskSummary::status)
                .containsExactly(
                        TaskStatus.DRAFT,
                        TaskStatus.SCHEDULED,
                        TaskStatus.OPEN,
                        TaskStatus.CLOSED);
        assertThat(result.getLast().closureType())
                .isEqualTo(TaskClosureType.DEADLINE_REACHED);
        assertThat(result.getFirst().questionCount()).isZero();
    }

    @Test
    void detailContainsCurrentScheduleClosureAndOrderedHistory() {
        Task task = TaskQueryFixtures.openTask(
                "조기 종료", NOW.plusSeconds(600));
        TaskLifecycleHistory history = task.closeEarly(
                new TaskLifecycleHistoryId(UUID.randomUUID()),
                new TaskActorId("admin"),
                "운영 종료",
                NOW);
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(tasks.findLifecycleHistory(task.id()))
                .thenReturn(List.of(history));

        var detail = service.findById(task.id()).orElseThrow();

        assertThat(detail.task().status()).isEqualTo(TaskStatus.CLOSED);
        assertThat(detail.task().closureType())
                .isEqualTo(TaskClosureType.EARLY_CLOSED);
        assertThat(detail.lifecycleHistory()).containsExactly(history);
    }

    @Test
    void missingTaskDoesNotQueryHistory() {
        Task task = TaskQueryFixtures.draftTask("없음");
        when(tasks.findById(task.id())).thenReturn(Optional.empty());

        assertThat(service.findById(task.id())).isEmpty();
    }
}
