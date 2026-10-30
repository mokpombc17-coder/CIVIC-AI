package com.hamcheeze.vote.task.infra.opinionmap;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRequest;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationProvider;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationGateway;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaSummary;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.GenerationStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.OptionSummary;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.opinion-map",
        name = "provider",
        havingValue = "fake")
final class FakeOpinionMapGenerationGateway
        implements OpinionMapGenerationGateway {

    @Override
    public OpinionMapGenerationProvider provider() {
        return new OpinionMapGenerationProvider("fake", "fake");
    }

    @Override
    public OpinionMapOptionExplanationV1 generate(
            OpinionMapGenerationRequest request
    ) {
        TaskResultForLlmV1 input = request.input();
        List<OptionSummary> summaries = input.options().stream()
                .map(option -> new OptionSummary(
                        option.key(),
                        area(input, List.of(option.key()), true),
                        area(
                                input,
                                input.options().stream()
                                        .map(TaskResultForLlmV1.OptionData::key)
                                        .filter(key -> !key.equals(option.key()))
                                        .toList(),
                                false)))
                .toList();
        return new OpinionMapOptionExplanationV1(
                OpinionMapOptionExplanationV1.SCHEMA_VERSION,
                input.taskId().value(),
                input.resultVersion(),
                GenerationStatus.COMPLETED,
                null,
                summaries);
    }

    private static AreaSummary area(
            TaskResultForLlmV1 input,
            List<String> candidateKeys,
            boolean sameChoice
    ) {
        List<TaskResultForLlmV1.ResponseData> responses = input.responses()
                .stream()
                .filter(response -> candidateKeys.contains(
                        response.selectedOptionKey()))
                .toList();
        if (responses.isEmpty()) {
            return new AreaSummary(
                    AreaStatus.NO_RESPONSES, List.of(), null);
        }
        List<String> sourceKeys = candidateKeys.stream()
                .filter(key -> responses.stream().anyMatch(response ->
                        response.selectedOptionKey().equals(key)
                                && response.reason() != null
                                && !response.reason().isBlank()))
                .toList();
        if (sourceKeys.isEmpty()) {
            return new AreaSummary(
                    AreaStatus.INSUFFICIENT_REASON, List.of(), null);
        }
        return new AreaSummary(
                AreaStatus.AVAILABLE,
                sourceKeys,
                sameChoice
                        ? "같은 선택을 한 응답자들의 테스트 요약이야."
                        : "다른 선택을 한 응답자들의 테스트 요약이야.");
    }
}
