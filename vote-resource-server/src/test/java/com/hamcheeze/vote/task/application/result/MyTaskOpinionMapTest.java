package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.result.MyTaskOpinionMap.AreaStatus;
import com.hamcheeze.vote.task.application.result.MyTaskOpinionMap.Status;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaSummary;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.GenerationStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.OptionSummary;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MyTaskOpinionMapTest {

    @Test
    void projectsOnlyTheCurrentUsersSelectedOption() {
        MyTaskOpinionMap opinionMap = MyTaskOpinionMap.available(
                completedExplanation(), 2);

        assertThat(opinionMap.status()).isEqualTo(Status.AVAILABLE);
        assertThat(opinionMap.sameChoice().status())
                .isEqualTo(AreaStatus.AVAILABLE);
        assertThat(opinionMap.sameChoice().body())
                .isEqualTo("O2를 선택한 사람들의 이유입니다.");
        assertThat(opinionMap.otherChoices().status())
                .isEqualTo(AreaStatus.INSUFFICIENT_REASON);
        assertThat(opinionMap.otherChoices().body()).isNull();
    }

    @Test
    void pendingAndUnavailableDoNotExposeAreas() {
        assertThat(MyTaskOpinionMap.pending())
                .isEqualTo(new MyTaskOpinionMap(
                        Status.PENDING, null, null));
        assertThat(MyTaskOpinionMap.unavailable())
                .isEqualTo(new MyTaskOpinionMap(
                        Status.UNAVAILABLE, null, null));
    }

    @Test
    void rejectsAnExplanationWithoutTheSelectedOption() {
        assertThatThrownBy(() -> MyTaskOpinionMap.available(
                completedExplanation(), 3))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("selected option summary");
    }

    private static OpinionMapOptionExplanationV1 completedExplanation() {
        return new OpinionMapOptionExplanationV1(
                OpinionMapOptionExplanationV1.SCHEMA_VERSION,
                new UUID(0, 1),
                1,
                GenerationStatus.COMPLETED,
                null,
                List.of(
                        new OptionSummary(
                                "O1",
                                available("O1", "O1을 선택한 이유입니다."),
                                available("O2", "O2를 선택한 이유입니다.")),
                        new OptionSummary(
                                "O2",
                                available(
                                        "O2",
                                        "O2를 선택한 사람들의 이유입니다."),
                                new AreaSummary(
                                        OpinionMapOptionExplanationV1.AreaStatus
                                                .INSUFFICIENT_REASON,
                                        List.of(),
                                        null))));
    }

    private static AreaSummary available(String optionKey, String body) {
        return new AreaSummary(
                OpinionMapOptionExplanationV1.AreaStatus.AVAILABLE,
                List.of(optionKey),
                body);
    }
}
