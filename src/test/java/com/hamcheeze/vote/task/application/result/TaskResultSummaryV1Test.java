package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1.OptionCount;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskResultSummaryV1Test {

    @Test
    void rejectsOptionCountsDifferentFromResponseCount() {
        assertThatThrownBy(() -> new TaskResultSummaryV1(
                TaskResultSummaryV1.SCHEMA_VERSION,
                1,
                2,
                List.of(new OptionCount("O1", "첫 번째", 1))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("option counts must sum to responseCount");
    }
}
