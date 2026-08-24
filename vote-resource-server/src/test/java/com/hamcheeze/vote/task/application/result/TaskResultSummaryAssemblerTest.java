package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1.OptionCount;
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

import static org.assertj.core.api.Assertions.assertThat;

class TaskResultSummaryAssemblerTest {

    private final TaskResultSummaryAssembler assembler =
            new TaskResultSummaryAssembler();

    @Test
    void countsEveryResponseAndKeepsUnselectedOptions() {
        TaskResultSummaryV1 summary = assembler.assemble(view());

        assertThat(summary.schemaVersion())
                .isEqualTo(TaskResultSummaryV1.SCHEMA_VERSION);
        assertThat(summary.resultVersion()).isEqualTo(1);
        assertThat(summary.responseCount()).isEqualTo(3);
        assertThat(summary.options()).containsExactly(
                new OptionCount("O1", "첫 번째", 1),
                new OptionCount("O2", "두 번째", 2),
                new OptionCount("O3", "세 번째", 0));
    }

    private static TaskResultViewV1 view() {
        return new TaskResultViewV1(
                TaskResultViewV1.RESULT_VERSION,
                Instant.parse("2026-08-24T00:00:00Z"),
                TaskClosureType.EARLY_CLOSED,
                new TaskData("결과 과업", null),
                new QuestionData(
                        TaskQuestionType.SINGLE_CHOICE,
                        "어떤 선택지를 선호하나요?",
                        null),
                List.of(
                        new OptionData(1, "첫 번째"),
                        new OptionData(2, "두 번째"),
                        new OptionData(3, "세 번째")),
                List.of(
                        response(1, 2),
                        response(2, 1),
                        response(3, 2)));
    }

    private static ResponseData response(
            int participantSequence,
            int selectedOptionDisplayOrder
    ) {
        return new ResponseData(
                participantSequence,
                selectedOptionDisplayOrder,
                "선택 이유 " + participantSequence,
                TaskReasonSource.USER_WRITTEN);
    }
}
