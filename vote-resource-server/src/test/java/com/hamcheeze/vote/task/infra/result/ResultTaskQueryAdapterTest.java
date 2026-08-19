package com.hamcheeze.vote.task.infra.result;

import com.hamcheeze.vote.result.application.port.out.ResultTaskQueryPort.AnswerType;
import com.hamcheeze.vote.result.application.port.out.ResultTaskQueryPort.OptionKind;
import com.hamcheeze.vote.result.application.port.out.ResultTaskQueryPort.Status;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.taskId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ResultTaskQueryAdapterTest {

    private final TaskRepository tasks = mock(TaskRepository.class);
    private final ResultTaskQueryAdapter adapter =
            new ResultTaskQueryAdapter(tasks);

    @Test
    void returnsEmptyWhenTaskDoesNotExist() {
        when(tasks.findById(taskId())).thenReturn(Optional.empty());

        assertThat(adapter.findByTaskId(taskId().value())).isEmpty();
    }

    @Test
    void mapsTaskContentWithoutExposingTaskDomainTypes() {
        Task task = openTask();
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));

        assertThat(adapter.findByTaskId(task.id().value()))
                .get()
                .satisfies(view -> {
                    assertThat(view.taskId()).isEqualTo(task.id().value());
                    assertThat(view.title()).isEqualTo(task.title());
                    assertThat(view.description())
                            .isEqualTo(task.description());
                    assertThat(view.status()).isEqualTo(Status.OPEN);
                    assertThat(view.openedAt()).isEqualTo(task.openedAt());
                    assertThat(view.closedAt()).isNull();
                    assertThat(view.questions()).hasSize(3);
                    assertThat(view.questions().getFirst().answerType())
                            .isEqualTo(AnswerType.SINGLE_CHOICE);
                    assertThat(view.questions().getFirst().options())
                            .hasSize(2)
                            .allSatisfy(option -> assertThat(option.kind())
                                    .isEqualTo(OptionKind.STANDARD));
                    assertThat(view.questions().get(1).answerType())
                            .isEqualTo(AnswerType.MULTIPLE_CHOICE);
                    assertThat(view.questions().get(2).answerType())
                            .isEqualTo(AnswerType.SHORT_TEXT);
                });
    }
}
