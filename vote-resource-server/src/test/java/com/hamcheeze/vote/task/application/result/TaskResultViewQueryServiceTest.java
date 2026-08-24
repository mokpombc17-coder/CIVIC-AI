package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultResponseReader;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaskResultViewQueryServiceTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-24T00:00:00Z");
    private static final Instant CLOSED_AT =
            Instant.parse("2026-08-24T00:20:00Z");
    private static final TaskQuestionId QUESTION_ID =
            new TaskQuestionId(uuid(100));
    private static final TaskOptionId OPTION_ID =
            new TaskOptionId(uuid(200));

    @Mock
    private TaskRepository tasks;

    @Mock
    private TaskResultResponseReader responses;

    private TaskResultViewQueryService service;

    @BeforeEach
    void setUp() {
        service = new TaskResultViewQueryService(
                tasks,
                responses,
                new TaskResultViewV1Assembler());
    }

    @Test
    void loadsFinalizedTaskAndMinimalResponsesIntoResultView() {
        Task task = closedTask();
        TaskResultResponse response = new TaskResultResponse(
                new TaskSubmissionId(uuid(300)),
                task.id(),
                QUESTION_ID,
                OPTION_ID,
                "선택 이유",
                TaskReasonSource.USER_WRITTEN,
                CLOSED_AT.minusSeconds(1));
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(responses.findByTaskId(task.id()))
                .thenReturn(List.of(response));

        TaskResultViewV1 result = service.findByTaskId(task.id())
                .orElseThrow();

        assertThat(result.resultVersion()).isEqualTo(1);
        assertThat(result.responses()).singleElement()
                .satisfies(mapped -> {
                    assertThat(mapped.sequence()).isEqualTo(1);
                    assertThat(mapped.selectedOptionDisplayOrder())
                            .isEqualTo(1);
                    assertThat(mapped.reason()).isEqualTo("선택 이유");
                });
    }

    @Test
    void missingTaskDoesNotReadResponses() {
        TaskId taskId = new TaskId(uuid(999));
        when(tasks.findById(taskId)).thenReturn(Optional.empty());

        assertThat(service.findByTaskId(taskId)).isEmpty();

        verifyNoInteractions(responses);
    }

    private Task closedTask() {
        Task task = Task.draft(
                new TaskId(uuid(1)),
                "결과 과업",
                null,
                List.of(new TaskQuestion(
                        QUESTION_ID,
                        1,
                        TaskQuestionType.SINGLE_CHOICE,
                        "선호 선택지",
                        null,
                        new SingleChoiceConstraint(),
                        List.of(
                                TaskOption.standard(
                                        OPTION_ID, 1, "첫 번째"),
                                TaskOption.standard(
                                        new TaskOptionId(uuid(201)),
                                        2,
                                        "두 번째")))),
                CREATED_AT);
        task.openImmediately(
                new TaskLifecycleHistoryId(uuid(400)),
                CLOSED_AT.plusSeconds(3_600),
                new TaskActorId("admin"),
                null,
                CREATED_AT.plusSeconds(1));
        task.closeEarly(
                new TaskLifecycleHistoryId(uuid(401)),
                new TaskActorId("admin"),
                null,
                CLOSED_AT);
        return task;
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
