package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskResultViewV1Test {

    private static final Instant CLOSED_AT =
            Instant.parse("2026-08-24T01:00:00Z");

    @Test
    void supportsOnlyResultEligibleSingleChoiceTasks() {
        assertThatThrownBy(() -> view(
                TaskClosureType.CANCELLED,
                question(TaskQuestionType.SINGLE_CHOICE),
                options(),
                responses()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("closureType must be result eligible");

        assertThatThrownBy(() -> question(TaskQuestionType.MULTIPLE_CHOICE))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage(
                        "task-result-view/v1 supports SINGLE_CHOICE only");
    }

    @Test
    void requiresCanonicalOrderAndExistingOptionReferences() {
        assertThatThrownBy(() -> view(
                TaskClosureType.DEADLINE_REACHED,
                question(TaskQuestionType.SINGLE_CHOICE),
                List.of(new OptionData(2, "두 번째부터 시작")),
                List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage(
                        "options must use continuous displayOrder from 1");

        assertThatThrownBy(() -> view(
                TaskClosureType.DEADLINE_REACHED,
                question(TaskQuestionType.SINGLE_CHOICE),
                options(),
                List.of(response(1, 3, CLOSED_AT.minusSeconds(1)))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("response selected option must exist");

        assertThatThrownBy(() -> view(
                TaskClosureType.DEADLINE_REACHED,
                question(TaskQuestionType.SINGLE_CHOICE),
                options(),
                List.of(response(2, 1, CLOSED_AT.minusSeconds(1)))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage(
                        "responses must use continuous sequence from 1");

        assertThatThrownBy(() -> view(
                TaskClosureType.DEADLINE_REACHED,
                question(TaskQuestionType.SINGLE_CHOICE),
                options(),
                List.of(response(1, 1, CLOSED_AT.plusSeconds(1)))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage(
                        "response submittedAt must not be after closedAt");
    }

    private TaskResultViewV1 view(
            TaskClosureType closureType,
            QuestionData question,
            List<OptionData> options,
            List<ResponseData> responses
    ) {
        return new TaskResultViewV1(
                1,
                CLOSED_AT,
                closureType,
                new TaskData("제목", null),
                question,
                options,
                responses);
    }

    private QuestionData question(TaskQuestionType type) {
        return new QuestionData(type, "질문", null);
    }

    private List<OptionData> options() {
        return List.of(
                new OptionData(1, "첫 번째"),
                new OptionData(2, "두 번째"));
    }

    private List<ResponseData> responses() {
        return List.of(response(1, 1, CLOSED_AT.minusSeconds(1)));
    }

    private ResponseData response(
            int sequence,
            int selectedOptionDisplayOrder,
            Instant submittedAt
    ) {
        return new ResponseData(
                sequence,
                selectedOptionDisplayOrder,
                "선택 이유",
                TaskReasonSource.USER_WRITTEN,
                submittedAt);
    }
}
